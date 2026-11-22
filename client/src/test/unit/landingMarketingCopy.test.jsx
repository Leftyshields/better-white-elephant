import { describe, expect, it } from 'vitest';
import {
  FEATURE_CARDS,
  HOME_SEO_TITLE,
  LANDING_COPY,
  SEO_DEFAULT_DESCRIPTION,
  SIGNED_IN_COPY,
} from '../../utils/landingMarketingCopy.js';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
import { formatPartyStatus, partyEntryButtonLabel } from '../../utils/partyUiCopy.js';

describe('landingMarketingCopy', () => {
  it('uses Copywriter\'s signed SEO description, hero subhead and empty state (party code)', () => {
    expect(SEO_DEFAULT_DESCRIPTION).toBe(
      'A free online White Elephant gift exchange, or Dirty Santa, played live in your browser on Zoom, Teams, or Meet. Guests join with a link or party code.',
    );
    expect(LANDING_COPY.heroSubhead).toBe(
      'Play an online White Elephant, or Dirty Santa, in your browser during Zoom, Teams, or Meet. Guests join with a link or party code. The game handles turns, steals, and the rules.',
    );
    expect(SIGNED_IN_COPY.emptyBody).toBe(
      'Have a party code from your host? Enter it above to join, or host your own game.',
    );
  });

  it('keeps index.html meta descriptions in sync with SEO_DEFAULT_DESCRIPTION', () => {
    const html = readFileSync(resolve(__dirname, '../../../index.html'), 'utf8');
    const metas = html.match(/(name|property)="(description|og:description|twitter:description)" content="[^"]*"/g) || [];
    expect(metas).toHaveLength(3);
    for (const meta of metas) expect(meta).toContain(`content="${SEO_DEFAULT_DESCRIPTION}"`);
  });

  it('exposes hero and CTA strings from the copy review', () => {
    expect(HOME_SEO_TITLE).toBe('Virtual White Elephant for Remote Teams');
    expect(LANDING_COPY.primaryCta).toBe('Host a free game');
    expect(LANDING_COPY.secondaryCta).toBe('See how it works');
    expect(LANDING_COPY.microline).toBe('Free to host. Guests join with a link or a party code.');
    expect(LANDING_COPY.heroHeadlineMobile).toBe('White Elephant, played live on your call.');
    expect(LANDING_COPY.heroSubheadMobile).toBe(
      'Play in your browser on any video call. The game runs the turns and steals.',
    );
    expect(LANDING_COPY.heroHeadline).toContain('Virtual White Elephant for remote teams');
    expect(LANDING_COPY.demoToastFrozen).toContain('frozen');
  });

  it('renders feature cards once with PR 59 setup and logistics wording', () => {
    expect(FEATURE_CARDS).toHaveLength(3);
    const setup = FEATURE_CARDS.find((c) => c.title === 'Easy Setup');
    expect(setup?.body).toContain('gift card builds itself');
    expect(setup?.body).not.toMatch(/scraping/i);
  });

  it('Auto-Pilot Logistics uses the Copywriter A0 final (7:01 PM PT Nov 21)', () => {
    const autopilot = FEATURE_CARDS.find((c) => c.title === 'Auto-Pilot Logistics');
    expect(autopilot?.body).toBe(
      'When the game ends, each winner adds a shipping address right on the end screen. Only the person mailing the gift sees it, and it auto-deletes 30 days later.',
    );
    const featureCopy = FEATURE_CARDS.map((c) => c.body).join(' ');
    expect(featureCopy).not.toMatch(/we email/i);
    expect(featureCopy).not.toMatch(/nobody else sees it/i);
    // PR 63 banned 'only the person' here; the A0 final (Copywriter 7:01 PM PT Nov 21) brings it back
    // on purpose, matching the per-game address that only the giver can read.
    expect(featureCopy.match(/only the person/gi) ?? []).toHaveLength(1);
    expect(featureCopy).not.toMatch(/goes privately/i);
  });
});

describe('partyUiCopy', () => {
  it('humanizes party status labels', () => {
    expect(formatPartyStatus('LOBBY')).toBe('Lobby');
    expect(formatPartyStatus('ACTIVE')).toBe('In progress');
    expect(formatPartyStatus('CANCELLED')).toBe('Canceled');
    expect(partyEntryButtonLabel('ACTIVE')).toBe('Open game');
  });
});
