/**
 * Firebase Auth guard for protected pages.
 * Redirects to /index.html if the user is not signed in.
 */

import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase.js';

/**
 * Protects a page — redirects to login if not signed in.
 * Returns a promise that resolves with the Firebase user when authenticated.
 */
export function authGuard() {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, (user) => {
      if (!user) {
        window.location.href = '/index.html';
      } else {
        resolve(user);
      }
    });
  });
}

/**
 * For the login page — redirects to admin dashboard if already signed in.
 */
export function authGuardLogin() {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      window.location.href = '/admin.html';
    }
  });
}

/**
 * Sign out helper.
 */
export function clearSession() {
  return auth.signOut();
}
