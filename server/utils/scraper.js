/**
 * Gift URL Scraper - Extract OG tags from URLs
 */
import * as cheerio from 'cheerio';

/**
 * Scrape gift metadata from URL
 * @param {string} url - Gift URL to scrape
 * @returns {Promise<{title: string, image: string}>}
 */
export async function scrapeGiftMetadata(url) {
  try {
    // Validate URL
    if (!url || typeof url !== 'string') {
      throw new Error('Invalid URL provided');
    }

    // Ensure URL has protocol
    const fullUrl = url.startsWith('http') ? url : `https://${url}`;
    const urlObj = new URL(fullUrl);
    
    // SSRF Protection: Only allow http and https protocols
    if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
      throw new Error('Only HTTP and HTTPS URLs are allowed');
    }
    
    // SSRF Protection: Block private/internal IP addresses
    const hostname = urlObj.hostname;
    const isPrivateIP = /^(127\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|169\.254\.|::1|fc00:|fe80:)/i.test(hostname);
    if (isPrivateIP) {
      throw new Error('Private/internal IP addresses are not allowed');
    }
    
    // SSRF Protection: Block localhost variations
    if (hostname === 'localhost' || hostname === '0.0.0.0' || hostname.endsWith('.local')) {
      throw new Error('Localhost URLs are not allowed');
    }

    // Fetch the page
    const response = await fetch(fullUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; WhiteElephantBot/1.0)',
      },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Extract OG tags
    const title =
      $('meta[property="og:title"]').attr('content') ||
      $('meta[name="twitter:title"]').attr('content') ||
      $('title').text() ||
      'Untitled Gift';

    const image =
      $('meta[property="og:image"]').attr('content') ||
      $('meta[name="twitter:image"]').attr('content') ||
      $('meta[property="og:image:url"]').attr('content') ||
      null;

    // Make image URL absolute if relative
    let imageUrl = null;
    if (image) {
      try {
        imageUrl = new URL(image, urlObj.origin).href;
      } catch {
        imageUrl = image;
      }
    }

    return {
      title: title.trim(),
      image: imageUrl,
    };
  } catch (error) {
    console.error('Scraper error:', error);
    // Return fallback values
    return {
      title: 'Gift',
      image: null,
    };
  }
}


