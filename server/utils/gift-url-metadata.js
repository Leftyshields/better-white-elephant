/**
 * Gift URL metadata helpers (Amazon slug titles, generic store title filtering).
 */

const GENERIC_STORE_TITLE_EXACT = new Set(
  [
    'amazon.com',
    'target',
    'walmart.com',
    'walmart',
    'etsy',
    'etsy.com',
    'ebay',
    'ebay.com',
  ].map((s) => s.toLowerCase()),
);

/**
 * @param {string} hostname
 * @returns {boolean}
 */
export function isAmazonHostname(hostname) {
  if (!hostname || typeof hostname !== 'string') {
    return false;
  }
  const host = hostname.toLowerCase();
  return host.includes('amazon.') || host.includes('amzn.');
}

/**
 * Titles that are only the retailer name, not a product (e.g. bot-block pages).
 * @param {string} title
 * @returns {boolean}
 */
export function isGenericStoreTitle(title) {
  if (!title || typeof title !== 'string') {
    return false;
  }
  const normalized = title.trim().replace(/\s+/g, ' ');
  if (!normalized) {
    return false;
  }
  const lower = normalized.toLowerCase();

  if (GENERIC_STORE_TITLE_EXACT.has(lower)) {
    return true;
  }

  if (/^amazon\.com\b/i.test(normalized)) {
    return true;
  }

  if (lower === 'untitled gift' || lower === 'amazon product' || lower === 'gift') {
    return true;
  }

  return false;
}

/**
 * Derive a human-readable title from an Amazon product URL path slug.
 * @param {string} url - Full or partial URL
 * @returns {string} Title, or empty string if no slug
 */
export function extractAmazonSlugTitle(url) {
  if (!url || typeof url !== 'string') {
    return '';
  }

  let urlObj;
  try {
    const fullUrl = url.startsWith('http') ? url : `https://${url}`;
    urlObj = new URL(fullUrl);
  } catch {
    return '';
  }

  if (!isAmazonHostname(urlObj.hostname)) {
    return '';
  }

  let path;
  try {
    path = decodeURIComponent(urlObj.pathname);
  } catch {
    path = urlObj.pathname;
  }

  const dpMatch = path.match(/\/([^/]+)\/dp\/[A-Z0-9]{10}(?:[/?]|$)/i);
  if (dpMatch) {
    return humanizeSlugSegment(dpMatch[1]);
  }

  const productMatch = path.match(/\/([^/]+)\/product\/[A-Z0-9]{10}(?:[/?]|$)/i);
  if (productMatch) {
    return humanizeSlugSegment(productMatch[1]);
  }

  return '';
}

/**
 * @param {string} segment
 * @returns {string}
 */
function humanizeSlugSegment(segment) {
  if (!segment || typeof segment !== 'string') {
    return '';
  }
  const reserved = new Set(['dp', 'gp', 'product', 'exec', 'obidos', 'asin']);
  if (reserved.has(segment.toLowerCase())) {
    return '';
  }
  const words = segment
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return words;
}

/**
 * Prefer scraped title when meaningful; otherwise Amazon slug; never generic store names.
 * @param {string | null | undefined} scrapedTitle
 * @param {string} sourceUrl
 * @returns {string}
 */
export function resolveGiftTitle(scrapedTitle, sourceUrl) {
  let title = typeof scrapedTitle === 'string' ? scrapedTitle.trim() : '';

  if (title && isGenericStoreTitle(title)) {
    title = '';
  }

  if (!title) {
    const slugTitle = extractAmazonSlugTitle(sourceUrl);
    if (slugTitle) {
      title = slugTitle;
    }
  }

  return title;
}