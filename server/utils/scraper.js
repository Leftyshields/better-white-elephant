/**
 * Gift URL Scraper - Extract OG tags from URLs
 */
import * as cheerio from 'cheerio';

/**
 * Scrape gift metadata from URL
 * @param {string} url - Gift URL to scrape
 * @returns {Promise<{title: string, image: string, price: string|null}>}
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
    console.error('Scraper error:', error);
    // Return fallback values but include error info
    return {
      title: 'Gift',
      image: null,
      price: null,
      error: error.message || 'Failed to scrape URL',
    };
  }
}


