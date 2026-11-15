/**
 * Parse product title/image/price from retailer HTML.
 */
import * as cheerio from 'cheerio';
import { isAmazonHostname, isGenericStoreTitle } from './gift-url-metadata.js';

/**
 * @param {unknown} imageField
 * @returns {string|null}
 */
function coerceProductImage(imageField) {
  if (!imageField) {
    return null;
  }
  if (typeof imageField === 'string') {
    return imageField;
  }
  if (Array.isArray(imageField)) {
    for (const item of imageField) {
      const resolved = coerceProductImage(item);
      if (resolved) {
        return resolved;
      }
    }
    return null;
  }
  if (typeof imageField === 'object' && imageField.url) {
    return String(imageField.url);
  }
  return null;
}

/**
 * @param {cheerio.CheerioAPI} $
 * @returns {{ title: string|null, image: string|null }}
 */
export function extractJsonLdProduct($) {
  let title = null;
  let image = null;

  $('script[type="application/ld+json"]').each((_, element) => {
    if (title && image) {
      return false;
    }
    const raw = $(element).html();
    if (!raw) {
      return;
    }
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }

    const nodes = [];
    if (Array.isArray(data)) {
      nodes.push(...data);
    } else if (data && Array.isArray(data['@graph'])) {
      nodes.push(...data['@graph']);
    } else if (data) {
      nodes.push(data);
    }

    for (const node of nodes) {
      if (!node || typeof node !== 'object') {
        continue;
      }
      const type = node['@type'];
      const isProduct =
        type === 'Product' ||
        (Array.isArray(type) && type.includes('Product'));
      if (!isProduct) {
        continue;
      }
      if (!title && typeof node.name === 'string' && node.name.trim()) {
        title = node.name.trim();
      }
      if (!image) {
        image = coerceProductImage(node.image);
      }
    }
  });

  return { title, image };
}

/**
 * @param {string} html
 * @param {string} hostname
 * @param {string} pageOrigin
 * @returns {{ rawTitle: string, image: string|null, price: string|null }}
 */
export function parseGiftHtml(html, hostname, pageOrigin) {
  const $ = cheerio.load(html);
  const jsonLd = extractJsonLdProduct($);

  let rawTitle =
    jsonLd.title ||
    $('meta[property="og:title"]').attr('content')?.trim() ||
    $('meta[name="twitter:title"]').attr('content')?.trim() ||
    $('title').text()?.trim() ||
    '';

  if (isAmazonHostname(hostname)) {
    const amazonTitle =
      $('#productTitle').text().trim() ||
      $('#title_feature_div h1').text().trim() ||
      $('h1.a-size-large').text().trim();
    if (amazonTitle) {
      rawTitle = amazonTitle;
    }
  }

  let image =
    jsonLd.image ||
    $('meta[property="og:image"]').attr('content') ||
    $('meta[name="twitter:image"]').attr('content') ||
    $('meta[property="og:image:url"]').attr('content') ||
    null;

  if (isAmazonHostname(hostname)) {
    const amazonImage = extractAmazonDomImage($);
    if (amazonImage) {
      image = amazonImage;
    }
  }

  let imageUrl = null;
  if (image) {
    try {
      imageUrl = new URL(image, pageOrigin).href;
    } catch {
      imageUrl = image;
    }
  }

  let price =
    $('meta[property="product:price:amount"]').attr('content') ||
    $('meta[property="og:price:amount"]').attr('content') ||
    null;

  if (!price) {
    price = extractDomPrice($, hostname);
  }

  if (price) {
    price = price.trim().replace(/\s+/g, ' ');
    if (!price.match(/[\d]/)) {
      price = null;
    }
  }

  if (rawTitle && isGenericStoreTitle(rawTitle)) {
    rawTitle = '';
  }

  return {
    rawTitle,
    image: imageUrl,
    price: price || null,
  };
}

/**
 * @param {cheerio.CheerioAPI} $
 * @returns {string|null}
 */
function extractAmazonDomImage($) {
  let amazonImage =
    $('#landingImage').attr('data-old-src') ||
    $('#landingImage').attr('src') ||
    $('#landingImage').attr('data-a-dynamic-image') ||
    null;

  if (!amazonImage || amazonImage.includes('{')) {
    const dynamicImage =
      $('#landingImage').attr('data-a-dynamic-image') ||
      $('#imgBlkFront').attr('data-a-dynamic-image');
    if (dynamicImage) {
      try {
        const imageData = JSON.parse(dynamicImage);
        if (imageData && typeof imageData === 'object') {
          const imageKeys = Object.keys(imageData);
          if (imageKeys.length > 0) {
            amazonImage = imageKeys[0];
          }
        }
      } catch {
        const urlMatch = dynamicImage.match(/"https?:\/\/[^"]+"/);
        if (urlMatch?.[0]) {
          amazonImage = urlMatch[0].replace(/"/g, '');
        }
      }
    }
  }

  if (!amazonImage) {
    amazonImage =
      $('.a-dynamic-image').first().attr('src') ||
      $('#main-image').attr('src') ||
      $('.a-button-selected img').first().attr('src') ||
      $('#imgTagWrapperId img').first().attr('src') ||
      null;
  }

  return amazonImage;
}

/**
 * @param {cheerio.CheerioAPI} $
 * @param {string} hostname
 * @returns {string|null}
 */
function extractDomPrice($, hostname) {
  if (isAmazonHostname(hostname)) {
    let amazonPrice = $('.a-price .a-offscreen').first().text().trim();
    if (!amazonPrice) {
      amazonPrice =
        $('#priceblock_ourprice').text().trim() ||
        $('#priceblock_dealprice').text().trim() ||
        $('#priceblock_saleprice').text().trim() ||
        null;
    }
    if (!amazonPrice) {
      const priceWhole = $('.a-price-whole').first().text().trim();
      const priceFraction = $('.a-price-fraction').first().text().trim();
      const priceSymbol = $('.a-price-symbol').first().text().trim();
      if (priceWhole) {
        amazonPrice = `${priceSymbol || '$'}${priceWhole}${priceFraction ? `.${priceFraction}` : ''}`;
      }
    }
    if (!amazonPrice) {
      amazonPrice =
        $('.a-price-base').first().text().trim() ||
        $('.a-color-price').first().text().trim() ||
        null;
    }
    if (amazonPrice) {
      return amazonPrice;
    }
  }

  const etsyPrice = $('.currency-value').first().text().trim();
  if (etsyPrice) {
    return etsyPrice;
  }

  return (
    $('[itemprop="price"]').attr('content')?.trim() ||
    $('[itemprop="price"]').text().trim() ||
    $('.price').first().text().trim() ||
    $('.product-price').first().text().trim() ||
    null
  );
}