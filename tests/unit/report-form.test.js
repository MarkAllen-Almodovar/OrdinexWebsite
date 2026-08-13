/**
 * Unit tests for src/resident/report-form.js
 *
 * Covers the exported pure functions:
 *   - validateReportForm
 *   - validateImageFile
 *
 * Requirements: 4.5, 4.8
 */

import { describe, it, expect, vi } from 'vitest';

// Mock Firebase modules — report-form.js imports these but tests don't need real Firebase
vi.mock('../../src/shared/firebase.js', () => ({
  db: {},
  storage: {},
  auth: {},
  default: {},
}));
vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  collection: vi.fn(),
  serverTimestamp: vi.fn(),
  getDoc: vi.fn(),
  doc: vi.fn(),
}));
vi.mock('firebase/storage', () => ({
  ref: vi.fn(),
  uploadBytes: vi.fn(),
  getDownloadURL: vi.fn(),
}));
vi.mock('../../src/shared/ui-helpers.js', () => ({
  showToast: vi.fn(),
}));

import {
  validateReportForm,
  validateImageFile,
} from '../../src/resident/report-form.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a valid report data object with optional overrides. */
function validData(overrides = {}) {
  return {
    description: 'There is garbage piling up near the road.',
    category: 'Improper Garbage Disposal',
    ...overrides,
  };
}

/** Creates a mock File object with the given size in bytes. */
function mockFile(sizeBytes, name = 'photo.jpg') {
  return { name, size: sizeBytes, type: 'image/jpeg' };
}

// ---------------------------------------------------------------------------
// validateReportForm — valid input
// ---------------------------------------------------------------------------

describe('validateReportForm — valid input', () => {
  it('returns valid:true and empty errors for correct data', () => {
    const result = validateReportForm(validData());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it('accepts all five predefined categories', () => {
    const categories = [
      'Improper Garbage Disposal',
      'Illegal Parking',
      'Noise Disturbances',
      'Public Disturbance',
      'Others',
    ];
    categories.forEach((category) => {
      const result = validateReportForm(validData({ category }));
      expect(result.valid).toBe(true);
      expect(result.errors.category).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// validateReportForm — description validation (Requirement 4.5)
// ---------------------------------------------------------------------------

describe('validateReportForm — description field', () => {
  it('rejects empty description', () => {
    const { valid, errors } = validateReportForm(validData({ description: '' }));
    expect(valid).toBe(false);
    expect(errors.description).toBe('Description is required.');
  });

  it('rejects whitespace-only description (spaces)', () => {
    const { valid, errors } = validateReportForm(validData({ description: '   ' }));
    expect(valid).toBe(false);
    expect(errors.description).toBe('Description is required.');
  });

  it('rejects whitespace-only description (tabs)', () => {
    const { valid, errors } = validateReportForm(validData({ description: '\t\t\t' }));
    expect(valid).toBe(false);
    expect(errors.description).toBe('Description is required.');
  });

  it('rejects whitespace-only description (newlines)', () => {
    const { valid, errors } = validateReportForm(validData({ description: '\n\n' }));
    expect(valid).toBe(false);
    expect(errors.description).toBe('Description is required.');
  });

  it('rejects mixed whitespace description', () => {
    const { valid, errors } = validateReportForm(validData({ description: '  \t \n  ' }));
    expect(valid).toBe(false);
    expect(errors.description).toBe('Description is required.');
  });

  it('accepts description with at least one non-whitespace character', () => {
    const { valid, errors } = validateReportForm(validData({ description: 'x' }));
    expect(valid).toBe(true);
    expect(errors.description).toBeUndefined();
  });

  it('rejects undefined description', () => {
    const { valid, errors } = validateReportForm(validData({ description: undefined }));
    expect(valid).toBe(false);
    expect(errors.description).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// validateReportForm — category validation
// ---------------------------------------------------------------------------

describe('validateReportForm — category field', () => {
  it('rejects empty category string', () => {
    const { valid, errors } = validateReportForm(validData({ category: '' }));
    expect(valid).toBe(false);
    expect(errors.category).toBe('Please select a category.');
  });

  it('rejects whitespace-only category', () => {
    const { valid, errors } = validateReportForm(validData({ category: '   ' }));
    expect(valid).toBe(false);
    expect(errors.category).toBe('Please select a category.');
  });

  it('rejects undefined category', () => {
    const { valid, errors } = validateReportForm(validData({ category: undefined }));
    expect(valid).toBe(false);
    expect(errors.category).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// validateReportForm — multiple errors simultaneously
// ---------------------------------------------------------------------------

describe('validateReportForm — multiple errors', () => {
  it('reports both description and category errors when both are missing', () => {
    const { valid, errors } = validateReportForm({ description: '', category: '' });
    expect(valid).toBe(false);
    expect(errors.description).toBeTruthy();
    expect(errors.category).toBeTruthy();
  });

  it('reports only the relevant error when only one field is invalid', () => {
    const { errors: errDesc } = validateReportForm(validData({ description: '' }));
    expect(errDesc.description).toBeTruthy();
    expect(errDesc.category).toBeUndefined();

    const { errors: errCat } = validateReportForm(validData({ category: '' }));
    expect(errCat.category).toBeTruthy();
    expect(errCat.description).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// validateImageFile — image size gate (Requirement 4.8)
// ---------------------------------------------------------------------------

const FIVE_MB = 5 * 1024 * 1024;

describe('validateImageFile — file size validation', () => {
  it('accepts a file exactly at the 5 MB limit', () => {
    const result = validateImageFile(mockFile(FIVE_MB));
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('accepts a file smaller than 5 MB', () => {
    const result = validateImageFile(mockFile(1024)); // 1 KB
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('accepts a 1-byte file', () => {
    const result = validateImageFile(mockFile(1));
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('rejects a file one byte over 5 MB', () => {
    const result = validateImageFile(mockFile(FIVE_MB + 1));
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('rejects a file significantly larger than 5 MB', () => {
    const result = validateImageFile(mockFile(10 * 1024 * 1024)); // 10 MB
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('returns an error string when the file is too large', () => {
    const result = validateImageFile(mockFile(FIVE_MB + 1));
    expect(typeof result.error).toBe('string');
    expect(result.error.length).toBeGreaterThan(0);
  });
});
