import { onAuthStateChanged } from 'firebase/auth';
import { getDoc, doc } from 'firebase/firestore';
import { auth, db } from './firebase.js';

/**
 * Role-aware auth guard for protected pages.
 *
 * @param {string|undefined} requiredRole - The role required to access the current page
 *   ('resident' or 'official'). Pass no argument (or undefined) on the login page to
 *   simply check whether a session already exists and redirect logged-in users to their
 *   appropriate dashboard.
 *
 * @returns {Promise<import('firebase/auth').User>} Resolves with the Firebase User object
 *   when the session is valid and the role matches. Redirects (never resolves) when the
 *   session is missing or the role does not match.
 *
 * Usage on a protected page:
 *   import { authGuard } from '../shared/auth-guard.js';
 *   const user = await authGuard('resident');
 *
 * Usage on the login page (redirect away if already logged in):
 *   import { authGuard } from '../shared/auth-guard.js';
 *   authGuard(); // no argument — checks session and redirects if authenticated
 */
export async function authGuard(requiredRole) {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      // ── No session ──────────────────────────────────────────────────────────
      if (!user) {
        if (requiredRole !== undefined) {
          // Protected page: must be logged in
          window.location.href = '/index.html';
        } else {
          // Login / public page: no session is fine — let the page render
          resolve(null);
        }
        return;
      }

      // ── Session exists — fetch the user's role from Firestore ────────────
      let role;
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        role = snap.data()?.role;
      } catch (err) {
        // Firestore read failed — treat as unauthenticated to fail safe
        console.error('[authGuard] Failed to read user role:', err);
        if (requiredRole !== undefined) {
          window.location.href = '/index.html';
        } else {
          resolve(null);
        }
        return;
      }

      // ── No requiredRole (login page) — redirect to appropriate dashboard ──
      if (requiredRole === undefined) {
        window.location.href = role === 'official' ? '/admin.html' : '/resident.html';
        return;
      }

      // ── Role mismatch — send to the page the user actually belongs to ─────
      if (role !== requiredRole) {
        window.location.href = role === 'official' ? '/admin.html' : '/resident.html';
        return;
      }

      // ── Role matches — grant access ───────────────────────────────────────
      resolve(user);
    });
  });
}
