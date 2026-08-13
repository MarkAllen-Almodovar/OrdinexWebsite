import {
  signInWithPopup,
  GoogleAuthProvider,
  FacebookAuthProvider,
  OAuthProvider,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../shared/firebase.js';
import { showToast } from '../shared/ui-helpers.js';

/**
 * Returns the Firebase Auth provider instance for the given provider name.
 *
 * @param {'google'|'facebook'|'apple'} providerName
 * @returns {GoogleAuthProvider|FacebookAuthProvider|OAuthProvider}
 * @throws {Error} if providerName is unrecognised
 */
function getProvider(providerName) {
  switch (providerName) {
    case 'google':
      return new GoogleAuthProvider();
    case 'facebook':
      return new FacebookAuthProvider();
    case 'apple':
      return new OAuthProvider('apple.com');
    default:
      throw new Error(`Unknown social provider: "${providerName}"`);
  }
}

/**
 * Initiates a social OAuth login popup for the given provider.
 *
 * Flow:
 *  1. Opens the provider's sign-in popup via Firebase Auth.
 *  2. If the user is new (no Firestore doc yet), creates a user document in
 *     `users/{uid}` with a default role of 'resident'.
 *  3. Reads the user's role from Firestore and redirects to the appropriate
 *     dashboard (`/resident.html` or `/admin.html`).
 *
 * @param {'google'|'facebook'|'apple'} providerName - Which OAuth provider to use.
 * @returns {Promise<void>}
 */
export async function handleSocialLogin(providerName) {
  let provider;
  try {
    provider = getProvider(providerName);
  } catch (err) {
    console.error('[social] Invalid provider:', err);
    showToast('Unknown sign-in provider. Please try again.', 'error');
    return;
  }

  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    // ── Check whether a Firestore user document already exists ───────────────
    const userRef = doc(db, 'users', user.uid);
    const snap = await getDoc(userRef);

    let role;

    if (!snap.exists()) {
      // New user — create a Firestore document with default role 'resident'
      const newUserData = {
        fullName: user.displayName || '',
        email: user.email || '',
        phoneNumber: user.phoneNumber || '',
        barangay: '',
        role: 'resident',
        createdAt: serverTimestamp(),
      };
      await setDoc(userRef, newUserData);
      role = 'resident';
    } else {
      // Existing user — read their stored role
      role = snap.data()?.role ?? 'resident';
    }

    // ── Redirect to the role-appropriate dashboard ────────────────────────────
    window.location.href = role === 'official' ? '/admin.html' : '/resident.html';
  } catch (err) {
    // Ignore popup-cancelled errors silently (user closed the popup)
    if (
      err.code === 'auth/popup-closed-by-user' ||
      err.code === 'auth/cancelled-popup-request'
    ) {
      return;
    }

    console.error('[social] Social login error:', err);
    showToast('Sign-in failed. Please try again.', 'error');
  }
}
