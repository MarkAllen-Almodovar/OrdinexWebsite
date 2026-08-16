/**
 * src/admin/concern-table.js
 *
 * Community Concern Management section for the admin SPA.
 * Lazy-loaded by admin/app.js via `init(container, uid)`.
 *
 * Exported pure functions (also used by unit/property tests):
 *  - applyFilters(reports, { status, category, search })
 *  - paginateReports(reports, page, pageSize)
 */

import { db } from '../shared/firebase.js';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  updateDoc,
  addDoc,
  getDocs,
  doc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { statusBadge, formatDate, showToast } from '../shared/ui-helpers.js';

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Pure exported functions
// ---------------------------------------------------------------------------

/**
 * Filter a reports array according to status, category and search criteria.
 *
 * @param {Object[]} reports         - Source array (not mutated).
 * @param {Object}   filters
 * @param {string}   [filters.status='All']    - Exact status match or 'All'.
 * @param {string}   [filters.category='All']  - Exact category match or 'All'.
 * @param {string}   [filters.search='']       - Case-insensitive substring match
 *                                               against description OR residentName.
 * @returns {Object[]} New filtered array.
 */
export function applyFilters(reports, { status = 'All', category = 'All', search = '' } = {}) {
  const needle = search.trim().toLowerCase();

  return reports.filter((report) => {
    if (status !== 'All' && report.status !== status) return false;
    if (category !== 'All' && report.category !== category) return false;
    if (needle) {
      const inDescription  = (report.description  ?? '').toLowerCase().includes(needle);
      const inResident     = (report.userName ?? report.residentName ?? '').toLowerCase().includes(needle);
      const inReference    = (report.reportReference ?? '').toLowerCase().includes(needle);
      if (!inDescription && !inResident && !inReference) return false;
    }
    return true;
  });
}

/**
 * Return a single page of reports.
 *
 * @param {Object[]} reports   - Filtered source array.
 * @param {number}   page      - 1-indexed page number.
 * @param {number}   [pageSize=20]
 * @returns {Object[]} Slice of the array for the requested page.
 */
export function paginateReports(reports, page, pageSize = PAGE_SIZE) {
  const start = (page - 1) * pageSize;
  return reports.slice(start, start + pageSize);
}

// ---------------------------------------------------------------------------
// HTML template
// ---------------------------------------------------------------------------

const SECTION_HTML = `
<div class="concern-section">
  <h1 class="section-title">Community Concern Management</h1>
  <div class="filters-bar">
    <select id="filter-status">
      <option value="All">All Statuses</option>
      <option value="Pending">Pending</option>
      <option value="Ongoing">Ongoing</option>
      <option value="Completed">Completed</option>
    </select>
    <select id="filter-category">
      <option value="All">All Categories</option>
      <option>Improper Garbage Disposal</option>
      <option>Illegal Parking</option>
      <option>Noise Disturbances</option>
      <option>Public Disturbance</option>
      <option>Others</option>
    </select>
    <input type="text" id="filter-search" placeholder="Search by resident or description..." />
  </div>
  <div class="table-wrapper">
    <table class="concern-table" id="concern-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Resident</th>
          <th>Category</th>
          <th>Description</th>
          <th>Date</th>
          <th>Evidence</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody id="concern-tbody"></tbody>
    </table>
  </div>
  <div class="concern-cards" id="concern-cards"></div>
  <button class="btn btn--primary" id="load-more-btn" style="display:none">Load More</button>
</div>
<div id="concern-detail-modal" class="modal-overlay" role="dialog" aria-modal="true" hidden>
  <div class="modal modal--wide">
    <button class="modal__close" id="close-concern-modal" aria-label="Close">×</button>
    <h2 class="modal__title" id="concern-modal-title">Report Details</h2>
    <div id="concern-modal-body"></div>
  </div>
</div>
`;

// ---------------------------------------------------------------------------
// Module-level state (reset on every init call)
// ---------------------------------------------------------------------------

let allReports      = [];
let currentFilters  = { status: 'All', category: 'All', search: '' };
let currentPage     = 1;
let unsubscribe     = null;   // Firestore listener cleanup
let currentUid      = null;   // Admin UID for status-history writes
let activeDropdown  = null;   // Currently open actions dropdown element

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

/**
 * Build a single <tr> for the concern table.
 *
 * @param {Object} report  - Firestore doc data + { id }.
 * @param {number} rowNum  - 1-based display number.
 * @returns {HTMLTableRowElement}
 */
function buildRow(report, rowNum) {
  const tr = document.createElement('tr');
  tr.dataset.id = report.id;

  // # column
  const tdNum = document.createElement('td');
  tdNum.textContent = rowNum;
  tr.appendChild(tdNum);

  // Resident
  const tdResident = document.createElement('td');
  tdResident.className = 'resident-cell';
  const residentName = report.userName ?? report.residentName ?? '—';
  tdResident.innerHTML = `
    <span class="resident-name">${residentName}</span>
    ${report.reportReference ? `<br><span class="resident-barangay">${escapeHtml(report.reportReference)}</span>` : ''}
  `;
  tr.appendChild(tdResident);

  // Category
  const tdCategory = document.createElement('td');
  tdCategory.className = 'category-cell';
  tdCategory.textContent = report.category ?? '—';
  tr.appendChild(tdCategory);

  // Description (first 80 chars)
  const tdDesc = document.createElement('td');
  const desc = report.description ?? '';
  tdDesc.textContent = desc.length > 80 ? desc.slice(0, 80) + '…' : desc;
  tr.appendChild(tdDesc);

  // Date
  const tdDate = document.createElement('td');
  tdDate.textContent = report.submittedAt ? formatDate(report.submittedAt) : '—';
  tr.appendChild(tdDate);

  // Evidence thumbnail
  const tdImage = document.createElement('td');
  if (report.imageUrl) {
    const img = document.createElement('img');
    img.className = 'thumb';
    img.src = report.imageUrl;
    img.alt = 'Photo evidence';
    img.loading = 'lazy';
    img.title = 'Photo evidence — click View Full Details to see full size';
    tdImage.appendChild(img);
  } else if (report.videoUrl) {
    const placeholder = document.createElement('span');
    placeholder.className = 'thumb-placeholder';
    placeholder.setAttribute('aria-label', 'Video evidence');
    placeholder.title = 'Video evidence';
    placeholder.textContent = '🎥';
    tdImage.appendChild(placeholder);
  } else {
    const placeholder = document.createElement('span');
    placeholder.className = 'thumb-placeholder thumb-placeholder--none';
    placeholder.setAttribute('aria-label', 'No evidence submitted');
    placeholder.title = 'No evidence submitted';
    placeholder.textContent = '�️';
    tdImage.appendChild(placeholder);
  }
  tr.appendChild(tdImage);

  // Status badge cell
  const tdStatus = document.createElement('td');
  tdStatus.className = 'status-cell';
  tdStatus.appendChild(statusBadge(report.status ?? 'Pending'));
  tr.appendChild(tdStatus);

  // Actions cell
  const tdActions = document.createElement('td');
  tdActions.className = 'actions-cell';
  tdActions.appendChild(buildActionsButton(report, tdStatus, tdCategory));
  tr.appendChild(tdActions);

  return tr;
}

/**
 * Build an actions button + dropdown for a report row.
 *
 * @param {Object}      report   - Report data with `.id`.
 * @param {HTMLElement} statusCell - The <td> holding the status badge (for optimistic UI).
 * @returns {HTMLElement} Wrapper containing the button (dropdown appended on click).
 */
function buildActionsButton(report, statusCell, categoryCell) {
  const wrapper = document.createElement('div');
  wrapper.style.position = 'relative';

  const btn = document.createElement('button');
  btn.className = 'actions-btn';
  btn.type = 'button';
  btn.textContent = 'Actions ▾';
  btn.setAttribute('aria-haspopup', 'true');
  btn.setAttribute('aria-expanded', 'false');

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDropdown(report, statusCell, categoryCell, wrapper, btn);
  });

  wrapper.appendChild(btn);
  return wrapper;
}

/**
 * Open or close the actions dropdown for the given report.
 */
function toggleDropdown(report, statusCell, categoryCell, wrapper, triggerBtn) {
  // Close any existing open dropdown
  if (activeDropdown && activeDropdown !== wrapper.querySelector('.actions-dropdown')) {
    closeActiveDropdown();
  }

  const existing = wrapper.querySelector('.actions-dropdown');
  if (existing) {
    existing.remove();
    triggerBtn.setAttribute('aria-expanded', 'false');
    activeDropdown = null;
    return;
  }

  const dropdown = document.createElement('div');
  dropdown.className = 'actions-dropdown';

  // ── View Full Details ─────────────────────────────────────────────────────
  const viewBtn = document.createElement('button');
  viewBtn.type = 'button';
  viewBtn.textContent = 'View Full Details';
  viewBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeActiveDropdown();
    openDetailModal(report);
  });

  // ── Change Status ─────────────────────────────────────────────────────────
  const changeStatusBtn = document.createElement('button');
  changeStatusBtn.type = 'button';
  changeStatusBtn.textContent = 'Change Status';
  changeStatusBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeActiveDropdown();
    showInlineStatusSelect(report, statusCell);
  });

  // ── Change Category ───────────────────────────────────────────────────────
  const changeCategoryBtn = document.createElement('button');
  changeCategoryBtn.type = 'button';
  changeCategoryBtn.textContent = 'Change Category';
  changeCategoryBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeActiveDropdown();
    showInlineCategorySelect(report, categoryCell);
  });

  // ── Delete ────────────────────────────────────────────────────────────────
  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.textContent = '🗑 Delete Report';
  deleteBtn.className = 'actions-dropdown__delete';
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeActiveDropdown();
    confirmDeleteReport(report);
  });

  dropdown.appendChild(viewBtn);
  dropdown.appendChild(changeStatusBtn);
  dropdown.appendChild(changeCategoryBtn);
  dropdown.appendChild(deleteBtn);
  wrapper.appendChild(dropdown);
  triggerBtn.setAttribute('aria-expanded', 'true');
  activeDropdown = dropdown;
}

/**
 * Remove whatever dropdown is currently open.
 */
function closeActiveDropdown() {
  if (activeDropdown) {
    activeDropdown.remove();
    activeDropdown = null;
    // Reset aria-expanded on any actions button inside the same wrapper
    document.querySelectorAll('.actions-btn[aria-expanded="true"]').forEach((btn) => {
      btn.setAttribute('aria-expanded', 'false');
    });
  }
}

/**
 * Inject an inline <select> into the status cell for changing status.
 *
 * @param {Object}      report     - Report data with `.id` and `.status`.
 * @param {HTMLElement} statusCell - <td> holding the badge.
 */
function showInlineStatusSelect(report, statusCell) {
  // Clear current badge
  statusCell.innerHTML = '';

  const select = document.createElement('select');
  select.className = 'status-inline-select';
  ['Pending', 'Ongoing', 'Completed'].forEach((val) => {
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = val;
    if (val === report.status) opt.selected = true;
    select.appendChild(opt);
  });

  select.addEventListener('change', async () => {
    const newStatus = select.value;

    // Optimistic update — replace select with badge immediately
    statusCell.innerHTML = '';
    statusCell.appendChild(statusBadge(newStatus));

    // Also update the in-memory record so re-renders stay consistent
    report.status = newStatus;

    try {
      const reportRef = doc(db, 'reports', report.id);
      await updateDoc(reportRef, { status: newStatus, updatedAt: serverTimestamp() });
      await addDoc(collection(db, 'reports', report.id, 'statusHistory'), {
        status: newStatus,
        updatedAt: serverTimestamp(),
        updatedBy: currentUid,
      });
      showToast(`Status updated to "${newStatus}"`, 'success');
    } catch (err) {
      console.error('[concern-table] Status update failed:', err);
      showToast('Failed to update status. Please try again.', 'error');
      // Revert optimistic update on failure
      statusCell.innerHTML = '';
      statusCell.appendChild(statusBadge(report.status));
    }
  });

  statusCell.appendChild(select);
  select.focus();
}

/**
 * Inject an inline <select> into the category cell for changing category.
 *
 * @param {Object}      report       - Report data with `.id` and `.category`.
 * @param {HTMLElement} categoryCell - <td> holding the category text.
 */
function showInlineCategorySelect(report, categoryCell) {
  // Store original text in case we need to revert
  const originalCategory = report.category ?? '—';

  categoryCell.innerHTML = '';

  const CATEGORIES = [
    'Health',
    'Transportation',
    'Environment',
    'Consumer Issue',
    'Others',
  ];

  const select = document.createElement('select');
  select.className = 'status-inline-select';

  CATEGORIES.forEach((val) => {
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = val;
    if (val === report.category) opt.selected = true;
    select.appendChild(opt);
  });

  select.addEventListener('change', async () => {
    const newCategory = select.value;

    // Optimistic update
    categoryCell.innerHTML = '';
    categoryCell.textContent = newCategory;
    report.category = newCategory;

    try {
      await updateDoc(doc(db, 'reports', report.id), {
        category: newCategory,
        updatedAt: serverTimestamp(),
      });
      showToast(`Category updated to "${newCategory}"`, 'success');
    } catch (err) {
      console.error('[concern-table] Category update failed:', err);
      showToast('Failed to update category. Please try again.', 'error');
      // Revert
      categoryCell.innerHTML = '';
      categoryCell.textContent = originalCategory;
      report.category = originalCategory;
    }
  });

  // Cancel on blur (click outside) — restore text without saving
  select.addEventListener('blur', () => {
    if (categoryCell.contains(select)) {
      categoryCell.innerHTML = '';
      categoryCell.textContent = report.category ?? '—';
    }
  });

  categoryCell.appendChild(select);
  select.focus();
}

// ---------------------------------------------------------------------------
// Detail modal
// ---------------------------------------------------------------------------

/**
 * Populate and open the detail modal for a given report.
 *
 * @param {Object} report - Full report data including `.id`.
 */
async function openDetailModal(report) {
  const modal = document.getElementById('concern-detail-modal');
  const body  = document.getElementById('concern-modal-body');
  if (!modal || !body) return;

  body.innerHTML = '';

  // ── Detail grid ───────────────────────────────────────────────────────────
  const dl = document.createElement('dl');
  dl.className = 'detail-grid';

  const fields = [
    ['Resident',       report.userName ?? report.residentName ?? '—'],
    ['Barangay / Address', report.barangay ?? '—'],
    ['Report Ref',     report.reportReference ?? '—'],
    ['Category',       report.category ?? '—'],
    ['Location',       report.location ?? '—'],
    ['Date Submitted', report.submittedAt ? formatDate(report.submittedAt) : '—'],
    ['Status',         report.status ?? '—'],
    ['GPS Coordinates',
      report.latitude != null && report.longitude != null
        ? `${report.latitude}, ${report.longitude}`
        : 'Not captured'],
  ];

  fields.forEach(([label, value]) => {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    dl.appendChild(dt);
    dl.appendChild(dd);
  });

  body.appendChild(dl);

  // ── Full description ──────────────────────────────────────────────────────
  const descHeading = document.createElement('h3');
  descHeading.textContent = 'Description';
  descHeading.style.fontSize = 'var(--font-size-xs)';
  descHeading.style.fontWeight = '600';
  descHeading.style.color = 'var(--color-text-secondary)';
  descHeading.style.textTransform = 'uppercase';
  descHeading.style.marginBottom = 'var(--space-2)';

  const descPara = document.createElement('p');
  descPara.style.fontSize = 'var(--font-size-sm)';
  descPara.style.marginBottom = 'var(--space-4)';
  descPara.textContent = report.description ?? '—';

  body.appendChild(descHeading);
  body.appendChild(descPara);

  // ── Evidence (photo + video) ──────────────────────────────────────────────
  if (report.imageUrl || report.videoUrl) {
    const evidenceHeading = document.createElement('h3');
    evidenceHeading.textContent = 'Evidence';
    evidenceHeading.className = 'modal-section-heading';
    body.appendChild(evidenceHeading);

    const evidenceWrap = document.createElement('div');
    evidenceWrap.className = 'evidence-wrap';

    // Photo
    if (report.imageUrl) {
      const photoWrap = document.createElement('div');
      photoWrap.className = 'evidence-item';

      const photoLabel = document.createElement('p');
      photoLabel.className = 'evidence-label';
      photoLabel.textContent = '📷 Photo Evidence';
      photoWrap.appendChild(photoLabel);

      const img = document.createElement('img');
      img.className = 'detail-image';
      img.src = report.imageUrl;
      img.alt = 'Photo evidence';
      img.loading = 'lazy';

      // Click to open full size
      img.style.cursor = 'pointer';
      img.title = 'Click to open full size';
      img.addEventListener('click', () => window.open(report.imageUrl, '_blank'));

      photoWrap.appendChild(img);
      evidenceWrap.appendChild(photoWrap);
    }

    // Video
    if (report.videoUrl) {
      const videoWrap = document.createElement('div');
      videoWrap.className = 'evidence-item';

      const videoLabel = document.createElement('p');
      videoLabel.className = 'evidence-label';
      videoLabel.textContent = '🎥 Video Evidence';
      videoWrap.appendChild(videoLabel);

      const video = document.createElement('video');
      video.className = 'detail-video';
      video.src = report.videoUrl;
      video.controls = true;
      video.preload = 'metadata';
      video.setAttribute('aria-label', 'Video evidence');

      videoWrap.appendChild(video);

      // Open in new tab link
      const videoLink = document.createElement('a');
      videoLink.href = report.videoUrl;
      videoLink.target = '_blank';
      videoLink.rel = 'noopener noreferrer';
      videoLink.textContent = 'Open video in new tab';
      videoLink.className = 'evidence-external-link';
      videoWrap.appendChild(videoLink);

      evidenceWrap.appendChild(videoWrap);
    }

    body.appendChild(evidenceWrap);
  } else {
    const noEvidence = document.createElement('p');
    noEvidence.className = 'no-evidence';
    noEvidence.textContent = 'No photo or video evidence submitted.';
    body.appendChild(noEvidence);
  }

  // ── Status history timeline ───────────────────────────────────────────────
  const histHeading = document.createElement('h3');
  histHeading.textContent = 'Status History';
  histHeading.style.fontSize = 'var(--font-size-xs)';
  histHeading.style.fontWeight = '600';
  histHeading.style.color = 'var(--color-text-secondary)';
  histHeading.style.textTransform = 'uppercase';
  histHeading.style.marginBottom = 'var(--space-2)';
  body.appendChild(histHeading);

  const histList = document.createElement('ul');
  histList.className = 'status-history-list';

  try {
    const histSnap = await getDocs(collection(db, 'reports', report.id, 'statusHistory'));
    if (histSnap.empty) {
      const li = document.createElement('li');
      li.textContent = 'No history available.';
      histList.appendChild(li);
    } else {
      histSnap.docs
        .sort((a, b) => {
          const aTime = a.data().updatedAt?.toMillis?.() ?? 0;
          const bTime = b.data().updatedAt?.toMillis?.() ?? 0;
          return bTime - aTime; // most-recent first
        })
        .forEach((histDoc) => {
          const data = histDoc.data();
          const li = document.createElement('li');
          const dateStr = data.updatedAt ? formatDate(data.updatedAt) : '—';
          li.textContent = `${data.status} — ${dateStr} (by ${data.updatedBy ?? 'unknown'})`;
          histList.appendChild(li);
        });
    }
  } catch (err) {
    console.error('[concern-table] Failed to fetch status history:', err);
    const li = document.createElement('li');
    li.textContent = 'Could not load status history.';
    histList.appendChild(li);
  }

  body.appendChild(histList);

  // Show modal
  modal.hidden = false;
  document.getElementById('close-concern-modal')?.focus();
}

/**
 * Show a confirmation dialog then delete the report from Firestore.
 */
async function confirmDeleteReport(report) {
  const residentName = report.userName ?? report.residentName ?? 'this resident';
  const confirmed = window.confirm(
    `Delete report "${report.reportReference}" by ${residentName}?\n\nThis cannot be undone.`
  );
  if (!confirmed) return;

  // Optimistically remove from local array and re-render
  const idx = allReports.findIndex(r => r.id === report.id);
  if (idx !== -1) allReports.splice(idx, 1);
  render(false);

  try {
    await deleteDoc(doc(db, 'reports', report.id));
    showToast('Report deleted successfully.', 'success');
  } catch (err) {
    console.error('[concern-table] Delete failed:', err);
    // Revert — re-insert the report at the same position
    if (idx !== -1) allReports.splice(idx, 0, report);
    render(false);
    showToast('Failed to delete report. Please try again.', 'error');
  }
}

/**
 * Close the detail modal.
 */
function closeDetailModal() {
  const modal = document.getElementById('concern-detail-modal');
  if (modal) modal.hidden = true;
}

// ---------------------------------------------------------------------------
// Table / card rendering
// ---------------------------------------------------------------------------

/**
 * Re-render the tbody (and mobile cards) based on current state.
 * Appends to existing rows when currentPage > 1 (Load More).
 *
 * @param {boolean} [append=false] - When true, append rows instead of replacing.
 */
function render(append = false) {
  const tbody    = document.getElementById('concern-tbody');
  const loadMore = document.getElementById('load-more-btn');
  const cards    = document.getElementById('concern-cards');

  if (!tbody) return;

  const filtered = applyFilters(allReports, currentFilters);
  const pageData  = paginateReports(filtered, currentPage, PAGE_SIZE);

  // Calculate the starting row number for this batch
  const startRowNum = (currentPage - 1) * PAGE_SIZE + 1;

  if (!append) {
    tbody.innerHTML = '';
    if (cards) cards.innerHTML = '';
  }

  pageData.forEach((report, idx) => {
    const rowNum = startRowNum + idx;
    tbody.appendChild(buildRow(report, rowNum));

    // Mobile card (simple version)
    if (cards) {
      cards.appendChild(buildCard(report, rowNum));
    }
  });

  // Show/hide Load More
  if (loadMore) {
    const hasMore = filtered.length > currentPage * PAGE_SIZE;
    loadMore.style.display = hasMore ? '' : 'none';
  }
}

/**
 * Build a minimal mobile card for a report.
 *
 * @param {Object} report
 * @param {number} rowNum
 * @returns {HTMLDivElement}
 */
function buildCard(report, rowNum) {
  const card = document.createElement('div');
  card.className = 'concern-card';
  card.dataset.id = report.id;

  card.innerHTML = `
    <div class="concern-card__header">
      <span class="concern-card__num">#${rowNum}</span>
      <span class="concern-card__category">${report.category ?? '—'}</span>
    </div>
    <p class="concern-card__resident">${report.userName ?? report.residentName ?? '—'}</p>
    <p class="concern-card__desc">${(report.description ?? '').slice(0, 80)}${(report.description ?? '').length > 80 ? '…' : ''}</p>
    <div class="concern-card__footer">
      <span class="concern-card__date">${report.submittedAt ? formatDate(report.submittedAt) : '—'}</span>
    </div>
  `;

  // Append status badge
  const footer = card.querySelector('.concern-card__footer');
  footer?.appendChild(statusBadge(report.status ?? 'Pending'));

  // Card click → open detail modal
  card.addEventListener('click', () => openDetailModal(report));

  return card;
}

// ---------------------------------------------------------------------------
// Debounce utility
// ---------------------------------------------------------------------------

/**
 * @param {Function} fn
 * @param {number}   delay - milliseconds
 * @returns {Function}
 */
function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// ---------------------------------------------------------------------------
// Public init
// ---------------------------------------------------------------------------

/**
 * Initialise the Community Concern Management section.
 * Called once by admin/app.js when the section is first activated.
 *
 * @param {HTMLElement} container - The section container element.
 * @param {string}      uid       - Firebase Auth UID of the logged-in official.
 */
export function init(container, uid) {
  // Reset module state
  allReports     = [];
  currentFilters = { status: 'All', category: 'All', search: '' };
  currentPage    = 1;
  currentUid     = uid;
  activeDropdown = null;

  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }

  // Render static HTML
  container.innerHTML = SECTION_HTML;

  // ── Firestore real-time subscription ─────────────────────────────────────
  const reportsQuery = query(
    collection(db, 'reports'),
    orderBy('submittedAt', 'desc')
  );

  unsubscribe = onSnapshot(
    reportsQuery,
    (snapshot) => {
      allReports = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      currentPage = 1; // reset to page 1 on every remote update
      render(false);
    },
    (err) => {
      console.error('[concern-table] Firestore snapshot error:', err);
      showToast('Failed to load reports. Please refresh.', 'error');
    }
  );

  // ── Filter event listeners ────────────────────────────────────────────────
  container.querySelector('#filter-status')?.addEventListener('change', (e) => {
    currentFilters = { ...currentFilters, status: e.target.value };
    currentPage = 1;
    render(false);
  });

  container.querySelector('#filter-category')?.addEventListener('change', (e) => {
    currentFilters = { ...currentFilters, category: e.target.value };
    currentPage = 1;
    render(false);
  });

  const handleSearch = debounce((value) => {
    currentFilters = { ...currentFilters, search: value };
    currentPage = 1;
    render(false);
  }, 300);

  container.querySelector('#filter-search')?.addEventListener('input', (e) => {
    handleSearch(e.target.value);
  });

  // ── Load More ─────────────────────────────────────────────────────────────
  container.querySelector('#load-more-btn')?.addEventListener('click', () => {
    currentPage++;
    render(true); // append new rows
  });

  // ── Modal close — button ──────────────────────────────────────────────────
  container.addEventListener('click', (e) => {
    if (e.target.id === 'close-concern-modal') {
      closeDetailModal();
    }
  });

  // ── Modal close — Escape key ──────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = document.getElementById('concern-detail-modal');
      if (modal && !modal.hidden) closeDetailModal();
      closeActiveDropdown();
    }
  });

  // ── Close dropdown on outside click ──────────────────────────────────────
  document.addEventListener('click', () => {
    closeActiveDropdown();
  });
}
