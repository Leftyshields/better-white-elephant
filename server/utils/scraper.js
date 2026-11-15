/**
 * Gift URL metadata scraper (free path: server fetch + HTML parse).
 * Optional third-party scrapers remain behind GIFT_SCRAPE_USE_APIFY=false by default.
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

const USE_APIFY = process.env.GIFT_SCRAPE_USE_APIFY === 'true';

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

    if (USE_APIFY && isAmazonHostname(validated.hostname)) {
      const apifyResult = await scrapeAmazonWithApify(fullUrl);
      if (apifyResult) {
        logScrapeEvent({ code: 'gift_scrape_apify_ok', name: logName });
        return apifyResult;
      }
    }

    const { finalUrl, html, status, hostname } = await fetchGiftPageHtml(fullUrl);
    const asin = isAmazonHostname(hostname) ? extractAmazonAsin(finalUrl) : null;

    if (status < 200 || status >= 400) {
      throw Object.assign(new Error(`HTTP error! status: ${status}`), { code: 'http_error' });
    }

    const pageOrigin = new URL(finalUrl).origin;
    const parsed = parseGiftHtml(html, hostname, pageOrigin);
    const title = resolveGiftTitle(parsed.rawTitle, finalUrl) || 'Untitled Gift';

    const result = {
      title,
      image: parsed.image,
      price: parsed.price,
      asin,
    };

    const hasRealTitle = title && title !== 'Untitled Gift';
    const hasImage = Boolean(parsed.image);
    logScrapeEvent({
      code: hasRealTitle && hasImage ? 'gift_scrape_ok' : 'gift_scrape_partial',
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
      title: resolvedTitle || 'Gift',
      image: null,
      price: null,
      asin,
      error: error.message || 'Failed to scrape URL',
    };
  }
}

/**
 * Legacy Apify path — only when GIFT_SCRAPE_USE_APIFY=true.
 * @param {string} url
 * @returns {Promise<object|null>}
 */
async function scrapeAmazonWithApify(url) {
  const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN;
  const APIFY_ACTOR_ID = 'junglee~free-amazon-product-scraper';
  const APIFY_API_BASE = 'https://api.apify.com/v2';

  if (!APIFY_API_TOKEN) {
    return null;
  }

  try {
    const startRunResponse = await fetch(`${APIFY_API_BASE}/acts/${APIFY_ACTOR_ID}/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${APIFY_API_TOKEN}`,
      },
      body: JSON.stringify({ categoryUrls: [url], maxItems: 1 }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!startRunResponse.ok) {
      return null;
    }

    const runData = await startRunResponse.json();
    const runId = runData.data.id;
    const datasetId = runData.data.defaultDatasetId;

    let completed = false;
    for (let attempts = 0; attempts < 30 && !completed; attempts++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const statusResponse = await fetch(`${APIFY_API_BASE}/actor-runs/${runId}`, {
        headers: { Authorization: `Bearer ${APIFY_API_TOKEN}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (!statusResponse.ok) {
        return null;
      }
      const statusData = await statusResponse.json();
      const status = statusData.data.status;
      if (status === 'SUCCEEDED') {
        completed = true;
      } else if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
        return null;
      }
    }

    if (!completed) {
      return null;
    }

    const datasetResponse = await fetch(`${APIFY_API_BASE}/datasets/${datasetId}/items`, {
      headers: { Authorization: `Bearer ${APIFY_API_TOKEN}` },
      signal: AbortSignal.timeout(15_000),
    });

    if (!datasetResponse.ok) {
      return null;
    }

    const items = await datasetResponse.json();
    if (!items?.length) {
      return null;
    }

    const product = items[0];
    return {
      title: resolveGiftTitle(product.title || 'Amazon Product', url),
      image: product.thumbnailImage || null,
      price: product.price ? `${product.price.currency || '$'}${product.price.value}` : null,
      asin: product.asin || extractAmazonAsin(url),
    };
  } catch {
    return null;
  }
}

export { isAmazonShortLinkHost, extractAmazonAsin };