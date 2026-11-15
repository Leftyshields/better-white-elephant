import { describe, expect, it } from 'vitest';
import {
  GIFT_IMAGE_LINK_INVALID,
  GIFT_MANUAL_HELPER,
  isUnusableScrapedGiftTitle,
  validateOptionalGiftImageUrl,
} from '../../utils/giftUiCopy.js';

describe('giftUiCopy', () => {
  it('exposes manual helper copy for blocked gift scrapes', () => {
    expect(GIFT_MANUAL_HELPER).toBe(
      "This store won't share its gift details with us. Add them below and you're all set.",
    );
  });

  it('treats placeholder and store-name titles as unusable', () => {
    expect(isUnusableScrapedGiftTitle('')).toBe(true);
    expect(isUnusableScrapedGiftTitle('Untitled Gift')).toBe(true);
    expect(isUnusableScrapedGiftTitle('Amazon.com')).toBe(true);
    expect(isUnusableScrapedGiftTitle('Magnetic Charger Stand')).toBe(false);
  });

  it('validates optional https image links', () => {
    expect(validateOptionalGiftImageUrl('').ok).toBe(true);
    expect(validateOptionalGiftImageUrl('https://cdn.example.com/a.jpg')).toEqual({
      ok: true,
      value: 'https://cdn.example.com/a.jpg',
    });
    expect(validateOptionalGiftImageUrl('http://insecure.example/x.jpg').ok).toBe(false);
    expect(validateOptionalGiftImageUrl('not-a-url').error).toBe(GIFT_IMAGE_LINK_INVALID);
  });
});