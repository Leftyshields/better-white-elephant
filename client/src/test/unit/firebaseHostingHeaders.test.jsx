import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const firebaseJson = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../../../firebase.json'), 'utf8'),
);

/**
 * Firebase Hosting applies every matching headers rule and the last match wins
 * (firebase-tools #8917). Headers are matched against the request path, before rewrites.
 */
function globToRegExp(source) {
  const escaped = source
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '::DOUBLESTAR::')
    .replace(/\*/g, '[^/]*')
    .replace(/::DOUBLESTAR::/g, '.*');
  return new RegExp(`^${escaped}$`);
}

function cacheControlFor(path) {
  let value;
  for (const rule of firebaseJson.hosting.headers ?? []) {
    if (!rule.source) continue;
    if (globToRegExp(rule.source).test(path)) {
      const header = (rule.headers ?? []).find(
        (h) => String(h.key).toLowerCase() === 'cache-control',
      );
      if (header) value = header.value;
    }
  }
  return value;
}

describe('Firebase Hosting cache headers (G15)', () => {
  it('defines hosting headers in firebase.json', () => {
    expect(Array.isArray(firebaseJson.hosting.headers)).toBe(true);
    expect(firebaseJson.hosting.headers.length).toBeGreaterThan(0);
  });

  it('serves index.html and the SPA rewrite target with Cache-Control: no-cache', () => {
    expect(cacheControlFor('/')).toBe('no-cache');
    expect(cacheControlFor('/index.html')).toBe('no-cache');
    expect(cacheControlFor('/party/abc')).toBe('no-cache');
    expect(cacheControlFor('/join')).toBe('no-cache');
  });

  it('serves hashed /assets/** with a long immutable cache', () => {
    expect(cacheControlFor('/assets/index-q0AChdQ2.js')).toBe(
      'public, max-age=31536000, immutable',
    );
    expect(cacheControlFor('/assets/index-f1zzhpV4.css')).toBe(
      'public, max-age=31536000, immutable',
    );
  });

  it('keeps the existing SPA rewrite to /index.html', () => {
    expect(firebaseJson.hosting.rewrites).toEqual([
      { source: '**', destination: '/index.html' },
    ]);
  });
});
