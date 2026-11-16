import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGiftHtml } from '../utils/gift-html-parse.js';

test('parseGiftHtml prefers JSON-LD Product over generic page title', () => {
  const html = `<!doctype html><html><head>
    <title>Amazon.com</title>
    <meta property="og:title" content="Amazon.com" />
    <script type="application/ld+json">
    {"@type":"Product","name":"Anker MagGo Charger","image":"https://cdn.example.com/p.jpg"}
    </script>
  </head><body></body></html>`;

  const parsed = parseGiftHtml(html, 'www.amazon.com', 'https://www.amazon.com');
  assert.equal(parsed.rawTitle, 'Anker MagGo Charger');
  assert.equal(parsed.image, 'https://cdn.example.com/p.jpg');
});

test('parseGiftHtml strips generic store title from document title', () => {
  const html = `<!doctype html><html><head><title>Target</title></head><body></body></html>`;
  const parsed = parseGiftHtml(html, 'www.target.com', 'https://www.target.com');
  assert.equal(parsed.rawTitle, '');
});