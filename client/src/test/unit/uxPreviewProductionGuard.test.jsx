/**
 * Compile-time preview flag is off under vitest (production-like).
 * Full bundle guard: npm run test:ux-preview-guard (repo root).
 */
import { describe, it, expect } from 'vitest';
import { UX_PREVIEW_ENABLED } from '../../preview/previewFlag.js';

describe('UX preview compile-time flag', () => {
  it('is disabled when not building with --mode ux-preview', () => {
    expect(UX_PREVIEW_ENABLED).toBe(false);
  });
});
