/**
 * Gift URL Scraper - Extract OG tags from URLs
 * Uses Apify Amazon scraper for Amazon URLs, cheerio for others
 */
import * as cheerio from 'cheerio';

const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN;
const APIFY_ACTOR_ID = 'junglee~free-amazon-product-scraper'; // Use ~ instead of / for API
const APIFY_API_BASE = 'https://api.apify.com/v2';

/**
 * Check if URL is an Amazon URL
 * @param {string} hostname - URL hostname
 * @returns {boolean}
 */
function isAmazonUrl(hostname) {
  return hostname.includes('amazon.') || hostname.includes('amzn.');
}

/**
 * Extract ASIN from Amazon product URL
 * @param {string} url - Amazon product URL
 * @returns {string|null} - ASIN or null
 */
function extractAmazonASIN(url) {
  // Try to extract ASIN from URL
  // Amazon URLs can have formats like:
  // - /dp/B09X7MPX8L
  // - /product/B09X7MPX8L
  // - /gp/product/B09X7MPX8L
  // - ?asin=B09X7MPX8L
  const asinMatch = url.match(/(?:dp|product|gp\/product)\/([A-Z0-9]{10})|\?asin=([A-Z0-9]{10})/i);
  return asinMatch ? (asinMatch[1] || asinMatch[2]) : null;
}

/**
 * Scrape Amazon product using Apify API
 * @param {string} url - Amazon product URL
 * @returns {Promise<{title: string, image: string, price: string|null}>}
 */
async function scrapeAmazonWithApify(url) {
  console.log('[Apify] Attempting to scrape Amazon URL:', url);
  console.log('[Apify] API Token present:', !!APIFY_API_TOKEN);
  
  if (!APIFY_API_TOKEN) {
    console.warn('[Apify] APIFY_API_TOKEN not set, falling back to cheerio scraper for Amazon');
    return null;
  }

  try {
    const endpoint = `${APIFY_API_BASE}/acts/${APIFY_ACTOR_ID}/runs`;
    console.log('[Apify] Starting actor run...');
    console.log('[Apify] Endpoint URL:', endpoint);
    console.log('[Apify] Actor ID:', APIFY_ACTOR_ID);
    // Start Apify actor run
    const startRunResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${APIFY_API_TOKEN}`
      },
      body: JSON.stringify({
        categoryOrProductUrls: [{ url }], // Array of objects with url property
        maxItems: 1 // We only need one product
      })
    });

    if (!startRunResponse.ok) {
      const errorText = await startRunResponse.text();
      console.error('[Apify] Start run failed:', startRunResponse.status, errorText);
      return null;
    }

    const runData = await startRunResponse.json();
    const runId = runData.data.id;
    const datasetId = runData.data.defaultDatasetId;
    console.log('[Apify] Run started with ID:', runId);
    console.log('[Apify] Dataset ID:', datasetId);

    // Poll for run completion (max 60 seconds)
    let completed = false;
    let attempts = 0;
    const maxAttempts = 30; // 30 attempts * 2 seconds = 60 seconds max

    while (!completed && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
      attempts++;

      const statusResponse = await fetch(`${APIFY_API_BASE}/actor-runs/${runId}`, {
        headers: {
          'Authorization': `Bearer ${APIFY_API_TOKEN}`
        }
      });

      if (!statusResponse.ok) {
        console.error('Apify status check failed');
        return null;
      }

      const statusData = await statusResponse.json();
      const status = statusData.data.status;
      console.log(`[Apify] Run status (attempt ${attempts}):`, status);

      if (status === 'SUCCEEDED') {
        completed = true;
        console.log('[Apify] Run succeeded!');
      } else if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
        console.error(`[Apify] Run ${status.toLowerCase()}`);
        return null;
      }
    }

    if (!completed) {
      console.error('[Apify] Run timed out after', maxAttempts, 'attempts');
      return null;
    }

    // Get results from dataset - use datasetId from run data
    const datasetResponse = await fetch(`${APIFY_API_BASE}/datasets/${datasetId}/items`, {
      headers: {
        'Authorization': `Bearer ${APIFY_API_TOKEN}`
      }
    });

    if (!datasetResponse.ok) {
      const errorText = await datasetResponse.text();
      console.error('[Apify] Failed to fetch dataset items:', datasetResponse.status, errorText);
      return null;
    }

    const items = await datasetResponse.json();
    console.log('[Apify] Received', items?.length || 0, 'items from dataset');
    
    if (!items || items.length === 0) {
      console.error('[Apify] No items returned from dataset');
      return null;
    }

    const product = items[0];
    console.log('[Apify] Product title:', product.title);
    console.log('[Apify] Product price:', product.price);
    console.log('[Apify] Product image:', product.thumbnailImage);

    // Map Apify response to our format
    const result = {
      title: product.title || 'Amazon Product',
      image: product.thumbnailImage || null,
      price: product.price ? `${product.price.currency || '$'}${product.price.value}` : null,
      // Include additional data that might be useful
      asin: product.asin || null,
      brand: product.brand || null,
      stars: product.stars || null,
      reviewsCount: product.reviewsCount || null
    };
    
    console.log('[Apify] Returning result:', JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    console.error('[Apify] Scraping error:', error.message, error.stack);
    return null; // Fall back to cheerio
  }
}

/**
 * Scrape gift metadata from URL
 * @param {string} url - Gift URL to scrape
 * @returns {Promise<{title: string, image: string, price: string|null}>}
 */
export async function scrapeGiftMetadata(url) {
  try {
    console.log('[Scraper] Starting scrape for URL:', url);
    
    // Validate URL
    if (!url || typeof url !== 'string') {
      throw new Error('Invalid URL provided');
    }

    // Ensure URL has protocol
    const fullUrl = url.startsWith('http') ? url : `https://${url}`;
    console.log('[Scraper] Normalized URL:', fullUrl);
    const urlObj = new URL(fullUrl);
    
    // SSRF Protection: Only allow http and https protocols
    if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
      throw new Error('Only HTTP and HTTPS URLs are allowed');
    }
    
    // SSRF Protection: Block private/internal IP addresses
    const hostname = urlObj.hostname;
    console.log('[Scraper] Hostname:', hostname);
    console.log('[Scraper] Is Amazon URL?', isAmazonUrl(hostname));
    
    const isPrivateIP = /^(127\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|169\.254\.|::1|fc00:|fe80:)/i.test(hostname);
    if (isPrivateIP) {
      throw new Error('Private/internal IP addresses are not allowed');
    }
    
    // SSRF Protection: Block localhost variations
    if (hostname === 'localhost' || hostname === '0.0.0.0' || hostname.endsWith('.local')) {
      throw new Error('Localhost URLs are not allowed');
    }

    // Try Apify for Amazon URLs first
    if (isAmazonUrl(hostname)) {
      console.log('[Scraper] Detected Amazon URL, attempting Apify scrape...');
      const apifyResult = await scrapeAmazonWithApify(fullUrl);
      if (apifyResult) {
        console.log('[Scraper] Apify scrape successful');
        return apifyResult;
      }
      // Fall through to cheerio if Apify fails
      console.log('[Scraper] Apify failed, falling back to cheerio for Amazon URL');
    } else {
      console.log('[Scraper] Non-Amazon URL, using cheerio scraper');
    }

    // Use cheerio scraper (fallback or for non-Amazon URLs)
    // Fetch the page with better headers to avoid blocking
    const response = await fetch(fullUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
      signal: AbortSignal.timeout(15000), // 15 second timeout
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Extract OG tags
    let title =
      $('meta[property="og:title"]').attr('content') ||
      $('meta[name="twitter:title"]').attr('content') ||
      $('title').text() ||
      'Untitled Gift';

    // Amazon-specific title extraction (often in #productTitle)
    if (hostname.includes('amazon.')) {
      const amazonTitle = $('#productTitle').text().trim() ||
                         $('#title_feature_div h1').text().trim() ||
                         $('h1.a-size-large').text().trim();
      if (amazonTitle) {
        title = amazonTitle;
      }
    }

    let image =
      $('meta[property="og:image"]').attr('content') ||
      $('meta[name="twitter:image"]').attr('content') ||
      $('meta[property="og:image:url"]').attr('content') ||
      null;

    // Amazon-specific image extraction
    if (hostname.includes('amazon.')) {
      // Try multiple Amazon image selectors in order of reliability
      let amazonImage = null;
      
      // First try the main product image
      amazonImage = $('#landingImage').attr('data-old-src') ||
                    $('#landingImage').attr('src') ||
                    $('#landingImage').attr('data-a-dynamic-image');
      
      // Try data-a-dynamic-image attribute (contains JSON with image URLs)
      if (!amazonImage || amazonImage.includes('{')) {
        const dynamicImage = $('#landingImage').attr('data-a-dynamic-image') ||
                            $('#imgBlkFront').attr('data-a-dynamic-image');
        if (dynamicImage) {
          try {
            const imageData = JSON.parse(dynamicImage);
            if (imageData && typeof imageData === 'object') {
              // Get the largest/highest quality image (usually first key)
              const imageKeys = Object.keys(imageData);
              if (imageKeys.length > 0) {
                amazonImage = imageKeys[0];
              }
            }
          } catch (e) {
            // If JSON parse fails, try regex extraction
            const urlMatch = dynamicImage.match(/"https?:\/\/[^"]+"/);
            if (urlMatch && urlMatch[0]) {
              amazonImage = urlMatch[0].replace(/"/g, '');
            }
          }
        }
      }
      
      // Try other Amazon image selectors
      if (!amazonImage) {
        amazonImage = $('.a-dynamic-image').first().attr('src') ||
                     $('#main-image').attr('src') ||
                     $('.a-button-selected img').first().attr('src') ||
                     $('#imgTagWrapperId img').first().attr('src') ||
                     null;
      }
      
      // Use Amazon image if found, otherwise fall back to OG image
      if (amazonImage) {
        image = amazonImage;
      }
    }

    // Make image URL absolute if relative
    let imageUrl = null;
    if (image) {
      try {
        imageUrl = new URL(image, urlObj.origin).href;
      } catch {
        imageUrl = image;
      }
    }

    // Extract price - try multiple common selectors
    let price = null;
    // Try OG price tags
    price = $('meta[property="product:price:amount"]').attr('content') ||
            $('meta[property="og:price:amount"]').attr('content') ||
            null;
    
    // If no OG price, try common price selectors
    if (!price) {
      // Amazon - try multiple selectors (in order of reliability)
      let amazonPrice = null;
      
      // Try hidden offscreen price first (most reliable)
      amazonPrice = $('.a-price .a-offscreen').first().text().trim();
      
      // Try price block selectors
      if (!amazonPrice) {
        amazonPrice = $('#priceblock_ourprice').text().trim() || 
                     $('#priceblock_dealprice').text().trim() ||
                     $('#priceblock_saleprice').text().trim() ||
                     null;
      }
      
      // Try price whole + symbol combination
      if (!amazonPrice) {
        const priceWhole = $('.a-price-whole').first().text().trim();
        const priceFraction = $('.a-price-fraction').first().text().trim();
        const priceSymbol = $('.a-price-symbol').first().text().trim();
        if (priceWhole) {
          amazonPrice = (priceSymbol || '$') + priceWhole + (priceFraction ? '.' + priceFraction : '');
        }
      }
      
      // Try base price
      if (!amazonPrice) {
        amazonPrice = $('.a-price-base').first().text().trim() ||
                     $('.a-color-price').first().text().trim() ||
                     null;
      }
      
      // Etsy
      const etsyPrice = $('.currency-value').first().text().trim() || null;
      
      // Generic
      const genericPrice = $('[itemprop="price"]').attr('content')?.trim() ||
                          $('[itemprop="price"]').text().trim() ||
                          $('.price').first().text().trim() ||
                          $('.product-price').first().text().trim() ||
                          null;
      
      price = amazonPrice || etsyPrice || genericPrice || null;
    }
    
    // Clean up price string - preserve currency symbols and numbers
    if (price) {
      price = price.trim();
      // Remove extra whitespace but keep currency symbols and numbers
      price = price.replace(/\s+/g, ' ');
      // If no digits, it's not a valid price
      if (!price.match(/[\d]/)) {
        price = null;
      }
    }

    return {
      title: title.trim(),
      image: imageUrl,
      price: price || null,
    };
  } catch (error) {
    console.error('[Scraper] Error:', error.message, error.stack);
    // Return fallback values but include error info
    return {
      title: 'Gift',
      image: null,
      price: null,
      error: error.message || 'Failed to scrape URL',
    };
  }
}


