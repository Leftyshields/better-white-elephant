/** User-facing gift submission copy */

export const GIFT_MANUAL_HELPER =
  "This store won't share its gift details with us. Add them below and you're all set.";

export const GIFT_IMAGE_LINK_LABEL = 'Image link (optional)';
export const GIFT_IMAGE_LINK_PLACEHOLDER = 'https://example.com/image.jpg';
export const GIFT_IMAGE_LINK_HELPER =
  'Paste an image from your clipboard, or paste a public https image link.';
export const GIFT_IMAGE_LINK_INVALID =
  'Image link must be a secure https URL (up to 2048 characters).';

/** Max length aligned with gift product URL cap in scrape API. */
export const GIFT_IMAGE_URL_MAX_LENGTH = 2048;

const PLACEHOLDER_TITLES = new Set(
  ['gift', 'untitled gift', 'amazon product', 'amazon.com', 'target', 'walmart.com', 'etsy', 'bestbuy.com'],
);

/**
 * Scraped titles that should not pre-fill the gift form (server blocklist + placeholders).
 * @param {string | null | undefined} title
 * @returns {boolean}
 */
export function isUnusableScrapedGiftTitle(title) {
  if (!title || typeof title !== 'string' || !title.trim()) {
    return true;
  }
  const normalized = title.trim().replace(/\s+/g, ' ');
  const lower = normalized.toLowerCase();
  if (PLACEHOLDER_TITLES.has(lower)) {
    return true;
  }
  if (/^amazon\.com\b/i.test(normalized)) {
    return true;
  }
  return false;
}

/**
 * Optional https image URL for manual gift entry (not fetched server-side).
 * @param {string} value
 * @returns {{ ok: true, value: string } | { ok: false, error: string }}
 */
export function validateOptionalGiftImageUrl(value) {
  if (!value || typeof value !== 'string' || !value.trim()) {
    return { ok: true, value: '' };
  }
  const trimmed = value.trim();
  if (trimmed.length > GIFT_IMAGE_URL_MAX_LENGTH) {
    return { ok: false, error: GIFT_IMAGE_LINK_INVALID };
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:') {
      return { ok: false, error: GIFT_IMAGE_LINK_INVALID };
    }
    return { ok: true, value: trimmed };
  } catch {
    return { ok: false, error: GIFT_IMAGE_LINK_INVALID };
  }
}