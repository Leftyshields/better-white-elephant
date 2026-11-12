import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { FEATURE_CARDS } from '../../utils/landingMarketingCopy.js';

const clientSrc = join(dirname(fileURLToPath(import.meta.url)), '../..');

const rulesSource = readFileSync(join(clientSrc, 'components/RulesContent.jsx'), 'utf8');
const profileSource = readFileSync(join(clientSrc, 'pages/Profile.jsx'), 'utf8');
const privacySource = readFileSync(join(clientSrc, 'pages/Privacy.jsx'), 'utf8');

const AUTO_PILOT_BODY =
  'Before the game, you add a shipping address so the person mailing your gift can ship. It auto-deletes 30 days after the game ends.';

const RULES_AFTER_GAME =
  'Before the game, add a shipping address in your profile so the person mailing your gift can ship. It auto-deletes 30 days after the game ends.';

const PROFILE_SHIPPING_INTRO =
  'Add this before the game so the person mailing your gift can ship. It auto-deletes 30 days after the game ends.';

describe('Copywriter shipping / retention strings', () => {
  it('Auto-Pilot Logistics card body', () => {
    const autopilot = FEATURE_CARDS.find((c) => c.title === 'Auto-Pilot Logistics');
    expect(autopilot?.body).toBe(AUTO_PILOT_BODY);
  });

  it('Rules After the game paragraph', () => {
    expect(rulesSource).toContain(RULES_AFTER_GAME);
  });

  it('Profile shipping intro', () => {
    expect(profileSource).toContain(PROFILE_SHIPPING_INTRO);
  });

  it('Privacy Fulfillment Information bullet', () => {
    expect(privacySource).toContain(
      'Shipping addresses you provide for gift fulfillment. The person mailing your gift uses this address to ship. It auto-deletes 30 days after the game ends.',
    );
  });

  it('Privacy With Other Participants bullet', () => {
    expect(privacySource).toContain(
      'Your name and email may be visible to other participants in the same gift exchange party. After the game, the person mailing your gift uses your shipping address to ship. That address auto-deletes 30 days after the game ends.',
    );
  });

  it('Privacy Data Retention bullets for game, fulfillment, and gift links', () => {
    expect(privacySource).toContain(
      '<strong>Game and Party Data:</strong> Auto-deletes 30 days after the game ends.',
    );
    expect(privacySource).toContain(
      '<strong>Fulfillment Information (Shipping Addresses):</strong> Auto-deletes 30 days after the game ends.',
    );
    expect(privacySource).toContain(
      '<strong>Gift Links:</strong> Auto-deletes 30 days after the game ends.',
    );
  });

  it('does not retain removed email / sharing / 1-year claims', () => {
    const combined = [rulesSource, profileSource, privacySource, AUTO_PILOT_BODY].join('\n');
    expect(combined).not.toMatch(/we email/i);
    expect(combined).not.toMatch(/only shared with the person assigned/i);
    expect(combined).not.toMatch(/fulfillment is confirmed/i);
    expect(combined).not.toMatch(/1 year after the game ends/i);
  });
});
