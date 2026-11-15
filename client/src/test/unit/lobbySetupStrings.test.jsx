import { describe, expect, it } from 'vitest';
import {
  LOBBY_SETUP_STRINGS,
  formatLobbySetupString,
} from '../../copy/lobbySetupStrings.js';

describe('lobbySetupStrings', () => {
  it('keys stay sorted alphabetically', () => {
    const keys = Object.keys(LOBBY_SETUP_STRINGS);
    expect(keys).toEqual([...keys].sort());
  });

  it('has no draft-only welcome or host count keys', () => {
    expect(LOBBY_SETUP_STRINGS).not.toHaveProperty('guest.welcome.signoff');
    expect(LOBBY_SETUP_STRINGS).not.toHaveProperty('guest.welcome.signoff_no_host');
    expect(LOBBY_SETUP_STRINGS).not.toHaveProperty('host.start.count.one_left');
    expect(LOBBY_SETUP_STRINGS).not.toHaveProperty('address.title');
  });

  it('interpolates guest welcome title with party name', () => {
    expect(formatLobbySetupString('guest.welcome.title', { partyName: 'Squad' })).toBe(
      'Hiya pal, welcome to Squad!',
    );
  });

  it('keeps slot-keyed guest ready address lock copy', () => {
    expect(LOBBY_SETUP_STRINGS['guest.ready.locked.address']).toBe(
      "Add your shipping address before you're ready.",
    );
  });

  it('shows address consent as plain copy without bracket placeholders', () => {
    expect(LOBBY_SETUP_STRINGS['address.consent']).not.toMatch(/\[COPY/);
  });
});