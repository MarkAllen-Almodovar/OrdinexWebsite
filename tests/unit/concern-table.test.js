/**
 * Unit tests for src/admin/concern-table.js
 *
 * Covers the pure exported functions:
 *   - applyFilters(reports, { status, category, search })
 *   - paginateReports(reports, page, pageSize)
 */

import { describe, it, expect, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Firebase modules so pure function tests don't need real credentials.
// ---------------------------------------------------------------------------
vi.mock('../../src/shared/firebase.js', () => ({
  db: {},
  auth: {},
  storage: {},
  default: {},
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  onSnapshot: vi.fn(),
  updateDoc: vi.fn(),
  addDoc: vi.fn(),
  getDocs: vi.fn(),
  doc: vi.fn(),
  serverTimestamp: vi.fn(),
}));

vi.mock('../../src/shared/ui-helpers.js', () => ({
  statusBadge: vi.fn(() => document.createElement('span')),
  formatDate: vi.fn((d) => (d ? 'Jan 1, 2025' : '—')),
  showToast: vi.fn(),
}));

import { applyFilters, paginateReports } from '../../src/admin/concern-table.js';

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------

/** Create a minimal report object for testing. */
function makeReport(overrides = {}) {
  return {
    id: 'report-1',
    residentName: 'Juan dela Cruz',
    category: 'Noise Disturbances',
    description: 'Loud music at night near the park.',
    status: 'Pending',
    submittedAt: null,
    ...overrides,
  };
}

const SAMPLE_REPORTS = [
  makeReport({ id: 'r1', status: 'Pending',   category: 'Noise Disturbances',      residentName: 'Alice', description: 'loud noise' }),
  makeReport({ id: 'r2', status: 'Ongoing',   category: 'Illegal Parking',         residentName: 'Bob',   description: 'car blocking driveway' }),
  makeReport({ id: 'r3', status: 'Completed', category: 'Improper Garbage Disposal', residentName: 'Carol', description: 'trash on sidewalk' }),
  makeReport({ id: 'r4', status: 'Pending',   category: 'Public Disturbance',      residentName: 'Dave',  description: 'fight near plaza' }),
  makeReport({ id: 'r5', status: 'Ongoing',   category: 'Others',                  residentName: 'Eve',   description: 'broken streetlight' }),
];

// ---------------------------------------------------------------------------
// applyFilters — status filter
// ---------------------------------------------------------------------------

describe('applyFilters — status filter', () => {
  it('returns all reports when status is "All"', () => {
    const result = applyFilters(SAMPLE_REPORTS, { status: 'All' });
    expect(result).toHaveLength(SAMPLE_REPORTS.length);
  });

  it('returns only Pending reports when status is "Pending"', () => {
    const result = applyFilters(SAMPLE_REPORTS, { status: 'Pending' });
    expect(result.every((r) => r.status === 'Pending')).toBe(true);
  });

  it('returns only Ongoing reports when status is "Ongoing"', () => {
    const result = applyFilters(SAMPLE_REPORTS, { status: 'Ongoing' });
    expect(result.every((r) => r.status === 'Ongoing')).toBe(true);
    expect(result).toHaveLength(2);
  });

  it('returns only Completed reports when status is "Completed"', () => {
    const result = applyFilters(SAMPLE_REPORTS, { status: 'Completed' });
    expect(result.every((r) => r.status === 'Completed')).toBe(true);
    expect(result).toHaveLength(1);
  });

  it('returns an empty array when no reports match the status', () => {
    const result = applyFilters(SAMPLE_REPORTS, { status: 'Completed' });
    // There is one completed, so filter by a non-existent status:
    const noMatch = applyFilters([], { status: 'Pending' });
    expect(noMatch).toHaveLength(0);
  });

  it('result length is always ≤ input length', () => {
    const result = applyFilters(SAMPLE_REPORTS, { status: 'Pending' });
    expect(result.length).toBeLessThanOrEqual(SAMPLE_REPORTS.length);
  });
});

// ---------------------------------------------------------------------------
// applyFilters — category filter
// ---------------------------------------------------------------------------

describe('applyFilters — category filter', () => {
  it('returns all reports when category is "All"', () => {
    const result = applyFilters(SAMPLE_REPORTS, { category: 'All' });
    expect(result).toHaveLength(SAMPLE_REPORTS.length);
  });

  it('returns only reports matching the given category', () => {
    const result = applyFilters(SAMPLE_REPORTS, { category: 'Illegal Parking' });
    expect(result.every((r) => r.category === 'Illegal Parking')).toBe(true);
    expect(result).toHaveLength(1);
  });

  it('returns an empty array when category has no matches', () => {
    const result = applyFilters(SAMPLE_REPORTS, { category: 'Unknown Category' });
    expect(result).toHaveLength(0);
  });

  it('result length is always ≤ input length', () => {
    const result = applyFilters(SAMPLE_REPORTS, { category: 'Others' });
    expect(result.length).toBeLessThanOrEqual(SAMPLE_REPORTS.length);
  });
});

// ---------------------------------------------------------------------------
// applyFilters — search filter
// ---------------------------------------------------------------------------

describe('applyFilters — search filter', () => {
  it('returns all reports when search is empty string', () => {
    const result = applyFilters(SAMPLE_REPORTS, { search: '' });
    expect(result).toHaveLength(SAMPLE_REPORTS.length);
  });

  it('matches description (case-insensitive)', () => {
    const result = applyFilters(SAMPLE_REPORTS, { search: 'LOUD' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('r1');
  });

  it('matches residentName (case-insensitive)', () => {
    const result = applyFilters(SAMPLE_REPORTS, { search: 'bob' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('r2');
  });

  it('matches partial substrings', () => {
    const result = applyFilters(SAMPLE_REPORTS, { search: 'trash' });
    expect(result).toHaveLength(1);
    expect(result[0].description).toContain('trash');
  });

  it('returns empty array when nothing matches', () => {
    const result = applyFilters(SAMPLE_REPORTS, { search: 'zzz-no-match' });
    expect(result).toHaveLength(0);
  });

  it('trims leading/trailing whitespace in search term', () => {
    const result = applyFilters(SAMPLE_REPORTS, { search: '  alice  ' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('r1');
  });
});

// ---------------------------------------------------------------------------
// applyFilters — combined filters
// ---------------------------------------------------------------------------

describe('applyFilters — combined filters', () => {
  it('applies status AND category together', () => {
    const result = applyFilters(SAMPLE_REPORTS, {
      status: 'Pending',
      category: 'Noise Disturbances',
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('r1');
  });

  it('applies status AND search together', () => {
    const result = applyFilters(SAMPLE_REPORTS, {
      status: 'Pending',
      search: 'fight',
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('r4');
  });

  it('returns empty when combined filters have no overlap', () => {
    const result = applyFilters(SAMPLE_REPORTS, {
      status: 'Completed',
      category: 'Noise Disturbances',
    });
    expect(result).toHaveLength(0);
  });

  it('does not mutate the input array', () => {
    const input = [...SAMPLE_REPORTS];
    const originalLength = input.length;
    applyFilters(input, { status: 'Pending', search: 'alice' });
    expect(input).toHaveLength(originalLength);
  });
});

// ---------------------------------------------------------------------------
// applyFilters — defaults
// ---------------------------------------------------------------------------

describe('applyFilters — defaults', () => {
  it('returns all reports when called with no filter object', () => {
    const result = applyFilters(SAMPLE_REPORTS);
    expect(result).toHaveLength(SAMPLE_REPORTS.length);
  });

  it('returns all reports when called with empty filter object', () => {
    const result = applyFilters(SAMPLE_REPORTS, {});
    expect(result).toHaveLength(SAMPLE_REPORTS.length);
  });

  it('handles reports with missing description/residentName gracefully', () => {
    const reports = [{ id: 'r-missing', status: 'Pending', category: 'Others' }];
    expect(() => applyFilters(reports, { search: 'test' })).not.toThrow();
    const result = applyFilters(reports, { search: 'test' });
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// paginateReports
// ---------------------------------------------------------------------------

describe('paginateReports', () => {
  const REPORTS_30 = Array.from({ length: 30 }, (_, i) =>
    makeReport({ id: `r${i}`, description: `report ${i}` })
  );

  it('returns first 20 items for page 1 (default page size)', () => {
    const result = paginateReports(REPORTS_30, 1);
    expect(result).toHaveLength(20);
    expect(result[0].id).toBe('r0');
    expect(result[19].id).toBe('r19');
  });

  it('returns remaining items for page 2 when total is 30', () => {
    const result = paginateReports(REPORTS_30, 2);
    expect(result).toHaveLength(10);
    expect(result[0].id).toBe('r20');
  });

  it('returns an empty array for a page beyond the data', () => {
    const result = paginateReports(REPORTS_30, 3);
    expect(result).toHaveLength(0);
  });

  it('respects a custom pageSize', () => {
    const result = paginateReports(REPORTS_30, 1, 5);
    expect(result).toHaveLength(5);
    expect(result[0].id).toBe('r0');
  });

  it('custom pageSize page 2 returns correct slice', () => {
    const result = paginateReports(REPORTS_30, 2, 5);
    expect(result).toHaveLength(5);
    expect(result[0].id).toBe('r5');
  });

  it('returns all items when pageSize exceeds array length', () => {
    const result = paginateReports(REPORTS_30, 1, 100);
    expect(result).toHaveLength(30);
  });

  it('returns empty array for empty input', () => {
    const result = paginateReports([], 1);
    expect(result).toHaveLength(0);
  });

  it('does not mutate the input array', () => {
    const input = [...REPORTS_30];
    paginateReports(input, 1);
    expect(input).toHaveLength(30);
  });
});
