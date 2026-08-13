/**
 * Registration page logic for BEE-Alerta.
 *
 * Handles client-side validation, Firebase Auth account creation, Firestore
 * user document creation, and post-registration redirect.
 *
 * Exports `validateRegistrationForm` and `validatePassword` as pure functions
 * so they can be unit-tested without a DOM or Firebase connection.
 */

import {
  createUserWithEmailAndPassword,
} from 'firebase/auth';
import {
  doc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';

import { auth, db } from '../shared/firebase.js';
import { showToast } from '../shared/ui-helpers.js';

// ---------------------------------------------------------------------------
// Pure validation helpers (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Validates a single password value.
 *
 * @param {string} password
 * @returns {boolean} `true` when the password is 8 or more characters.
 */
export function validatePassword(password) {
  return typeof password === 'string' && password.length >= 8;
}

/**
 * Validates all registration form fields.
 *
 * Rules:
 * - `fullName`        — must not be empty
 * - `email`           — must match a basic email format
 * - `phoneNumber`     — must not be empty
 * - `barangay`        — must not be empty
 * - `password`        — must not be empty AND length ≥ 8
 * - `confirmPassword` — must match `password`
 *
 * @param {{ fullName: string, email: string, phoneNumber: string, barangay: string, password: string, confirmPassword: string }} data
 * @returns {{ valid: boolean, errors: { [fieldName: string]: string } }}
 */
export function validateRegistrationForm(data) {
  const { fullName, email, phoneNumber, barangay, password, confirmPassword } = data;
  const errors = {};

  // Full name — required
  if (!fullName || fullName.trim() === '') {
    errors.fullName = 'Full name is required.';
  }

  // Email — required + format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || email.trim() === '') {
    errors.email = 'Email address is required.';
  } else if (!emailRegex.test(email.trim())) {
    errors.email = 'Please enter a valid email address.';
  }

  // Phone number — required
  if (!phoneNumber || phoneNumber.trim() === '') {
    errors.phoneNumber = 'Phone number is required.';
  }

  // Barangay — required
  if (!barangay || barangay.trim() === '') {
    errors.barangay = 'Barangay is required.';
  }

  // Password — required AND ≥ 8 characters (both checks collapse to the same
  // message because an empty password also fails the length gate)
  if (!password || !validatePassword(password)) {
    errors.password = 'Password must be at least 8 characters.';
  }

  // Confirm password — must match password (only if password itself is valid)
  if (!errors.password && password !== confirmPassword) {
    errors.confirmPassword = 'Passwords do not match.';
  }
  // Also flag confirmPassword when it is empty and password is valid
  if (!errors.password && (confirmPassword === undefined || confirmPassword === null || confirmPassword === '')) {
    errors.confirmPassword = 'Please confirm your password.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

/**
 * Shows an inline validation error message below a form field.
 *
 * Looks for an element with id `<fieldId>-error` (created if it doesn't exist)
 * and sets its text content.  Also adds `aria-describedby` on the input so
 * screen readers announce the error.
 *
 * @param {string} fieldId - The `id` attribute of the input element.
 * @param {string} message - The error text to display.
 */
function showFieldError(fieldId, message) {
  const field = document.getElementById(fieldId);
  if (!field) return;

  let errorEl = document.getElementById(`${fieldId}-error`);
  if (!errorEl) {
    errorEl = document.createElement('p');
    errorEl.id = `${fieldId}-error`;
    errorEl.className = 'field-error';
    errorEl.setAttribute('role', 'alert');
    field.parentNode.insertBefore(errorEl, field.nextSibling);
  }

  errorEl.textContent = message;
  errorEl.hidden = false;
  field.setAttribute('aria-describedby', `${fieldId}-error`);
  field.classList.add('input--error');
}

/**
 * Clears the inline validation error for a given field.
 *
 * @param {string} fieldId
 */
function clearFieldError(fieldId) {
  const field = document.getElementById(fieldId);
  const errorEl = document.getElementById(`${fieldId}-error`);

  if (errorEl) {
    errorEl.textContent = '';
    errorEl.hidden = true;
  }
  if (field) {
    field.removeAttribute('aria-describedby');
    field.classList.remove('input--error');
  }
}

/**
 * Clears all registration form errors.
 */
function clearAllErrors() {
  [
    'full-name',
    'email',
    'phone',
    'barangay',
    'password',
    'confirm-password',
  ].forEach(clearFieldError);
}

/**
 * Maps validation error keys to DOM element IDs.
 * (The form uses `full-name`, `phone`, and `confirm-password` as IDs.)
 */
const FIELD_ID_MAP = {
  fullName: 'full-name',
  email: 'email',
  phoneNumber: 'phone',
  barangay: 'barangay',
  password: 'password',
  confirmPassword: 'confirm-password',
};

/**
 * Reads the current value of a form field by ID, trimming whitespace.
 * Returns an empty string if the element is not found.
 *
 * @param {string} id
 * @returns {string}
 */
function fieldValue(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

// ---------------------------------------------------------------------------
// Registration submit handler
// ---------------------------------------------------------------------------

/**
 * Handles the registration form submission:
 * 1. Runs client-side validation.
 * 2. On valid data, calls Firebase Auth `createUserWithEmailAndPassword`.
 * 3. Writes the user profile document to Firestore.
 * 4. Redirects to `resident.html` on success.
 *
 * @param {Event} event - The form submit event.
 */
async function handleRegisterSubmit(event) {
  event.preventDefault();

  // Collect field values (confirmPassword is NOT trimmed — exact match needed)
  const confirmPasswordEl = document.getElementById('confirm-password');
  const confirmPassword = confirmPasswordEl ? confirmPasswordEl.value : '';

  const data = {
    fullName: fieldValue('full-name'),
    email: fieldValue('email'),
    phoneNumber: fieldValue('phone'),
    barangay: fieldValue('barangay'),
    password: fieldValue('password'),
    confirmPassword,
  };

  // Clear previous errors
  clearAllErrors();

  // Validate
  const { valid, errors } = validateRegistrationForm(data);

  if (!valid) {
    // Display inline errors for each failing field
    for (const [key, message] of Object.entries(errors)) {
      const domId = FIELD_ID_MAP[key];
      if (domId) showFieldError(domId, message);
    }
    // Focus the first errored field
    const firstErrorKey = Object.keys(errors)[0];
    const firstErrorId = FIELD_ID_MAP[firstErrorKey];
    if (firstErrorId) {
      const firstField = document.getElementById(firstErrorId);
      if (firstField) firstField.focus();
    }
    return;
  }

  // --- Firebase operations ---
  try {
    // 1. Create Auth account
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      data.email,
      data.password
    );
    const { uid } = userCredential.user;

    // 2. Write Firestore user document
    await setDoc(doc(db, 'users', uid), {
      fullName: data.fullName,
      email: data.email,
      phoneNumber: data.phoneNumber,
      barangay: data.barangay,
      role: 'resident',
      createdAt: serverTimestamp(),
    });

    // 3. Redirect to resident dashboard
    window.location.href = 'resident.html';
  } catch (err) {
    if (err.code === 'auth/email-already-in-use') {
      showFieldError('email', 'This email address is already registered.');
    } else {
      // Generic Firebase/network error — surface via toast
      showToast(err.message || 'Registration failed. Please try again.', 'error');
    }
  }
}

// ---------------------------------------------------------------------------
// Password UI — strength meter, show/hide toggles, clear-on-input
// ---------------------------------------------------------------------------

/**
 * Returns the strength level of a password: 'weak', 'medium', 'strong', or ''.
 *
 * Rules:
 * - ''      : empty or fewer than 8 characters
 * - 'weak'  : 8–11 characters with no mixed character requirement
 * - 'medium': 8+ characters with at least one uppercase AND (one digit OR one special char)
 * - 'strong': 12+ characters with uppercase AND digit AND special char
 *
 * @param {string} password
 * @returns {'' | 'weak' | 'medium' | 'strong'}
 */
export function getPasswordStrength(password) {
  if (!password || password.length < 8) return '';

  const hasUpper   = /[A-Z]/.test(password);
  const hasDigit   = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  if (password.length >= 12 && hasUpper && hasDigit && hasSpecial) return 'strong';
  if (password.length >= 8  && hasUpper && (hasDigit || hasSpecial)) return 'medium';
  return 'weak';
}

/**
 * Wires:
 * 1. Password strength meter (input event on #password)
 * 2. Show/hide toggles for #password and #confirm-password
 * 3. Clear-on-input for all six form fields
 */
function initPasswordUI() {
  // ── 1. Password strength meter ──────────────────────────────────────────
  const passwordInput  = document.getElementById('password');
  const strengthFill   = document.getElementById('strength-fill');
  const strengthLabel  = document.getElementById('password-strength-hint');

  const STRENGTH_FILL_CLASSES  = ['password-strength__fill--weak', 'password-strength__fill--medium', 'password-strength__fill--strong'];
  const STRENGTH_LABEL_CLASSES = ['password-strength__label--weak', 'password-strength__label--medium', 'password-strength__label--strong'];

  const STRENGTH_TEXT = {
    weak: 'Weak',
    medium: 'Medium',
    strong: 'Strong',
  };

  if (passwordInput && strengthFill && strengthLabel) {
    passwordInput.addEventListener('input', () => {
      const level = getPasswordStrength(passwordInput.value);

      // Remove all strength modifier classes
      strengthFill.classList.remove(...STRENGTH_FILL_CLASSES);
      strengthLabel.classList.remove(...STRENGTH_LABEL_CLASSES);

      if (level) {
        strengthFill.classList.add(`password-strength__fill--${level}`);
        strengthLabel.classList.add(`password-strength__label--${level}`);
        strengthLabel.textContent = STRENGTH_TEXT[level];
      } else {
        strengthLabel.textContent = '';
      }
    });
  }

  // ── 2. Show/hide password toggles ───────────────────────────────────────

  /**
   * Wires a single show/hide toggle button.
   *
   * @param {string} toggleId      — id of the <button>
   * @param {string} inputId       — id of the <input type="password">
   * @param {string} eyeOnId       — id of the "eye" SVG (shown when password is hidden)
   * @param {string} eyeOffId      — id of the "eye-off" SVG (shown when password is visible)
   */
  function wireToggle(toggleId, inputId, eyeOnId, eyeOffId) {
    const btn    = document.getElementById(toggleId);
    const input  = document.getElementById(inputId);
    const eyeOn  = document.getElementById(eyeOnId);
    const eyeOff = document.getElementById(eyeOffId);

    if (!btn || !input) return;

    btn.addEventListener('click', () => {
      const isVisible = input.type === 'text';

      input.type = isVisible ? 'password' : 'text';
      btn.setAttribute('aria-pressed', String(!isVisible));

      if (eyeOn)  eyeOn.style.display  = isVisible ? ''     : 'none';
      if (eyeOff) eyeOff.style.display = isVisible ? 'none' : '';
    });
  }

  wireToggle('toggle-password',         'password',         'eye-icon-password', 'eye-off-icon-password');
  wireToggle('toggle-confirm-password', 'confirm-password', 'eye-icon-confirm',  'eye-off-icon-confirm');

  // ── 3. Clear field error on input ───────────────────────────────────────
  [
    'full-name',
    'email',
    'phone',
    'barangay',
    'password',
    'confirm-password',
  ].forEach((fieldId) => {
    const el = document.getElementById(fieldId);
    if (el) {
      el.addEventListener('input', () => clearFieldError(fieldId));
    }
  });
}

// ---------------------------------------------------------------------------
// Initialise on DOMContentLoaded
// ---------------------------------------------------------------------------

/**
 * Wires the registration form submit handler and password UI features.
 * Called automatically when the module is loaded in a browser context.
 */
function initRegisterPage() {
  const form = document.getElementById('register-form');
  if (!form) return; // module may be imported in a non-browser test context
  form.addEventListener('submit', handleRegisterSubmit);
  initPasswordUI();
}

// Auto-init when running in a real browser page
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRegisterPage);
  } else {
    initRegisterPage();
  }
}
