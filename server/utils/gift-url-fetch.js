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
 * @param {number} deadlineMs
 * @returns {number}
 */
export function remainingScrapeBudgetMs(deadlineMs) {
  const left = deadlineMs - Date.now();
  return left > 0 ? left : 0;
}

/**
 * @param {Response} response
 * @param {number} maxBytes
 * @param {number} deadlineMs
 * @returns {Promise<string>}
 */
async function readResponseTextWithLimit(response, maxBytes, deadlineMs) {
  const budget = remainingScrapeBudgetMs(deadlineMs);
  if (budget === 0) {
    throw Object.assign(new Error('Fetch timed out'), { code: 'timeout' });
  }

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
    if (remainingScrapeBudgetMs(deadlineMs) === 0) {
      throw Object.assign(new Error('Fetch timed out'), { code: 'timeout' });
    }
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
 * @param {{ deadlineMs?: number }} [options]
 * @returns {Promise<{ finalUrl: string, html: string, status: number, hostname: string }>}
 */
export async function fetchGiftPageHtml(startUrl, options = {}) {
  const deadlineMs = options.deadlineMs ?? Date.now() + GIFT_SCRAPE_TIMEOUT_MS;
  let currentUrl = startUrl;

  for (let hop = 0; hop <= GIFT_SCRAPE_MAX_REDIRECTS; hop++) {
    if (remainingScrapeBudgetMs(deadlineMs) === 0) {
      throw Object.assign(new Error('Fetch timed out'), { code: 'timeout' });
    }

    const { fullUrl, hostname } = validateGiftScrapeUrl(currentUrl);
    currentUrl = fullUrl;

    let response;
    try {
      response = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        headers: SCRAPE_BROWSER_HEADERS,
        signal: AbortSignal.timeout(remainingScrapeBudgetMs(deadlineMs)),
      });
    } catch (error) {
      const isTimeout =
        error?.name === 'TimeoutError' ||
        error?.name === 'AbortError' ||
        error?.code === 23;
      if (isTimeout) {
        throw Object.assign(new Error('Fetch timed out'), { code: 'timeout' });
      }
      throw error;
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        throw Object.assign(new Error('Redirect missing Location header'), { code: 'bad_redirect' });
      }
      currentUrl = new URL(location, currentUrl).href;
      continue;
    }

    const html = await readResponseTextWithLimit(response, GIFT_SCRAPE_MAX_HTML_BYTES, deadlineMs);

    return {
      finalUrl: currentUrl,
      html,
      status: response.status,
      hostname,
    };
  }

  throw Object.assign(new Error('Too many redirects'), { code: 'too_many_redirects' });
}