import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractAmazonSlugTitle,
  isGenericStoreTitle,
  resolveGiftTitle,
} from '../utils/gift-url-metadata.js';

test('extractAmazonSlugTitle humanizes slug before /dp/', () => {
  const url =
    'https://www.amazon.com/Wireless-Charger-iPhone-Charging-Multiple/dp/B0C1H5HNV3?ref=sr_1_1';
  assert.equal(
    extractAmazonSlugTitle(url),
    'Wireless Charger iPhone Charging Multiple',
  );
});

test('extractAmazonSlugTitle returns empty for /dp/-only URLs', () => {
  assert.equal(
    extractAmazonSlugTitle('https://www.amazon.com/dp/B0C1H5HNV3'),
    '',
  );
});

test('extractAmazonSlugTitle returns empty for /gp/product/ URLs', () => {
  assert.equal(
    extractAmazonSlugTitle('https://www.amazon.com/gp/product/B08N5WRWNW'),
    '',
  );
});

test('extractAmazonSlugTitle decodes URL-encoded slug segments', () => {
  assert.equal(
    extractAmazonSlugTitle(
      'https://www.amazon.com/Caf%C3%A9-Mug-12oz/dp/B012345678',
    ),
    'Café Mug 12oz',
  );
});

test('extractAmazonSlugTitle ignores query string', () => {
  assert.equal(
    extractAmazonSlugTitle(
      'https://www.amazon.com/Cool-Lamp/dp/B012345678?q=1&tag=foo',
    ),
    'Cool Lamp',
  );
});

test('extractAmazonSlugTitle supports /product/ path', () => {
  assert.equal(
    extractAmazonSlugTitle(
      'https://www.amazon.com/My-Gadget/product/B012345678',
    ),
    'My Gadget',
  );
});

test('isGenericStoreTitle rejects bare retailer names', () => {
  assert.equal(isGenericStoreTitle('Amazon.com'), true);
  assert.equal(isGenericStoreTitle('Amazon.com: Online Shopping for Electronics'), true);
  assert.equal(isGenericStoreTitle('Target'), true);
  assert.equal(isGenericStoreTitle('Walmart.com'), true);
  assert.equal(isGenericStoreTitle('Untitled Gift'), true);
});

test('isGenericStoreTitle allows real product titles', () => {
  assert.equal(
    isGenericStoreTitle('Anker MagGo Wireless Charging Station'),
    false,
  );
  assert.equal(isGenericStoreTitle('Target Practice Nerf Set'), false);
});

test('resolveGiftTitle uses slug when scrape returns Amazon.com', () => {
  const url =
    'https://www.amazon.com/Wireless-Charger-iPhone-Charging-Multiple/dp/B0C1H5HNV3';
  assert.equal(
    resolveGiftTitle('Amazon.com', url),
    'Wireless Charger iPhone Charging Multiple',
  );
});

test('resolveGiftTitle keeps a meaningful scraped title', () => {
  const url =
    'https://www.amazon.com/Wireless-Charger-iPhone-Charging-Multiple/dp/B0C1H5HNV3';
  assert.equal(
    resolveGiftTitle('Magnetic 3-in-1 Charging Stand', url),
    'Magnetic 3-in-1 Charging Stand',
  );
});

test('resolveGiftTitle returns empty when no slug and generic title', () => {
  assert.equal(resolveGiftTitle('Amazon.com', 'https://www.amazon.com/dp/B0C1H5HNV3'), '');
});