import { describe, expect, it } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SEO } from '../../components/SEO.jsx';

const clientRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');

function renderSeo(props) {
  return render(
    <HelmetProvider>
      <SEO {...props} />
    </HelmetProvider>,
  );
}

describe('SEO', () => {
  it('does not ship a fixed home canonical in index.html', () => {
    const html = readFileSync(join(clientRoot, 'index.html'), 'utf8');
    expect(html).not.toMatch(/<link rel="canonical"/i);
  });

  it('sets canonical href from the route url prop', async () => {
    renderSeo({
      title: 'White Elephant Rules',
      description: 'Rules copy',
      url: '/rules',
    });
    await waitFor(() => {
      const canonical = document.querySelector('link[rel="canonical"]');
      expect(canonical?.getAttribute('href')).toBe('https://stealorreveal.com/rules');
    });
  });

  it('uses the site root when url is /', async () => {
    renderSeo({
      title: 'Home',
      description: 'Home copy',
      url: '/',
    });
    await waitFor(() => {
      const canonical = document.querySelector('link[rel="canonical"]');
      expect(canonical?.getAttribute('href')).toBe('https://stealorreveal.com/');
    });
  });
});
