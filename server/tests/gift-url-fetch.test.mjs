import test from 'node:test';
import assert from 'node:assert/strict';
import { GIFT_SCRAPE_TIMEOUT_MS } from '../utils/gift-url-metadata.js';
import { fetchGiftPageHtml, remainingScrapeBudgetMs } from '../utils/gift-url-fetch.js';

test('remainingScrapeBudgetMs returns zero after deadline', () => {
  assert.equal(remainingScrapeBudgetMs(Date.now() - 1), 0);
  assert.ok(remainingScrapeBudgetMs(Date.now() + 1000) > 0);
});

test('fetchGiftPageHtml rejects when scrape budget is already exhausted', async () => {
  await assert.rejects(
    () => fetchGiftPageHtml('https://example.com/slow-product', { deadlineMs: Date.now() - 1 }),
    (err) => err.code === 'timeout',
  );
});

test('GIFT_SCRAPE_TIMEOUT_MS is six seconds or less', () => {
  assert.ok(GIFT_SCRAPE_TIMEOUT_MS <= 6_000);
  assert.equal(GIFT_SCRAPE_TIMEOUT_MS, 6_000);
});