/**
 * Gift URL metadata helpers (Amazon ASIN/slug, generic store titles).
 */

export const GIFT_TITLE_MAX_LENGTH = 500;
export const GIFT_SCRAPE_MAX_REDIRECTS = 5;
export const GIFT_SCRAPE_TIMEOUT_MS = 6_000;
export const GIFT_SCRAPE_MAX_HTML_BYTES = 2 * 1024 * 1024;

const GENERIC_STORE_TITLE_EXACT = new Set(
  [
    'amazon.com',
    'target',
    'target.com',
    'walmart.com',
    'walmart',
    'etsy',
    'etsy.com',
    'ebay',
    'ebay.com',
    'best buy',
    'bestbuy.com',
  ].map((s) => s.toLowerCase()),
);

const AMAZON_SHORT_LINK_HOSTS = new Set(['a.co', 'amzn.to', 'amzn.com']);

/**
 * @param {{ code: string, name: string }} entry
 */
export function logScrapeEvent(entry) {
  console.log(JSON.stringify({ code: entry.code, name: entry.name }));
}

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
 * @param {string} hostname
 * @returns {boolean}
 */
export function isAmazonShortLinkHost(hostname) {
  if (!hostname || typeof hostname !== 'string') {
    return false;
  }
  return AMAZON_SHORT_LINK_HOSTS.has(hostname.toLowerCase());
}

/**
 * Extract Amazon Standard Identification Number from a product URL.
 * @param {string} url
 * @returns {string|null}
 */
export function extractAmazonAsin(url) {
  if (!url || typeof url !== 'string') {
    return null;
  }
  const asinMatch = url.match(
    /(?:[/]dp[/]|[/]product[/]|[/]gp[/]product[/]|[?&]asin=)([A-Z0-9]{10})(?:[/?&#]|$)/i,
  );
  return asinMatch ? asinMatch[1].toUpperCase() : null;
}

/**
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

  if (/^target\.com\b/i.test(normalized) || /^best\s*buy\b/i.test(normalized)) {
    return true;
  }

  if (lower === 'untitled gift' || lower === 'amazon product' || lower === 'gift') {
    return true;
  }

  return false;
}

/**
 * @param {string} url
 * @returns {string}
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
    return formatAmazonSlugSegment(dpMatch[1]);
  }

  const productMatch = path.match(/\/([^/]+)\/product\/[A-Z0-9]{10}(?:[/?]|$)/i);
  if (productMatch) {
    return formatAmazonSlugSegment(productMatch[1]);
  }

  return '';
}

const SLUG_WORD_OVERRIDES = new Map(
  [
    ['usb', 'USB'],
    ['hdmi', 'HDMI'],
    ['led', 'LED'],
    ['tv', 'TV'],
    ['wifi', 'WiFi'],
    ['iphone', 'iPhone'],
    ['ipad', 'iPad'],
    ['ipod', 'iPod'],
    ['macbook', 'MacBook'],
    ['ps5', 'PS5'],
    ['xbox', 'Xbox'],
  ].map(([k, v]) => [k, v]),
);

/**
 * @param {string} segment - Raw URL slug segment (before /dp/ etc.)
 * @returns {string}
 */
export function formatAmazonSlugSegment(segment) {
  if (!segment || typeof segment !== 'string') {
    return '';
  }
  const reserved = new Set(['dp', 'gp', 'product', 'exec', 'obidos', 'asin', 'ref']);
  if (reserved.has(segment.toLowerCase())) {
    return '';
  }

  let text = segment.replace(/[-_]+/g, ' ');
  text = text.replace(/\bB[0-9A-Z]{9}\b/gi, ' ');
  text = text.replace(/\b(dp|gp|product|ref|asin)\b/gi, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  if (!text) {
    return '';
  }

  return text
    .split(' ')
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase();
      if (SLUG_WORD_OVERRIDES.has(lower)) {
        return SLUG_WORD_OVERRIDES.get(lower);
      }
      if (/^[A-Z0-9]{2,5}$/.test(word)) {
        return word;
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

/**
 * @param {string} title
 * @returns {string}
 */
export function trimGiftTitle(title) {
  if (typeof title !== 'string') {
    return '';
  }
  const trimmed = title.trim().replace(/\s+/g, ' ');
  if (!trimmed) {
    return '';
  }
  if (trimmed.length <= GIFT_TITLE_MAX_LENGTH) {
    return trimmed;
  }
  return trimmed.slice(0, GIFT_TITLE_MAX_LENGTH).trim();
}

/**
 * @param {string | null | undefined} scrapedTitle
 * @param {string} sourceUrl
 * @returns {string}
 */
export function resolveGiftTitle(scrapedTitle, sourceUrl) {
  let title = typeof scrapedTitle === 'string' ? trimGiftTitle(scrapedTitle) : '';

  if (title && isGenericStoreTitle(title)) {
    title = '';
  }

  if (!title) {
    const slugTitle = extractAmazonSlugTitle(sourceUrl);
    if (slugTitle) {
      title = trimGiftTitle(slugTitle);
    }
  }

  return title;
}

/**
 * SSRF-safe URL validation for outbound gift scrapes.
 * @param {string} url
 * @returns {{ fullUrl: string, urlObj: URL, hostname: string }}
 */
export function validateGiftScrapeUrl(url) {
  if (!url || typeof url !== 'string') {
    throw Object.assign(new Error('Invalid URL provided'), { code: 'invalid_url' });
  }

  const fullUrl = url.startsWith('http') ? url : `https://${url}`;
  let urlObj;
  try {
    urlObj = new URL(fullUrl);
  } catch {
    throw Object.assign(new Error('Invalid URL provided'), { code: 'invalid_url' });
  }

  if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
    throw Object.assign(new Error('Only HTTP and HTTPS URLs are allowed'), { code: 'protocol_blocked' });
  }

  const hostname = urlObj.hostname.toLowerCase();

  const isPrivateIP =
    /^(127\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|169\.254\.|::1|fc00:|fe80:)/i.test(hostname);
  if (isPrivateIP) {
    throw Object.assign(new Error('Private/internal IP addresses are not allowed'), { code: 'ssrf_blocked' });
  }

  if (hostname === 'localhost' || hostname === '0.0.0.0' || hostname.endsWith('.local')) {
    throw Object.assign(new Error('Localhost URLs are not allowed'), { code: 'ssrf_blocked' });
  }

  return { fullUrl: urlObj.href, urlObj, hostname };
}

/**
 * @param {string} hostname
 * @returns {string}
 */
export function scrapeLogNameForHost(hostname) {
  if (isAmazonHostname(hostname) || isAmazonShortLinkHost(hostname)) {
    return 'amazon';
  }
  if (hostname.includes('target.')) {
    return 'target';
  }
  if (hostname.includes('etsy.')) {
    return 'etsy';
  }
  if (hostname.includes('bestbuy.')) {
    return 'bestbuy';
  }
  return hostname.replace(/^www\./, '').split('.')[0] || 'unknown';
}