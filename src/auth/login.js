/**
 * Admin login — Phone number + OTP via Firebase Phone Auth.
 *
 * Flow:
 *  1. Admin enters phone number (e.g. 09391034185).
 *  2. Number is normalised to E.164 (+63 format for PH numbers).
 *  3. Firebase sends an SMS OTP using an invisible reCAPTCHA verifier.
 *  4. Admin enters the 6-digit OTP.
 *  5. On success, Firebase session is created and the user is redirected
 *     to /admin.html.
 *  6. If the authenticated user's Firestore role is NOT 'official', they
 *     are signed out and shown an access-denied error.
 */

import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  onAuthStateChanged,
} from 'firebase/auth';
import { getDoc, doc } from 'firebase/firestore';
import { auth, db } from '../shared/firebase.js';
import { showToast } from '../shared/ui-helpers.js';

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

const phoneForm     = document.getElementById('phone-form');
const otpForm       = document.getElementById('otp-form');
const phoneInput    = document.getElementById('phone-input');
const otpInput      = document.getElementById('otp-input');
const sendOtpBtn    = document.getElementById('send-otp-btn');
const verifyOtpBtn  = document.getElementById('verify-otp-btn');
const changePhoneBtn = document.getElementById('change-phone-btn');
const authError     = document.getElementById('auth-error');
const phoneError    = document.getElementById('phone-error');
const otpError      = document.getElementById('otp-error');
const otpInfo       = document.getElementById('otp-info');

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

/** Firebase confirmation result returned after sending the OTP. */
let confirmationResult = null;

/** reCAPTCHA verifier — created once and reused. */
let recaptchaVerifier = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalises a Philippine mobile number to E.164 format (+63XXXXXXXXX).
 * Accepts: 09XXXXXXXXX, 9XXXXXXXXX, +639XXXXXXXXX
 *
 * @param {string} raw
 * @returns {string|null} E.164 number or null if unrecognised format.
 */
function normalisePhilippineNumber(raw) {
  const digits = raw.replace(/\s|-/g, '');

  // Already E.164
  if (/^\+639\d{9}$/.test(digits)) return digits;

  // 09XXXXXXXXX → +639XXXXXXXXX
  if (/^09\d{9}$/.test(digits)) return '+63' + digits.slice(1);

  // 9XXXXXXXXX → +639XXXXXXXXX
  if (/^9\d{9}$/.test(digits)) return '+63' + digits;

  return null;
}

function showError(el, msg) {
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
}

function clearError(el) {
  if (!el) return;
  el.textContent = '';
  el.hidden = true;
}

function showAuthError(msg) {
  if (!authError) return;
  authError.textContent = msg;
  authError.hidden = false;
}

function clearAuthError() {
  if (!authError) return;
  authError.textContent = '';
  authError.hidden = true;
}

function setLoading(btn, loading, label) {
  btn.disabled = loading;
  btn.textContent = loading ? 'Please wait…' : label;
}

// ---------------------------------------------------------------------------
// Step 1 — Send OTP
// ---------------------------------------------------------------------------

function initRecaptcha() {
  if (recaptchaVerifier) return;

  recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
    size: 'invisible',
    callback: () => {
      // reCAPTCHA solved — signInWithPhoneNumber can proceed.
    },
  });
}

async function handleSendOtp(e) {
  e.preventDefault();
  clearAuthError();
  clearError(phoneError);

  const raw = phoneInput?.value?.trim() ?? '';
  if (!raw) {
    showError(phoneError, 'Please enter your phone number.');
    phoneInput?.focus();
    return;
  }

  const e164 = normalisePhilippineNumber(raw);
  if (!e164) {
    showError(phoneError, 'Enter a valid Philippine mobile number (e.g. 09391034185).');
    phoneInput?.focus();
    return;
  }

  setLoading(sendOtpBtn, true, 'Send OTP');

  try {
    initRecaptcha();
    confirmationResult = await signInWithPhoneNumber(auth, e164, recaptchaVerifier);

    // Show OTP form
    phoneForm.hidden = true;
    otpForm.hidden = false;
    if (otpInfo) otpInfo.textContent = `OTP sent to ${raw}. Enter the 6-digit code below.`;
    otpInput?.focus();
  } catch (err) {
    console.error('[login] sendOTP error:', err);

    // Reset reCAPTCHA so the user can retry
    recaptchaVerifier?.clear();
    recaptchaVerifier = null;

    const msg = phoneAuthErrorMessage(err.code);
    showAuthError(msg);
    setLoading(sendOtpBtn, false, 'Send OTP');
  }
}

// ---------------------------------------------------------------------------
// Step 2 — Verify OTP
// ---------------------------------------------------------------------------

async function handleVerifyOtp(e) {
  e.preventDefault();
  clearAuthError();
  clearError(otpError);

  const code = otpInput?.value?.trim() ?? '';
  if (!code || code.length < 4) {
    showError(otpError, 'Please enter the OTP sent to your phone.');
    otpInput?.focus();
    return;
  }

  if (!confirmationResult) {
    showAuthError('Session expired. Please go back and request a new OTP.');
    return;
  }

  setLoading(verifyOtpBtn, true, 'Verify & Sign In');

  try {
    const credential = await confirmationResult.confirm(code);
    const user = credential.user;

    // Verify the user is an admin in Firestore
    const snap = await getDoc(doc(db, 'users', user.uid));
    console.log('[login] uid:', user.uid, '| snap exists:', snap.exists(), '| data:', snap.data());
    const role = snap.data()?.role;

    if (role !== 'official') {
      // Not an admin — sign them out immediately
      await getAuth().signOut();
      showAuthError('Access denied. This portal is for municipal officials only.');
      setLoading(verifyOtpBtn, false, 'Verify & Sign In');
      return;
    }

    // Redirect to admin dashboard
    window.location.href = '/admin.html';
  } catch (err) {
    console.error('[login] verifyOTP error:', err);
    const msg = otpErrorMessage(err.code);
    showError(otpError, msg);
    setLoading(verifyOtpBtn, false, 'Verify & Sign In');
  }
}

// ---------------------------------------------------------------------------
// Change phone — go back to step 1
// ---------------------------------------------------------------------------

function handleChangePhone() {
  confirmationResult = null;
  recaptchaVerifier?.clear();
  recaptchaVerifier = null;

  otpForm.hidden = true;
  phoneForm.hidden = false;
  otpInput.value = '';
  clearAuthError();
  clearError(otpError);
  phoneInput?.focus();
}

// ---------------------------------------------------------------------------
// Auth state guard — redirect if already signed in as official
// ---------------------------------------------------------------------------

onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    const role = snap.data()?.role;
    if (role === 'official') {
      window.location.href = '/admin.html';
    }
  } catch {
    // Firestore not available yet — stay on login page
  }
});

// ---------------------------------------------------------------------------
// Error message maps
// ---------------------------------------------------------------------------

function phoneAuthErrorMessage(code) {
  const map = {
    'auth/invalid-phone-number':     'Invalid phone number format. Use 09XXXXXXXXX.',
    'auth/too-many-requests':        'Too many attempts. Please wait before trying again.',
    'auth/quota-exceeded':           'SMS quota exceeded. Please try again later.',
    'auth/captcha-check-failed':     'reCAPTCHA check failed. Please refresh and try again.',
    'auth/network-request-failed':   'Network error. Check your connection and retry.',
  };
  return map[code] ?? 'Failed to send OTP. Please try again.';
}

function otpErrorMessage(code) {
  const map = {
    'auth/invalid-verification-code': 'Incorrect OTP. Please check and try again.',
    'auth/code-expired':              'OTP has expired. Please request a new one.',
    'auth/session-expired':           'Session expired. Please request a new OTP.',
    'auth/network-request-failed':    'Network error. Check your connection and retry.',
  };
  return map[code] ?? 'Verification failed. Please try again.';
}

// ---------------------------------------------------------------------------
// Wire up events
// ---------------------------------------------------------------------------

phoneForm?.addEventListener('submit', handleSendOtp);
otpForm?.addEventListener('submit', handleVerifyOtp);
changePhoneBtn?.addEventListener('click', handleChangePhone);

// Clear errors on input
phoneInput?.addEventListener('input', () => {
  clearError(phoneError);
  clearAuthError();
});
otpInput?.addEventListener('input', () => {
  clearError(otpError);
  clearAuthError();
});
