import { signOut } from 'firebase/auth';
import { auth } from '../shared/firebase.js';
import { authGuard } from '../shared/auth-guard.js';

// ── Section routing ──────────────────────────────────────────────────────────

/**
 * Map of section name → lazy-load factory.
 * Each factory is called once; subsequent visits reuse the cached module.
 */
const SECTION_MODULES = {
  'dashboard':           () => import('../admin/dashboard.js'),
  'concern-management':  () => import('../admin/concern-table.js'),
  'settings':            () => import('../admin/settings.js'),
};

/** Sections whose `init()` has already been called — prevents double-init. */
const initialisedSections = new Set();

/**
 * Activate a named section:
 *  1. Toggle `is-active` on all `.admin-nav__link` elements.
 *  2. Toggle `is-active` on all `[id^="section-"]` panels.
 *  3. On first visit: lazy-import the module and call `init(container, uid)`.
 *
 * @param {string}                        sectionName
 * @param {import('firebase/auth').User}  user
 */
async function activateSection(sectionName, user) {
  // ── Nav link active state ─────────────────────────────────────────────────
  document.querySelectorAll('.admin-nav__link').forEach((link) => {
    if (link.dataset.section === sectionName) {
      link.classList.add('is-active');
      link.setAttribute('aria-current', 'page');
    } else {
      link.classList.remove('is-active');
      link.removeAttribute('aria-current');
    }
  });

  // ── Section panel visibility ──────────────────────────────────────────────
  document.querySelectorAll('[id^="section-"]').forEach((panel) => {
    panel.classList.remove('is-active');
  });

  const container = document.getElementById(`section-${sectionName}`);
  if (container) {
    container.classList.add('is-active');
  }

  // ── Lazy-load + init on first activation ──────────────────────────────────
  if (!initialisedSections.has(sectionName) && SECTION_MODULES[sectionName]) {
    initialisedSections.add(sectionName);
    try {
      const module = await SECTION_MODULES[sectionName]();
      if (typeof module?.init === 'function') {
        module.init(container, user?.uid);
      }
    } catch (err) {
      console.error(`[admin/app] Failed to load module for section "${sectionName}":`, err);
      // Allow retry on next activation by removing the section from the set
      initialisedSections.delete(sectionName);
    }
  }
}

// ── Sidebar helpers ──────────────────────────────────────────────────────────

function closeSidebar() {
  const sidebar  = document.getElementById('admin-sidebar');
  const overlay  = document.getElementById('sidebar-overlay');
  const toggle   = document.getElementById('menu-toggle');

  sidebar?.classList.remove('is-open');
  overlay?.classList.remove('is-visible');
  toggle?.setAttribute('aria-expanded', 'false');
}

function openSidebar() {
  const sidebar  = document.getElementById('admin-sidebar');
  const overlay  = document.getElementById('sidebar-overlay');
  const toggle   = document.getElementById('menu-toggle');

  sidebar?.classList.add('is-open');
  overlay?.classList.add('is-visible');
  toggle?.setAttribute('aria-expanded', 'true');
}

// ── Initialisation ───────────────────────────────────────────────────────────

async function init() {
  // Auth guard — redirects to /index.html if not an official.
  const user = await authGuard('official');

  // ── Section nav click handlers ────────────────────────────────────────────
  document.querySelectorAll('.admin-nav__link').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const section = link.dataset.section;
      if (section) {
        activateSection(section, user);
      }
      // Close mobile sidebar whenever a nav link is tapped
      closeSidebar();
    });
  });

  // ── Hamburger menu toggle ─────────────────────────────────────────────────
  const menuToggle = document.getElementById('menu-toggle');
  menuToggle?.addEventListener('click', () => {
    const sidebar = document.getElementById('admin-sidebar');
    if (sidebar?.classList.contains('is-open')) {
      closeSidebar();
    } else {
      openSidebar();
    }
  });

  // ── Sidebar overlay click → close sidebar ────────────────────────────────
  document.getElementById('sidebar-overlay')?.addEventListener('click', () => {
    closeSidebar();
  });

  // ── Sign Out ──────────────────────────────────────────────────────────────
  document.getElementById('sign-out-btn')?.addEventListener('click', () => {
    signOut(auth)
      .catch(() => {})
      .finally(() => {
        window.location.href = '/index.html';
      });
  });

  // ── Activate default section (dashboard) on first load ────────────────────
  activateSection('dashboard', user);
}

init();
