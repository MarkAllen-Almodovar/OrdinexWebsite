/**
 * Report submission form module — `src/resident/report-form.js`
 *
 * Lazy-loaded by `resident/app.js` when the "Submit Report" tab is activated.
 * Renders the form into the given container and wires up all interactivity.
 *
 * Exports:
 *   init(container, uid)        — main entry point called by app.js
 *   validateReportForm(data)    — pure validation function (also used by tests)
 *   validateImageFile(file)     — pure file size validation (also used by tests)
 *
 * Requirements: 4.4, 4.5, 4.7, 4.8
 */

import { db, storage } from '../shared/firebase.js';
import {
  addDoc,
  collection,
  serverTimestamp,
  getDoc,
  doc,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { showToast } from '../shared/ui-helpers.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

/** The five predefined report categories. */
const CATEGORIES = [
  'Improper Garbage Disposal',
  'Illegal Parking',
  'Noise Disturbances',
  'Public Disturbance',
  'Others',
];

// ---------------------------------------------------------------------------
// Pure exported helpers
// ---------------------------------------------------------------------------

/**
 * Validates report form data before submission.
 *
 * @param {{ description?: string, category?: string }} data
 * @returns {{ valid: boolean, errors: { description?: string, category?: string } }}
 */
export function validateReportForm(data) {
  const errors = {};

  // Description: reject if empty or whitespace-only
  if (!data.description || !data.description.trim()) {
    errors.description = 'Description is required.';
  }

  // Category: reject if empty / not selected
  if (!data.category || !data.category.trim()) {
    errors.category = 'Please select a category.';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * Validates an image file for upload — rejects files larger than 5 MB.
 *
 * @param {File} file
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateImageFile(file) {
  if (file.size > MAX_IMAGE_BYTES) {
    return { valid: false, error: 'Image must be 5 MB or smaller.' };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// Module-level cache for the user profile fetched from Firestore
// ---------------------------------------------------------------------------

/** @type {{ residentName: string, barangay: string } | null} */
let cachedUserProfile = null;

/**
 * Fetches and caches the resident's name and barangay from Firestore.
 *
 * @param {string} uid
 * @returns {Promise<{ residentName: string, barangay: string }>}
 */
async function getUserProfile(uid) {
  if (cachedUserProfile) return cachedUserProfile;

  const snap = await getDoc(doc(db, 'users', uid));
  const data = snap.data() ?? {};

  cachedUserProfile = {
    residentName: data.fullName ?? '',
    barangay: data.barangay ?? '',
  };

  return cachedUserProfile;
}

// ---------------------------------------------------------------------------
// HTML template
// ---------------------------------------------------------------------------

/**
 * Returns the inner HTML string for the report submission form.
 *
 * @returns {string}
 */
function buildFormHTML() {
  const categoryOptions = CATEGORIES.map(
    (cat) => `<option value="${cat}">${cat}</option>`
  ).join('\n          ');

  return `
    <form id="report-form" novalidate>
      <h2 class="section-title">Submit a Report</h2>

      <!-- Description -->
      <div class="form-group">
        <label for="report-description">Description <span aria-hidden="true">*</span></label>
        <textarea
          id="report-description"
          name="description"
          rows="4"
          placeholder="Describe the issue in detail…"
          aria-describedby="desc-error"
          aria-required="true"
        ></textarea>
        <span id="desc-error" class="field-error" aria-live="polite"></span>
      </div>

      <!-- Category -->
      <div class="form-group">
        <label for="report-category">Category <span aria-hidden="true">*</span></label>
        <select
          id="report-category"
          name="category"
          aria-describedby="cat-error"
          aria-required="true"
        >
          <option value="">-- Select a category --</option>
          ${categoryOptions}
        </select>
        <span id="cat-error" class="field-error" aria-live="polite"></span>
      </div>

      <!-- Image upload -->
      <div class="form-group">
        <label for="report-image">Attach Image (optional)</label>
        <input
          type="file"
          id="report-image"
          name="image"
          accept="image/*"
          aria-describedby="image-error"
        />
        <span id="image-error" class="field-error" aria-live="polite"></span>
      </div>

      <!-- GPS capture -->
      <div class="form-group">
        <label>Location (optional)</label>
        <button type="button" id="gps-btn" class="btn btn--secondary">
          📍 Capture GPS Location
        </button>
        <span id="gps-display" class="gps-display">Location not captured</span>

        <!-- Hidden lat/lng — become visible for manual entry on GPS denial -->
        <input type="hidden" id="report-lat" name="lat" />
        <input type="hidden" id="report-lng" name="lng" />
      </div>

      <!-- Submit -->
      <div class="form-actions">
        <button type="submit" id="submit-report-btn" class="btn btn--primary">
          Submit Report
        </button>
      </div>
    </form>
  `;
}

// ---------------------------------------------------------------------------
// GPS logic
// ---------------------------------------------------------------------------

/**
 * Wires up the GPS capture button.
 *
 * On success — populates hidden lat/lng inputs and updates the display span.
 * On error  — shows an informational message and converts the hidden inputs
 *             to visible text inputs for manual entry.
 */
function setupGPS() {
  const gpsBtn = document.getElementById('gps-btn');
  const gpsDisplay = document.getElementById('gps-display');
  const latInput = document.getElementById('report-lat');
  const lngInput = document.getElementById('report-lng');

  if (!gpsBtn) return;

  gpsBtn.addEventListener('click', () => {
    if (!navigator.geolocation) {
      gpsDisplay.textContent =
        'Geolocation is not supported by your browser. Please enter manually.';
      showManualEntryInputs(latInput, lngInput);
      return;
    }

    gpsDisplay.textContent = 'Capturing location…';
    gpsBtn.disabled = true;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude.toFixed(6);
        const lng = position.coords.longitude.toFixed(6);

        latInput.value = lat;
        lngInput.value = lng;
        gpsDisplay.textContent = `Lat: ${lat}, Lng: ${lng}`;
        gpsBtn.disabled = false;
      },
      (_err) => {
        gpsDisplay.textContent =
          'Unable to retrieve location. You may enter it manually below.';
        showManualEntryInputs(latInput, lngInput);
        gpsBtn.disabled = false;
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
}

/**
 * Converts the lat/lng hidden inputs to visible text inputs so the resident
 * can enter coordinates manually after a geolocation error.
 *
 * @param {HTMLInputElement} latInput
 * @param {HTMLInputElement} lngInput
 */
function showManualEntryInputs(latInput, lngInput) {
  [
    { el: latInput, placeholder: 'Latitude (e.g. 16.1234)' },
    { el: lngInput, placeholder: 'Longitude (e.g. 120.5678)' },
  ].forEach(({ el, placeholder }) => {
    if (el.type === 'hidden') {
      el.type = 'text';
      el.placeholder = placeholder;
      el.className = 'manual-gps-input';
      el.style.display = 'block';
    }
  });
}

// ---------------------------------------------------------------------------
// Image validation
// ---------------------------------------------------------------------------

/**
 * Wires up the file input to validate image size on change.
 */
function setupImageValidation() {
  const imageInput = document.getElementById('report-image');
  const imageError = document.getElementById('image-error');

  if (!imageInput) return;

  imageInput.addEventListener('change', () => {
    const file = imageInput.files?.[0];

    if (!file) {
      imageError.textContent = '';
      return;
    }

    const result = validateImageFile(file);
    if (!result.valid) {
      imageError.textContent = result.error;
      imageInput.value = ''; // Clear the selection
    } else {
      imageError.textContent = '';
    }
  });
}

// ---------------------------------------------------------------------------
// Form submission
// ---------------------------------------------------------------------------

/**
 * Handles the report form submit event.
 *
 * @param {Event} event
 * @param {string} uid
 */
async function handleSubmit(event, uid) {
  event.preventDefault();

  const form = document.getElementById('report-form');
  const descInput = document.getElementById('report-description');
  const catSelect = document.getElementById('report-category');
  const imageInput = document.getElementById('report-image');
  const submitBtn = document.getElementById('submit-report-btn');
  const descError = document.getElementById('desc-error');
  const catError = document.getElementById('cat-error');
  const latInput = document.getElementById('report-lat');
  const lngInput = document.getElementById('report-lng');
  const gpsDisplay = document.getElementById('gps-display');

  // ── Client-side validation ──────────────────────────────────────────────
  const description = descInput?.value ?? '';
  const category = catSelect?.value ?? '';

  const { valid, errors } = validateReportForm({ description, category });

  descError.textContent = errors.description ?? '';
  catError.textContent = errors.category ?? '';

  if (!valid) return;

  // ── Disable UI while submitting ─────────────────────────────────────────
  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting…';

  try {
    // ── Optional image upload ─────────────────────────────────────────────
    let imageUrl = null;
    const file = imageInput?.files?.[0];

    if (file) {
      const timestamp = Date.now();
      const storageRef = ref(storage, `reports/${uid}/${timestamp}_${file.name}`);
      const snapshot = await uploadBytes(storageRef, file);
      imageUrl = await getDownloadURL(snapshot.ref);
    }

    // ── Fetch resident profile (cached after first read) ──────────────────
    const { residentName, barangay } = await getUserProfile(uid);

    // ── GPS coordinates (may be empty strings) ────────────────────────────
    const lat = latInput?.value ? parseFloat(latInput.value) : null;
    const lng = lngInput?.value ? parseFloat(lngInput.value) : null;

    // ── Write Firestore document ──────────────────────────────────────────
    await addDoc(collection(db, 'reports'), {
      residentId: uid,
      residentName,
      barangay,
      category,
      description: description.trim(),
      imageUrl: imageUrl || null,
      latitude: lat,
      longitude: lng,
      status: 'Pending',
      submittedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // ── Success ───────────────────────────────────────────────────────────
    showToast('Report submitted successfully!', 'success');
    resetForm(form, gpsDisplay, latInput, lngInput);
  } catch (err) {
    console.error('[report-form] Submission error:', err);
    showToast('Failed to submit report. Please try again.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Report';
  }
}

// ---------------------------------------------------------------------------
// Reset helpers
// ---------------------------------------------------------------------------

/**
 * Resets the form fields and GPS state after a successful submission.
 *
 * @param {HTMLFormElement} form
 * @param {HTMLElement} gpsDisplay
 * @param {HTMLInputElement} latInput
 * @param {HTMLInputElement} lngInput
 */
function resetForm(form, gpsDisplay, latInput, lngInput) {
  form.reset();

  // Reset GPS display
  if (gpsDisplay) gpsDisplay.textContent = 'Location not captured';

  // Clear lat/lng values; if they were converted to text inputs, revert to hidden
  [latInput, lngInput].forEach((el) => {
    if (!el) return;
    el.value = '';
    if (el.type === 'text') {
      el.type = 'hidden';
      el.placeholder = '';
      el.className = '';
      el.style.display = '';
    }
  });
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Initialises the report form inside `container`.
 * Called by `resident/app.js` when the Submit Report tab is first activated.
 *
 * @param {HTMLElement} container - The `#tab-submit-report` section element.
 * @param {string} uid            - Firebase Auth UID of the current resident.
 */
export function init(container, uid) {
  if (!container) return;

  // Render form HTML into the container
  container.innerHTML = buildFormHTML();

  // Wire up GPS capture
  setupGPS();

  // Wire up image size validation
  setupImageValidation();

  // Wire up form submission
  const form = document.getElementById('report-form');
  if (form) {
    form.addEventListener('submit', (e) => handleSubmit(e, uid));
  }
}
