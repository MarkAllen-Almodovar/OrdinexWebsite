/**
 * Admin Settings module — lazy-loaded by admin/app.js.
 *
 * Renders the settings UI, loads existing settings from Firestore,
 * and wires up save/toggle logic.
 */

import { db } from '../shared/firebase.js';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { showToast } from '../shared/ui-helpers.js';

// ── HTML template ────────────────────────────────────────────────────────────

const SETTINGS_HTML = /* html */ `
<div class="settings-section">
  <h1 class="section-title">Settings</h1>

  <!-- General Settings -->
  <div class="settings-card">
    <h2 class="settings-card__title">General Settings</h2>
    <div class="settings-row">
      <label class="form-label" for="display-name">Display Name</label>
      <input class="form-input" type="text" id="display-name" />
    </div>
    <div class="settings-row">
      <label class="form-label" for="contact-email">Contact Email</label>
      <input class="form-input" type="email" id="contact-email" />
    </div>
    <button class="btn btn--primary" id="save-general-btn">Save Changes</button>
  </div>

  <!-- Notification Settings -->
  <div class="settings-card">
    <h2 class="settings-card__title">Notification Settings</h2>
    <div class="settings-toggle-row">
      <label class="settings-toggle-label" for="email-notifications">Email notifications for new reports</label>
      <input type="checkbox" id="email-notifications" role="switch" />
    </div>
  </div>

  <!-- Content Preferences -->
  <div class="settings-card">
    <h2 class="settings-card__title">Content Preferences</h2>
    <div class="settings-toggle-row">
      <label class="settings-toggle-label" for="show-resolved">Show resolved reports in dashboard</label>
      <input type="checkbox" id="show-resolved" role="switch" checked />
    </div>
  </div>
</div>
`;

// ── Exported pure helper ─────────────────────────────────────────────────────

/**
 * Persists an arbitrary settings object to Firestore for the given uid.
 * Always merges so existing fields are not overwritten.
 *
 * @param {string} uid      - Firebase Auth UID of the official.
 * @param {Object} settings - Partial settings fields to save.
 * @returns {Promise<void>}
 */
export async function saveSettings(uid, settings) {
  await setDoc(
    doc(db, 'settings', uid),
    { ...settings, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

// ── Module init ──────────────────────────────────────────────────────────────

/**
 * Initialises the settings section.
 * Called once by admin/app.js when the user first navigates to the Settings tab.
 *
 * @param {HTMLElement} container - The `#section-settings` DOM node.
 * @param {string}      uid       - Firebase Auth UID of the signed-in official.
 */
export async function init(container, uid) {
  // 1. Render the UI
  container.innerHTML = SETTINGS_HTML;

  // 2. Grab references to interactive elements
  const displayNameInput     = container.querySelector('#display-name');
  const contactEmailInput    = container.querySelector('#contact-email');
  const saveBtn              = container.querySelector('#save-general-btn');
  const emailNotifToggle     = container.querySelector('#email-notifications');
  const showResolvedToggle   = container.querySelector('#show-resolved');

  // 3. Load existing settings from Firestore
  try {
    const snap = await getDoc(doc(db, 'settings', uid));
    if (snap.exists()) {
      const data = snap.data();

      if (data.displayName   !== undefined) displayNameInput.value   = data.displayName;
      if (data.contactEmail  !== undefined) contactEmailInput.value  = data.contactEmail;

      // Toggles — only override the HTML default when the field is explicitly stored
      if (data.emailNotificationsEnabled !== undefined) {
        emailNotifToggle.checked = data.emailNotificationsEnabled;
      }
      if (data.showResolvedInDashboard !== undefined) {
        showResolvedToggle.checked = data.showResolvedInDashboard;
      }
    }
  } catch (err) {
    console.error('[settings] Failed to load settings:', err);
    showToast('Could not load settings. Please refresh.', 'error');
  }

  // 4. Save general settings on button click
  saveBtn.addEventListener('click', async () => {
    const displayName  = displayNameInput.value.trim();
    const contactEmail = contactEmailInput.value.trim();

    saveBtn.disabled = true;
    try {
      await saveSettings(uid, { displayName, contactEmail });
      showToast('Settings saved.', 'success');
    } catch (err) {
      console.error('[settings] Failed to save general settings:', err);
      showToast('Failed to save. Please try again.', 'error');
      _appendRetryButton(saveBtn, () => saveBtn.click());
    } finally {
      saveBtn.disabled = false;
    }
  });

  // 5. Wire up toggle — email notifications
  emailNotifToggle.addEventListener('change', async () => {
    const checked = emailNotifToggle.checked;
    try {
      await saveSettings(uid, { emailNotificationsEnabled: checked });
    } catch (err) {
      console.error('[settings] Failed to save email-notifications toggle:', err);
      showToast('Could not save setting. Retry?', 'error');
      // Per spec: keep toggle in new state; error toast is shown above
    }
  });

  // 6. Wire up toggle — show resolved reports
  showResolvedToggle.addEventListener('change', async () => {
    const checked = showResolvedToggle.checked;
    try {
      await saveSettings(uid, { showResolvedInDashboard: checked });
    } catch (err) {
      console.error('[settings] Failed to save show-resolved toggle:', err);
      showToast('Could not save setting. Retry?', 'error');
      // Per spec: keep toggle in new state; error toast is shown above
    }
  });
}

// ── Private helpers ──────────────────────────────────────────────────────────

/**
 * Appends a Retry button after `referenceEl` (if one does not already exist).
 * Clicking it invokes `onRetry` and removes the button.
 *
 * @param {HTMLElement} referenceEl - The element after which the button is inserted.
 * @param {Function}    onRetry     - Callback invoked when the Retry button is clicked.
 */
function _appendRetryButton(referenceEl, onRetry) {
  // Avoid duplicating retry buttons on repeated failures
  const existing = referenceEl.parentElement?.querySelector('.btn--retry');
  if (existing) return;

  const retryBtn = document.createElement('button');
  retryBtn.className  = 'btn btn--retry';
  retryBtn.textContent = 'Retry';
  retryBtn.style.marginLeft = 'var(--space-3)';

  retryBtn.addEventListener('click', () => {
    retryBtn.remove();
    onRetry();
  });

  referenceEl.insertAdjacentElement('afterend', retryBtn);
}
