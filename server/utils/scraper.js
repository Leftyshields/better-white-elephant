/**
 * Gift URL metadata scraper (free path: server fetch + HTML parse).
 */
import {
  extractAmazonAsin,
  isAmazonHostname,
  isAmazonShortLinkHost,
  logScrapeEvent,
  resolveGiftTitle,
  scrapeLogNameForHost,
  validateGiftScrapeUrl,
} from './gift-url-metadata.js';
import { fetchGiftPageHtml } from './gift-url-fetch.js';
import { parseGiftHtml } from './gift-html-parse.js';

/**
 * Scrape gift metadata from URL
 * @param {string} url - Gift URL to scrape
 * @returns {Promise<{title: string, image: string|null, price: string|null, asin?: string|null, error?: string}>}
 */
export async function scrapeGiftMetadata(url) {
  let fullUrl = url;
  let logName = 'unknown';

  try {
    if (!url || typeof url !== 'string') {
      throw Object.assign(new Error('Invalid URL provided'), { code: 'invalid_url' });
    }

    const validated = validateGiftScrapeUrl(url);
    fullUrl = validated.fullUrl;
    logName = scrapeLogNameForHost(validated.hostname);
    logScrapeEvent({ code: 'gift_scrape_start', name: logName });

    const { finalUrl, html, status, hostname } = await fetchGiftPageHtml(fullUrl);
    const asin = isAmazonHostname(hostname) ? extractAmazonAsin(finalUrl) : null;

    if (status < 200 || status >= 400) {
      throw Object.assign(new Error(`HTTP error! status: ${status}`), { code: 'http_error' });
    }

    const pageOrigin = new URL(finalUrl).origin;
    const parsed = parseGiftHtml(html, hostname, pageOrigin);
    const title = resolveGiftTitle(parsed.rawTitle, finalUrl);

    const result = {
      title,
      image: parsed.image,
      price: parsed.price,
      asin,
    };

    const hasImage = Boolean(parsed.image);
    logScrapeEvent({
      code: title && hasImage ? 'gift_scrape_ok' : 'gift_scrape_partial',
      name: logName,
    });

    return result;
  } catch (error) {
    const code = error?.code || 'scrape_failed';
    logScrapeEvent({ code: `gift_scrape_${code}`, name: logName });

    const resolvedTitle = resolveGiftTitle(null, fullUrl);
    let asin = null;
    try {
      const { hostname } = validateGiftScrapeUrl(fullUrl);
      if (isAmazonHostname(hostname)) {
        asin = extractAmazonAsin(fullUrl);
      }
    } catch {
      // keep asin null
    }
    return {
      title: resolvedTitle,
      image: null,
      price: null,
      asin,
      error: error.message || 'Failed to scrape URL',
    };
  }
}

export { isAmazonShortLinkHost, extractAmazonAsin };