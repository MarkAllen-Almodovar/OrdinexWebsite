/**
 * Confirm Residents — admin section for approving or rejecting
 * resident account registrations.
 *
 * Firestore structure assumed:
 *   users/{uid}  →  { displayName, email, role: 'resident', status: 'pending' | 'approved' | 'rejected', createdAt }
 *
 * Admin actions:
 *   Approve → sets status: 'approved'
 *   Reject  → sets status: 'rejected'
 *
 * Lazy-loaded by admin/app.js via init(container, uid).
 */

import { db } from '../shared/firebase.js';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  updateDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore';
import { showToast } from '../shared/ui-helpers.js';

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let unsubscribe = null;
let allResidents = [];
let currentFilter = 'pending'; // 'pending' | 'approved' | 'rejected' | 'all'

// ---------------------------------------------------------------------------
// HTML template
// ---------------------------------------------------------------------------

const SECTION_HTML = /* html */ `
<div class="confirm-residents-section">
  <div class="confirm-residents-header">
    <h1 class="section-title">Confirm Residents</h1>
    <p class="confirm-residents-subtitle">Review and approve or reject resident account registrations.</p>
  </div>

  <!-- Filter tabs -->
  <div class="resident-filter-tabs" role="tablist" aria-label="Filter residents by status">
    <button class="resident-filter-tab is-active" data-filter="pending"  role="tab" aria-selected="true">
      Pending <span class="resident-filter-tab__count" id="count-pending">0</span>
    </button>
    <button class="resident-filter-tab" data-filter="approved" role="tab" aria-selected="false">
      Approved <span class="resident-filter-tab__count" id="count-approved">0</span>
    </button>
    <button class="resident-filter-tab" data-filter="rejected"  role="tab" aria-selected="false">
      Rejected <span class="resident-filter-tab__count" id="count-rejected">0</span>
    </button>
    <button class="resident-filter-tab" data-filter="all"       role="tab" aria-selected="false">
      All
    </button>
  </div>

  <!-- Empty state -->
  <div id="residents-empty" class="residents-empty" hidden>
    <div class="residents-empty__icon" aria-hidden="true">👥</div>
    <p class="residents-empty__text" id="residents-empty-text">No pending registrations.</p>
  </div>

  <!-- Cards grid -->
  <div class="residents-grid" id="residents-grid"></div>

  <!-- Loading skeleton (shown while first snapshot loads) -->
  <div class="residents-skeleton" id="residents-skeleton" aria-hidden="true">
    ${Array(4).fill('<div class="resident-skeleton-card"></div>').join('')}
  </div>
</div>
`;

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

/** Build a single resident card element. */
function buildCard(resident, adminUid) {
  const card = document.createElement('div');
  card.className = 'resident-card';
  card.dataset.uid = resident.id;

  const status = resident.status ?? 'pending';

  card.innerHTML = /* html */ `
    <div class="resident-card__avatar" aria-hidden="true">
      ${getInitials(resident.displayName ?? resident.email ?? '?')}
    </div>
    <div class="resident-card__info">
      <p class="resident-card__name">${escapeHtml(resident.displayName ?? '—')}</p>
      <p class="resident-card__email">${escapeHtml(resident.email ?? '—')}</p>
      <p class="resident-card__date">Registered: ${formatDate(resident.createdAt)}</p>
    </div>
    <div class="resident-card__status">
      ${statusBadge(status)}
    </div>
    <div class="resident-card__actions">
      ${
        status === 'pending'
          ? `<button class="btn btn--approve" data-action="approve" data-uid="${resident.id}" aria-label="Approve ${escapeHtml(resident.displayName ?? resident.email ?? '')}">
               ✓ Approve
             </button>
             <button class="btn btn--reject" data-action="reject" data-uid="${resident.id}" aria-label="Reject ${escapeHtml(resident.displayName ?? resident.email ?? '')}">
               ✕ Reject
             </button>`
          : status === 'approved'
          ? `<button class="btn btn--reject" data-action="reject" data-uid="${resident.id}" aria-label="Revoke approval for ${escapeHtml(resident.displayName ?? resident.email ?? '')}">
               Revoke
             </button>`
          : `<button class="btn btn--approve" data-action="approve" data-uid="${resident.id}" aria-label="Re-approve ${escapeHtml(resident.displayName ?? resident.email ?? '')}">
               Re-approve
             </button>`
      }
    </div>
  `;

  return card;
}

/** Re-render the grid based on current filter. */
function render() {
  const grid     = document.getElementById('residents-grid');
  const empty    = document.getElementById('residents-empty');
  const emptyTxt = document.getElementById('residents-empty-text');
  const skeleton = document.getElementById('residents-skeleton');

  if (!grid) return;

  // Hide skeleton
  if (skeleton) skeleton.hidden = true;

  // Update counts
  updateCounts();

  // Filter
  const filtered = currentFilter === 'all'
    ? allResidents
    : allResidents.filter(r => (r.status ?? 'pending') === currentFilter);

  grid.innerHTML = '';

  if (filtered.length === 0) {
    grid.hidden = true;
    if (empty) {
      empty.hidden = false;
      if (emptyTxt) {
        const labels = { pending: 'pending', approved: 'approved', rejected: 'rejected', all: '' };
        emptyTxt.textContent = currentFilter === 'all'
          ? 'No resident registrations found.'
          : `No ${labels[currentFilter]} registrations.`;
      }
    }
    return;
  }

  grid.hidden = false;
  if (empty) empty.hidden = true;

  filtered.forEach(resident => {
    grid.appendChild(buildCard(resident));
  });
}

/** Update the count badges on each filter tab. */
function updateCounts() {
  const counts = { pending: 0, approved: 0, rejected: 0 };
  allResidents.forEach(r => {
    const s = r.status ?? 'pending';
    if (counts[s] !== undefined) counts[s]++;
  });

  Object.entries(counts).forEach(([status, count]) => {
    const el = document.getElementById(`count-${status}`);
    if (el) el.textContent = count;
  });
}

// ---------------------------------------------------------------------------
// Action handler
// ---------------------------------------------------------------------------

async function handleAction(uid, action, adminUid) {
  const newStatus = action === 'approve' ? 'approved' : 'rejected';

  // Optimistically update the local state for instant UI feedback
  const resident = allResidents.find(r => r.id === uid);
  if (resident) resident.status = newStatus;
  render();

  try {
    await updateDoc(doc(db, 'users', uid), {
      status: newStatus,
      reviewedBy: adminUid,
      reviewedAt: serverTimestamp(),
    });
    showToast(
      action === 'approve'
        ? 'Resident approved successfully.'
        : 'Resident registration rejected.',
      action === 'approve' ? 'success' : 'error'
    );
  } catch (err) {
    console.error('[confirm-residents] updateDoc error:', err);
    // Revert optimistic update
    if (resident) resident.status = resident.status === newStatus
      ? (action === 'approve' ? 'pending' : 'pending')
      : resident.status;
    render();
    showToast('Failed to update resident status. Please try again.', 'error');
  }
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function getInitials(name) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(ts) {
  if (!ts) return '—';
  const date = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
  return date.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function statusBadge(status) {
  const map = {
    pending:  { cls: 'badge--pending',   label: 'Pending'  },
    approved: { cls: 'badge--completed', label: 'Approved' },
    rejected: { cls: 'badge--rejected',  label: 'Rejected' },
  };
  const { cls, label } = map[status] ?? { cls: 'badge--pending', label: status };
  return `<span class="badge ${cls}">${label}</span>`;
}

// ---------------------------------------------------------------------------
// Public init
// ---------------------------------------------------------------------------

/**
 * Initialise the Confirm Residents section.
 * Called once by admin/app.js when the tab is first activated.
 *
 * @param {HTMLElement} container - The #section-confirm-residents element.
 * @param {string}      uid       - Firebase Auth UID of the signed-in admin.
 */
export function init(container, uid) {
  // Reset state
  allResidents  = [];
  currentFilter = 'pending';
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }

  // Stamp HTML
  container.innerHTML = SECTION_HTML;

  // Show skeleton while loading
  const skeleton = document.getElementById('residents-skeleton');
  if (skeleton) skeleton.hidden = false;

  // ── Filter tab clicks ────────────────────────────────────────────────────
  container.querySelectorAll('.resident-filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      currentFilter = tab.dataset.filter;

      // Update tab active state
      container.querySelectorAll('.resident-filter-tab').forEach(t => {
        const active = t.dataset.filter === currentFilter;
        t.classList.toggle('is-active', active);
        t.setAttribute('aria-selected', String(active));
      });

      render();
    });
  });

  // ── Action button clicks (event delegation on the grid) ─────────────────
  const grid = document.getElementById('residents-grid');
  grid?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action      = btn.dataset.action;
    const residentUid = btn.dataset.uid;
    if (action && residentUid) {
      handleAction(residentUid, action, uid);
    }
  });

  // ── Firestore real-time listener ─────────────────────────────────────────
  // Listen to all users with role === 'resident', ordered by registration date
  const residentsQuery = query(
    collection(db, 'users'),
    where('role', '==', 'resident'),
    orderBy('createdAt', 'desc')
  );

  unsubscribe = onSnapshot(
    residentsQuery,
    (snapshot) => {
      allResidents = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      render();
    },
    (err) => {
      console.error('[confirm-residents] Firestore error:', err);
      if (skeleton) skeleton.hidden = true;
      showToast('Failed to load residents. Please refresh.', 'error');
    }
  );
}
