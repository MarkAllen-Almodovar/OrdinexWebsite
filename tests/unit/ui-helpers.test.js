/**
 * Unit tests for src/shared/ui-helpers.js
 *
 * Covers: statusBadge, formatDate, showToast, showLoadingOverlay / hideLoadingOverlay
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  statusBadge,
  formatDate,
  showToast,
  showLoadingOverlay,
  hideLoadingOverlay,
} from '../../src/shared/ui-helpers.js';

// ---------------------------------------------------------------------------
// statusBadge
// ---------------------------------------------------------------------------

describe('statusBadge', () => {
  it('returns a <span> element', () => {
    const el = statusBadge('Pending');
    expect(el.tagName).toBe('SPAN');
  });

  it.each(['Pending', 'Ongoing', 'Completed'])(
    'sets class badge--<lowercase> for status "%s"',
    (status) => {
      const el = statusBadge(status);
      expect(el.className).toBe(`badge badge--${status.toLowerCase()}`);
    }
  );

  it.each(['Pending', 'Ongoing', 'Completed'])(
    'sets inner text to the status value "%s"',
    (status) => {
      const el = statusBadge(status);
      expect(el.textContent).toBe(status);
    }
  );

  it('handles lowercase status input gracefully', () => {
    const el = statusBadge('pending');
    expect(el.className).toBe('badge badge--pending');
    expect(el.textContent).toBe('pending');
  });
});

// ---------------------------------------------------------------------------
// formatDate
// ---------------------------------------------------------------------------

describe('formatDate', () => {
  it('formats a plain JS Date correctly', () => {
    // January 15, 2025 (months are 0-indexed in Date constructor)
    const date = new Date(2025, 0, 15);
    expect(formatDate(date)).toBe('Jan 15, 2025');
  });

  it('formats a Firestore-like Timestamp object (with .toDate())', () => {
    const fakeTimestamp = {
      toDate: () => new Date(2024, 5, 3), // June 3, 2024
    };
    expect(formatDate(fakeTimestamp)).toBe('Jun 3, 2024');
  });

  it('returns a non-empty string', () => {
    const result = formatDate(new Date(2023, 11, 31));
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  it('correctly encodes the year from the date', () => {
    const result = formatDate(new Date(2030, 3, 20)); // April 20, 2030
    expect(result).toContain('2030');
  });

  it('correctly encodes the month abbreviation', () => {
    const result = formatDate(new Date(2025, 6, 7)); // July 7, 2025
    expect(result).toContain('Jul');
  });

  it('correctly encodes the day', () => {
    const result = formatDate(new Date(2025, 0, 1)); // Jan 1, 2025
    expect(result).toContain('1');
  });
});

// ---------------------------------------------------------------------------
// showToast
// ---------------------------------------------------------------------------

describe('showToast', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
    vi.useFakeTimers();
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.useRealTimers();
  });

  it('appends a toast element to #toast-container', () => {
    showToast('Test message');
    expect(container.children.length).toBe(1);
  });

  it('displays the provided message text', () => {
    showToast('Hello world');
    const toastText = container.querySelector('.toast__message');
    expect(toastText.textContent).toBe('Hello world');
  });

  it('applies the correct type class (success by default)', () => {
    showToast('Success message');
    const toast = container.querySelector('.toast');
    expect(toast.className).toContain('toast--success');
  });

  it('applies the correct type class when type is "error"', () => {
    showToast('Error message', 'error');
    const toast = container.querySelector('.toast');
    expect(toast.className).toContain('toast--error');
  });

  it('renders a dismiss close button', () => {
    showToast('Message');
    const closeBtn = container.querySelector('.toast__close');
    expect(closeBtn).not.toBeNull();
  });

  it('removes the toast when the close button is clicked', () => {
    showToast('Message');
    const closeBtn = container.querySelector('.toast__close');
    closeBtn.click();
    // Allow the 300 ms removal timeout to fire
    vi.advanceTimersByTime(300);
    expect(container.children.length).toBe(0);
  });

  it('auto-dismisses after 4 seconds', () => {
    showToast('Auto dismiss');
    vi.advanceTimersByTime(4000 + 300); // 4 s + transition
    expect(container.children.length).toBe(0);
  });

  it('is a no-op when #toast-container does not exist', () => {
    document.body.removeChild(container);
    expect(() => showToast('No container')).not.toThrow();
    // Re-add so afterEach cleanup doesn't fail
    document.body.appendChild(container);
  });

  it('has role="alert" for accessibility', () => {
    showToast('Accessible toast');
    const toast = container.querySelector('.toast');
    expect(toast.getAttribute('role')).toBe('alert');
  });
});

// ---------------------------------------------------------------------------
// showLoadingOverlay / hideLoadingOverlay
// ---------------------------------------------------------------------------

describe('showLoadingOverlay / hideLoadingOverlay', () => {
  beforeEach(() => {
    // Clean up any leftover overlay from previous test
    const existing = document.getElementById('loading-overlay');
    if (existing) existing.remove();
  });

  it('creates an overlay element when none exists', () => {
    showLoadingOverlay();
    const overlay = document.getElementById('loading-overlay');
    expect(overlay).not.toBeNull();
  });

  it('overlay is visible after showLoadingOverlay()', () => {
    showLoadingOverlay();
    const overlay = document.getElementById('loading-overlay');
    expect(overlay.hidden).toBe(false);
  });

  it('overlay is hidden after hideLoadingOverlay()', () => {
    showLoadingOverlay();
    hideLoadingOverlay();
    const overlay = document.getElementById('loading-overlay');
    expect(overlay.hidden).toBe(true);
  });

  it('overlay contains a spinner element', () => {
    showLoadingOverlay();
    const spinner = document.querySelector('.loading-overlay__spinner');
    expect(spinner).not.toBeNull();
  });

  it('appends overlay to active section when one exists', () => {
    const section = document.createElement('section');
    section.className = 'active';
    document.body.appendChild(section);

    showLoadingOverlay();
    const overlay = section.querySelector('#loading-overlay');
    expect(overlay).not.toBeNull();

    section.remove();
  });

  it('hideLoadingOverlay is a no-op when overlay does not exist', () => {
    expect(() => hideLoadingOverlay()).not.toThrow();
  });

  it('calling showLoadingOverlay twice does not create duplicate overlays', () => {
    showLoadingOverlay();
    showLoadingOverlay();
    const overlays = document.querySelectorAll('#loading-overlay');
    expect(overlays.length).toBe(1);
  });

  it('overlay has accessible role="status"', () => {
    showLoadingOverlay();
    const overlay = document.getElementById('loading-overlay');
    expect(overlay.getAttribute('role')).toBe('status');
  });
});
