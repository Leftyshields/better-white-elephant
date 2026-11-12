import { describe, expect, it } from 'vitest';
import {
  FEATURE_CARDS,
  HOME_SEO_TITLE,
  LANDING_COPY,
  SEO_DEFAULT_DESCRIPTION,
} from '../../utils/landingMarketingCopy.js';
import { formatPartyStatus, partyEntryButtonLabel } from '../../utils/partyUiCopy.js';

describe('landingMarketingCopy', () => {
  it('uses the canonical SEO description (137 characters)', () => {
    expect(SEO_DEFAULT_DESCRIPTION).toHaveLength(137);
    expect(SEO_DEFAULT_DESCRIPTION).toMatch(/Guests join from a link\.$/);
  });

  it('exposes hero and CTA strings from the copy review', () => {
    expect(HOME_SEO_TITLE).toBe('Virtual White Elephant for Remote Teams');
    expect(LANDING_COPY.primaryCta).toBe('Host a free game');
    expect(LANDING_COPY.secondaryCta).toBe('See how it works');
    expect(LANDING_COPY.heroHeadline).toContain('Virtual White Elephant for remote teams');
    expect(LANDING_COPY.demoToastFrozen).toContain('frozen');
  });

  it('renders feature cards once with PR 59 setup and logistics wording', () => {
    expect(FEATURE_CARDS).toHaveLength(3);
    const setup = FEATURE_CARDS.find((c) => c.title === 'Easy Setup');
    expect(setup?.body).toContain('gift card builds itself');
    expect(setup?.body).not.toMatch(/scraping/i);
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
