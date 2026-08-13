/**
 * Admin Dashboard — stat cards, Chart.js charts, recent reports.
 * Lazy-loaded by admin/app.js via `init(container, uid)`.
 *
 * Exports:
 *   computeStats(reports)     → { total, pending, ongoing, completed }
 *   getRecentReports(reports) → last 10 sorted by submittedAt desc
 *   init(container, uid)      → subscribes to Firestore and renders UI
 */

import { db } from '../shared/firebase.js';
import { collection, onSnapshot } from 'firebase/firestore';
import {
  statusBadge,
  formatDate,
  showLoadingOverlay,
  hideLoadingOverlay,
} from '../shared/ui-helpers.js';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

// ── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  'Illegal Dumping',
  'Water Pollution',
  'Air Pollution',
  'Noise Pollution',
  'Deforestation',
];

const BAR_COLORS = ['#F97316', '#FB923C', '#F59E0B', '#10B981', '#3B82F6'];

const LOADING_TIMEOUT_MS = 3000;
const RECENT_REPORTS_LIMIT = 10;

// ── Pure functions ───────────────────────────────────────────────────────────

/**
 * Counts reports by status.
 *
 * @param {Array<{status: string}>} reports
 * @returns {{ total: number, pending: number, ongoing: number, completed: number }}
 */
export function computeStats(reports) {
  let pending = 0;
  let ongoing = 0;
  let completed = 0;

  for (const r of reports) {
    if (r.status === 'Pending')   pending++;
    else if (r.status === 'Ongoing')    ongoing++;
    else if (r.status === 'Completed')  completed++;
  }

  return { total: reports.length, pending, ongoing, completed };
}

/**
 * Returns the last 10 reports sorted by submittedAt descending.
 * Handles Firestore Timestamps (`.toDate()`) and plain Date objects.
 *
 * @param {Array<object>} reports
 * @returns {Array<object>}
 */
export function getRecentReports(reports) {
  const toMs = (ts) => {
    if (!ts) return 0;
    if (typeof ts.toDate === 'function') return ts.toDate().getTime();
    if (ts instanceof Date) return ts.getTime();
    return new Date(ts).getTime();
  };

  return [...reports]
    .sort((a, b) => toMs(b.submittedAt) - toMs(a.submittedAt))
    .slice(0, RECENT_REPORTS_LIMIT);
}

// ── Dashboard HTML ───────────────────────────────────────────────────────────

const DASHBOARD_HTML = `
<div class="dashboard">
  <h1 class="section-title">Dashboard</h1>
  <div class="stat-cards">
    <div class="stat-card">
      <div class="stat-card__value" id="stat-total">0</div>
      <div class="stat-card__label">Total Reports</div>
    </div>
    <div class="stat-card stat-card--pending">
      <div class="stat-card__value" id="stat-pending">0</div>
      <div class="stat-card__label">Pending</div>
    </div>
    <div class="stat-card stat-card--ongoing">
      <div class="stat-card__value" id="stat-ongoing">0</div>
      <div class="stat-card__label">Ongoing</div>
    </div>
    <div class="stat-card stat-card--completed">
      <div class="stat-card__value" id="stat-completed">0</div>
      <div class="stat-card__label">Completed</div>
    </div>
  </div>
  <div class="charts-row">
    <div class="chart-card"><h2>Reports Over Time</h2><canvas id="chart-line"></canvas></div>
    <div class="chart-card"><h2>By Category</h2><canvas id="chart-bar"></canvas></div>
    <div class="chart-card">
      <h2>Category Breakdown</h2>
      <canvas id="chart-pie" style="display:none"></canvas>
      <p id="chart-pie-empty">No data available</p>
    </div>
  </div>
  <div class="recent-reports">
    <h2>Recent Reports</h2>
    <div id="recent-reports-list"></div>
  </div>
</div>
`;

// ── Chart helpers ────────────────────────────────────────────────────────────

/**
 * Returns an array of the last `n` calendar days as formatted label strings
 * ("Jan 15" style) and as Date objects for range matching.
 */
function buildLastNDays(n) {
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    days.push(d);
  }
  return days;
}

/** Format a Date as "Mon DD" label. */
function dayLabel(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Resolve a Firestore Timestamp or Date to a plain Date. */
function toDate(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === 'function') return ts.toDate();
  if (ts instanceof Date) return ts;
  return new Date(ts);
}

/**
 * Build line-chart data: submissions per day for the last 14 days.
 * @param {Array<object>} reports
 * @returns {{ labels: string[], data: number[] }}
 */
function buildLineData(reports) {
  const days = buildLastNDays(14);
  const counts = days.map((day) => {
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    return reports.filter((r) => {
      const d = toDate(r.submittedAt);
      return d && d >= day && d < next;
    }).length;
  });
  return { labels: days.map(dayLabel), data: counts };
}

/**
 * Build bar-chart data: count per category.
 * @param {Array<object>} reports
 * @returns {{ labels: string[], data: number[] }}
 */
function buildBarData(reports) {
  const data = CATEGORIES.map(
    (cat) => reports.filter((r) => r.category === cat).length,
  );
  return { labels: CATEGORIES, data };
}

/** Destroy a Chart instance if it exists. */
function destroyChart(chartRef) {
  if (chartRef.current) {
    chartRef.current.destroy();
    chartRef.current = null;
  }
}

// ── Chart state (mutable refs) ───────────────────────────────────────────────

const lineChartRef  = { current: null };
const barChartRef   = { current: null };
const pieChartRef   = { current: null };

// ── Render functions ─────────────────────────────────────────────────────────

/** Update stat-card DOM elements with computed stats. */
function updateStats(stats) {
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  set('stat-total',     stats.total);
  set('stat-pending',   stats.pending);
  set('stat-ongoing',   stats.ongoing);
  set('stat-completed', stats.completed);
}

/** Recreate the line chart from scratch. */
function renderLineChart(reports) {
  const canvas = document.getElementById('chart-line');
  if (!canvas) return;

  destroyChart(lineChartRef);

  const { labels, data } = buildLineData(reports);

  lineChartRef.current = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Submissions',
          data,
          borderColor: '#F97316',
          backgroundColor: 'rgba(249,115,22,0.15)',
          tension: 0.3,
          fill: true,
          pointRadius: 3,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1 } },
      },
    },
  });
}

/** Recreate the bar chart from scratch. */
function renderBarChart(reports) {
  const canvas = document.getElementById('chart-bar');
  if (!canvas) return;

  destroyChart(barChartRef);

  const { labels, data } = buildBarData(reports);

  barChartRef.current = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Reports',
          data,
          backgroundColor: BAR_COLORS,
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1 } },
      },
    },
  });
}

/** Recreate the pie/doughnut chart — or show empty placeholder. */
function renderPieChart(reports) {
  const canvas   = document.getElementById('chart-pie');
  const emptyMsg = document.getElementById('chart-pie-empty');
  if (!canvas || !emptyMsg) return;

  destroyChart(pieChartRef);

  const { data } = buildBarData(reports);
  const total    = data.reduce((sum, v) => sum + v, 0);

  if (total === 0) {
    canvas.style.display = 'none';
    emptyMsg.style.display = '';
    return;
  }

  canvas.style.display = '';
  emptyMsg.style.display = 'none';

  pieChartRef.current = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: CATEGORIES,
      datasets: [
        {
          data,
          backgroundColor: BAR_COLORS,
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom' },
      },
    },
  });
}

/** Render the recent-reports list. */
function renderRecentReports(reports) {
  const container = document.getElementById('recent-reports-list');
  if (!container) return;

  const recent = getRecentReports(reports);

  if (recent.length === 0) {
    container.innerHTML = '<p style="color:var(--color-text-muted);font-size:var(--font-size-sm);">No reports yet.</p>';
    return;
  }

  container.innerHTML = '';
  for (const report of recent) {
    const item = document.createElement('div');
    item.className = 'recent-item';

    const category = document.createElement('span');
    category.className = 'recent-item__category';
    category.textContent = report.category || '—';

    const badge = statusBadge(report.status);

    const date = document.createElement('span');
    date.className = 'recent-item__date';
    date.textContent = report.submittedAt ? formatDate(report.submittedAt) : '—';

    item.appendChild(category);
    item.appendChild(badge);
    item.appendChild(date);
    container.appendChild(item);
  }
}

// ── Main init ────────────────────────────────────────────────────────────────

/**
 * Initialise the Dashboard section.
 *
 * @param {HTMLElement} container - The section container element.
 * @param {string}      uid       - The authenticated official's Firebase UID.
 */
export function init(container, uid) {
  // 1. Render static HTML shell
  container.innerHTML = DASHBOARD_HTML;

  // 2. Loading overlay if first snapshot takes > 3 s
  let firstSnapshotReceived = false;
  const loadingTimer = setTimeout(() => {
    if (!firstSnapshotReceived) {
      showLoadingOverlay();
    }
  }, LOADING_TIMEOUT_MS);

  // 3. Subscribe to all reports
  const unsubscribe = onSnapshot(
    collection(db, 'reports'),
    (snapshot) => {
      // Cancel loading timer / hide overlay on first snapshot
      if (!firstSnapshotReceived) {
        firstSnapshotReceived = true;
        clearTimeout(loadingTimer);
        hideLoadingOverlay();
      }

      // Materialise docs array
      const reports = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

      // Update stat cards
      const stats = computeStats(reports);
      updateStats(stats);

      // Update charts (destroy → recreate)
      renderLineChart(reports);
      renderBarChart(reports);
      renderPieChart(reports);

      // Update recent reports list
      renderRecentReports(reports);
    },
    (error) => {
      console.error('[admin/dashboard] Firestore snapshot error:', error);
      if (!firstSnapshotReceived) {
        firstSnapshotReceived = true;
        clearTimeout(loadingTimer);
        hideLoadingOverlay();
      }
    },
  );

  // Clean up listener if the section element is ever removed from the DOM
  // (defensive — admin SPA keeps sections alive, but good practice)
  if (typeof container.addEventListener === 'function') {
    container.addEventListener('section:destroy', () => unsubscribe(), { once: true });
  }
}
