import { describe, expect, it } from 'vitest';
import { computeLobbyReadiness, LOBBY_MISSING } from '../../utils/computeLobbyReadiness.js';

const PARTY = { adminId: 'host' };

function addr() {
  return { street: '1 Main', city: 'Town' };
}

describe('computeLobbyReadiness', () => {
  it('counts none ready when only host has gift and address', () => {
    const result = computeLobbyReadiness({
      party: PARTY,
      participants: [
        { id: 'host', status: 'GOING', ready: false },
        { id: 'guest-a', status: 'GOING', ready: false },
      ],
      gifts: [
        { submitterId: 'host', id: 'g1' },
        { submitterId: 'guest-a', id: 'g2' },
      ],
      addressesByUserId: {
        host: addr(),
      },
    });

    expect(result.totalCount).toBe(2);
    expect(result.readyCount).toBe(1);
    expect(result.allReady).toBe(false);
    expect(result.hostStartStepComplete).toBe(false);
  });

  it('marks step incomplete when guest is GOING but not ready while host is ready', () => {
    const result = computeLobbyReadiness({
      party: PARTY,
      participants: [
        { id: 'host', status: 'GOING', ready: false },
        { id: 'guest-a', status: 'GOING', ready: false },
      ],
      gifts: [
        { submitterId: 'host', id: 'g1' },
        { submitterId: 'guest-a', id: 'g2' },
      ],
      addressesByUserId: {
        host: addr(),
      },
    });

    expect(result.hostStartStepComplete).toBe(false);
    const guest = result.people.find((p) => p.userId === 'guest-a');
    expect(guest.ready).toBe(false);
    expect(guest.missing).toContain('address');
  });

  it('reports all ready when every GOING player is ready', () => {
    const result = computeLobbyReadiness({
      party: PARTY,
      participants: [
        { id: 'host', status: 'GOING', ready: false },
        { id: 'guest-a', status: 'GOING', ready: true },
      ],
      gifts: [
        { submitterId: 'host', id: 'g1' },
        { submitterId: 'guest-a', id: 'g2' },
      ],
      addressesByUserId: {
        host: addr(),
      },
    });

    expect(result.readyCount).toBe(2);
    expect(result.allReady).toBe(true);
    expect(result.hostStartStepComplete).toBe(true);
  });

  it('goes back to incomplete when a new player joins after all were ready', () => {
    const readyRoster = computeLobbyReadiness({
      party: PARTY,
      participants: [
        { id: 'host', status: 'GOING', ready: false },
        { id: 'guest-a', status: 'GOING', ready: true },
      ],
      gifts: [
        { submitterId: 'host', id: 'g1' },
        { submitterId: 'guest-a', id: 'g2' },
      ],
      addressesByUserId: { host: addr() },
    });
    expect(readyRoster.hostStartStepComplete).toBe(true);

    const afterJoin = computeLobbyReadiness({
      party: PARTY,
      participants: [
        { id: 'host', status: 'GOING', ready: false },
        { id: 'guest-a', status: 'GOING', ready: true },
        { id: 'guest-b', status: 'GOING', ready: false },
      ],
      gifts: [
        { submitterId: 'host', id: 'g1' },
        { submitterId: 'guest-a', id: 'g2' },
      ],
      addressesByUserId: { host: addr() },
    });

    expect(afterJoin.totalCount).toBe(3);
    expect(afterJoin.hostStartStepComplete).toBe(false);
  });

  it('does not mark host-only party as all ready', () => {
    const result = computeLobbyReadiness({
      party: PARTY,
      participants: [{ id: 'host', status: 'GOING', ready: false }],
      gifts: [{ submitterId: 'host', id: 'g1' }],
      addressesByUserId: { host: addr() },
    });
    expect(result.allReady).toBe(false);
    expect(result.hostStartStepComplete).toBe(false);
  });

  it('regression: host missing address must not complete when guest is ready', () => {
    const result = computeLobbyReadiness({
      party: PARTY,
      participants: [
        { id: 'host', status: 'GOING', ready: false },
        { id: 'guest-a', status: 'GOING', ready: true },
      ],
      gifts: [
        { submitterId: 'host', id: 'g1' },
        { submitterId: 'guest-a', id: 'g2' },
      ],
      addressesByUserId: {
        host: null,
      },
    });
    expect(result.hostStartStepComplete).toBe(false);
    expect(result.readyCount).toBe(1);
  });

  it('lists not_joined and gift/address missing for wait copy', () => {
    const result = computeLobbyReadiness({
      party: PARTY,
      participants: [
        { id: 'host', status: 'GOING', ready: false },
        { id: 'guest-pending', status: 'PENDING', ready: false },
        { id: 'guest-b', status: 'GOING', ready: false },
      ],
      gifts: [{ submitterId: 'host', id: 'g1' }],
      addressesByUserId: { host: addr() },
    });
    const pending = result.people.find((p) => p.userId === 'guest-pending');
    expect(pending.missing).toContain(LOBBY_MISSING.NOT_JOINED);
    const guestB = result.people.find((p) => p.userId === 'guest-b');
    expect(guestB.missing).toEqual([LOBBY_MISSING.GIFT, LOBBY_MISSING.ADDRESS]);
  });

  it('treats bots as address-ready when ready flag is set', () => {
    const result = computeLobbyReadiness({
      party: PARTY,
      participants: [
        { id: 'host', status: 'GOING', ready: false },
        { id: 'bot_party_0_abc', status: 'GOING', ready: true },
      ],
      gifts: [
        { submitterId: 'host', id: 'g1' },
        { submitterId: 'bot_party_0_abc', id: 'g2' },
      ],
      addressesByUserId: { host: addr() },
      botIdsByUserId: { bot_party_0_abc: true },
    });
    expect(result.hostStartStepComplete).toBe(true);
  });
});