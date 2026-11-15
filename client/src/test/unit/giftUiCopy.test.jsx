import { describe, expect, it } from 'vitest';
import { GIFT_MANUAL_HELPER } from '../../utils/giftUiCopy.js';

describe('giftUiCopy', () => {
  it('exposes manual helper copy for blocked gift scrapes', () => {
    expect(GIFT_MANUAL_HELPER).toBe(
      "This store won't share its gift details with us. Add them below and you're all set.",
    );
  });
});