/**
 * Shared UI helper utilities for BEE-Alerta.
 *
 * These are pure DOM/utility functions with no Firebase or framework dependencies.
 * Import individual helpers wherever they are needed across the app.
 */

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

/**
 * Creates a <span> badge element styled according to the report status.
 *
 * @param {'Pending'|'Ongoing'|'Completed'} status - The report status value.
 * @returns {HTMLSpanElement} A span element with class `badge badge--<status>`
 *   and inner text equal to the status value.
 *
 * Example:
 *   const el = statusBadge('Pending');
 *   // <span class="badge badge--pending">Pending</span>
 */
export function statusBadge(status) {
  const span = document.createElement('span');
  const modifier = typeof status === 'string' ? status.toLowerCase() : '';
  span.className = `badge badge--${modifier}`;
  span.textContent = status;
  return span;
}

// ---------------------------------------------------------------------------
// Date formatting
// ---------------------------------------------------------------------------

/**
 * Formats a Firestore Timestamp or a plain JS Date into a human-readable string.
 *
 * Accepts:
 *   - Firestore Timestamp objects (have a `.toDate()` method)
 *   - Plain JS `Date` instances
 *
 * @param {import('firebase/firestore').Timestamp | Date} timestamp
 * @returns {string} Date formatted as "Mon DD, YYYY" (e.g. "Jan 15, 2025").
 */
export function formatDate(timestamp) {
  // Convert Firestore Timestamp → Date if needed
  const date =
    timestamp && typeof timestamp.toDate === 'function'
      ? timestamp.toDate()
      : timestamp instanceof Date
      ? timestamp
      : new Date(timestamp);

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Toast notifications
// ---------------------------------------------------------------------------

// Auto-dismiss delay in milliseconds
const TOAST_AUTO_DISMISS_MS = 4000;

/**
 * Appends a dismissible toast notification to `#toast-container`.
 * The toast auto-dismisses after 4 seconds. If the container element does
 * not exist in the current document, this function is a no-op.
 *
 * @param {string} message - The text to display in the toast.
 * @param {'success'|'error'|'info'|'warning'} [type='success'] - Visual style variant.
 */
export function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', 'polite');

  const text = document.createElement('span');
  text.className = 'toast__message';
  text.textContent = message;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'toast__close';
  closeBtn.setAttribute('aria-label', 'Dismiss notification');
  closeBtn.textContent = '×';

  const dismiss = () => {
    toast.classList.add('toast--dismissing');
    // Remove from DOM after CSS transition completes (300 ms)
    setTimeout(() => toast.remove(), 300);
  };

  closeBtn.addEventListener('click', dismiss);

  toast.appendChild(text);
  toast.appendChild(closeBtn);
  container.appendChild(toast);

  // Auto-dismiss
  const autoTimer = setTimeout(dismiss, TOAST_AUTO_DISMISS_MS);

  // Cancel the auto-timer if the user manually dismisses first
  closeBtn.addEventListener('click', () => clearTimeout(autoTimer), { once: true });
}

// ---------------------------------------------------------------------------
// Loading overlay
// ---------------------------------------------------------------------------

const OVERLAY_ID = 'loading-overlay';

/**
 * Shows a CSS spinner overlay on the currently active `<section>` element
 * (the one with the `active` class). Falls back to `<main>` if no active
 * section is found. Creates the overlay element if it does not yet exist.
 */
export function showLoadingOverlay() {
  let overlay = document.getElementById(OVERLAY_ID);

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.className = 'loading-overlay';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-label', 'Loading');

    const spinner = document.createElement('div');
    spinner.className = 'loading-overlay__spinner';
    overlay.appendChild(spinner);
  }

  const activeSection =
    document.querySelector('section.active') ||
    document.querySelector('main') ||
    document.body;

  // Avoid appending multiple times
  if (!activeSection.contains(overlay)) {
    activeSection.appendChild(overlay);
  }

  overlay.hidden = false;
  overlay.classList.remove('loading-overlay--hidden');
}

/**
 * Hides the loading spinner overlay if it is currently visible.
 */
export function hideLoadingOverlay() {
  const overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) return;

  overlay.hidden = true;
  overlay.classList.add('loading-overlay--hidden');
}
