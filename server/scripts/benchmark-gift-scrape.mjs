/**
 * Live benchmark for gift scrape free path (run manually from server/).
 * Usage: node scripts/benchmark-gift-scrape.mjs
 */
import { scrapeGiftMetadata } from '../utils/scraper.js';

const URLS = [
  {
    store: 'Amazon',
    url: 'https://www.amazon.com/Wireless-Charger-iPhone-Charging-Multiple/dp/B0C1H5HNV3',
  },
  {
    store: 'Amazon',
    url: 'https://www.amazon.com/dp/B0C1H5HNV3',
  },
  {
    store: 'Amazon',
    url: 'https://www.amazon.com/gp/product/B08N5WRWNW',
  },
  {
    store: 'Amazon',
    url: 'https://www.amazon.com/Laptop-Stand-Adjustable-Ergonomic-Aluminum/dp/B089ZJ4H1F',
  },
  {
    store: 'Amazon',
    url: 'https://www.amazon.com/Ergonomic-Wireless-Vertical-Rechargeable-Adjustable/dp/B07DGR98VQ',
  },
  {
    store: 'Target',
    url: 'https://www.target.com/p/bose-quietcomfort-earbuds-ii/-/A-85978615',
  },
  {
    store: 'Etsy',
    url: 'https://www.etsy.com/listing/1285934405/personalized-leather-keychain-custom-name',
  },
  {
    store: 'Best Buy',
    url: 'https://www.bestbuy.com/site/sony-wh-1000xm5-wireless-noise-canceling-over-the-ear-headphones-black/6505727.p',
  },
];

function hasRealTitle(meta) {
  if (!meta?.title) return false;
  if (meta.title === 'Gift' || meta.title === 'Untitled Gift') return false;
  const lower = meta.title.toLowerCase();
  if (lower === 'amazon.com' || lower.startsWith('amazon.com')) return false;
  return true;
}

console.log('| Store | Real title? | Image? | Notes |');
console.log('| --- | --- | --- | --- |');

for (const row of URLS) {
  const meta = await scrapeGiftMetadata(row.url);
  const titleOk = hasRealTitle(meta);
  const imageOk = Boolean(meta.image);
  const notes = [];
  if (meta.asin) notes.push(`asin=${meta.asin}`);
  if (meta.error) notes.push(meta.error.slice(0, 40));
  console.log(
    `| ${row.store} | ${titleOk ? 'Yes' : 'No'} | ${imageOk ? 'Yes' : 'No'} | ${notes.join('; ') || '—'} |`,
  );
  console.error(JSON.stringify({ code: 'benchmark_row', name: row.store, titleOk, imageOk }));
}