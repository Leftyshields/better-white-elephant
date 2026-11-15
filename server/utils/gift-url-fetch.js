/**
 * SSRF-safe HTTP fetch for gift URL metadata (manual redirect following).
 */
import {
  GIFT_SCRAPE_MAX_HTML_BYTES,
  GIFT_SCRAPE_MAX_REDIRECTS,
  GIFT_SCRAPE_TIMEOUT_MS,
  validateGiftScrapeUrl,
} from './gift-url-metadata.js';

export const SCRAPE_BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  Connection: 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
};

/**
 * @param {import('node:http').IncomingMessage | Response} response
 * @param {number} maxBytes
 * @returns {Promise<string>}
 */
async function readResponseTextWithLimit(response, maxBytes) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    const text = await response.text();
    if (text.length > maxBytes) {
      return text.slice(0, maxBytes);
    }
    return text;
  }

  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > maxBytes) {
      throw Object.assign(new Error('Response body too large'), { code: 'body_too_large' });
    }
    chunks.push(value);
  }
  const buffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  return buffer.toString('utf8');
}

/**
 * @param {string} startUrl
 * @returns {Promise<{ finalUrl: string, html: string, status: number, hostname: string }>}
 */
export async function fetchGiftPageHtml(startUrl) {
  let currentUrl = startUrl;

  for (let hop = 0; hop <= GIFT_SCRAPE_MAX_REDIRECTS; hop++) {
    const { fullUrl, hostname } = validateGiftScrapeUrl(currentUrl);
    currentUrl = fullUrl;

    const response = await fetch(currentUrl, {
      method: 'GET',
      redirect: 'manual',
      headers: SCRAPE_BROWSER_HEADERS,
      signal: AbortSignal.timeout(GIFT_SCRAPE_TIMEOUT_MS),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        throw Object.assign(new Error('Redirect missing Location header'), { code: 'bad_redirect' });
      }
      currentUrl = new URL(location, currentUrl).href;
      continue;
    }

    const html = await readResponseTextWithLimit(response, GIFT_SCRAPE_MAX_HTML_BYTES);

    return {
      finalUrl: currentUrl,
      html,
      status: response.status,
      hostname,
    };
  }

  throw Object.assign(new Error('Too many redirects'), { code: 'too_many_redirects' });
}