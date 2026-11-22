/**
 * Pins the client invite-token write shapes that firestore.rules checks
 * (tests/firestore.item1-host-gate.rules.test.mjs mirrors the same batches in the emulator).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ops = [];
const getDocMock = vi.fn();
const setDocMock = vi.fn();

vi.mock('firebase/firestore', () => ({
  collection: (_db, ...segments) => ({ path: segments.join('/') }),
  doc: (first, ...segments) => {
    if (first && typeof first.path === 'string' && segments.length === 0) {
      return { path: `${first.path}/new-party-id`, id: 'new-party-id' };
    }
    return { path: segments.join('/'), id: segments[segments.length - 1] };
  },
  increment: (n) => ({ increment: n }),
  serverTimestamp: () => ({ serverTimestamp: true }),
  getDoc: (...args) => getDocMock(...args),
  setDoc: (...args) => setDocMock(...args),
  writeBatch: () => ({
    set: (ref, data) => ops.push({ type: 'set', path: ref.path, data }),
    update: (ref, data) => ops.push({ type: 'update', path: ref.path, data }),
    delete: (ref) => ops.push({ type: 'delete', path: ref.path }),
    commit: async () => {},
  }),
}));

const {
  buildPartyShareLink,
  createPartyWithInviteToken,
  generateInviteToken,
  joinPartyWithInviteToken,
  readInviteTokenFromHash,
  removeParticipantSeat,
  wasRemovedFromParty,
} = await import('../../utils/partyInvite.js');

const TOKEN = '0123456789abcdef0123456789abcdef';
const HEX_128 = /^[0-9a-f]{32}$/;

beforeEach(() => {
  ops.length = 0;
  getDocMock.mockReset();
  setDocMock.mockReset();
});

describe('invite token format and share link', () => {
  it('generates 128-bit hex tokens from crypto.getRandomValues', () => {
    const spy = vi.spyOn(globalThis.crypto, 'getRandomValues');
    const a = generateInviteToken();
    const b = generateInviteToken();
    expect(a).toMatch(HEX_128);
    expect(b).toMatch(HEX_128);
    expect(a).not.toBe(b);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[0][0]).toHaveLength(16);
    spy.mockRestore();
  });

  it('reads the token only from a well-formed #t= fragment', () => {
    expect(readInviteTokenFromHash(`#t=${TOKEN}`)).toBe(TOKEN);
    expect(readInviteTokenFromHash(`#x=1&t=${TOKEN}`)).toBe(TOKEN);
    expect(readInviteTokenFromHash('#t=not-a-token')).toBeNull();
    expect(readInviteTokenFromHash(`#t=${TOKEN.toUpperCase()}`)).toBeNull();
    expect(readInviteTokenFromHash('')).toBeNull();
    expect(readInviteTokenFromHash(undefined)).toBeNull();
  });

  it('puts the token in the URL fragment, never the path or query', () => {
    expect(buildPartyShareLink('https://stealorreveal.com', 'p1', TOKEN)).toBe(
      `https://stealorreveal.com/party/p1#t=${TOKEN}`,
    );
    expect(buildPartyShareLink('https://stealorreveal.com', 'p1', null)).toBe(
      'https://stealorreveal.com/party/p1',
    );
  });
});

describe('write batches', () => {
  it('create party: party with count 1, host-only token doc, host seat, one batch', async () => {
    const seat = { status: 'PENDING', ready: false };
    const id = await createPartyWithInviteToken({}, 'host-1', { adminId: 'host-1', status: 'LOBBY' }, seat);
    expect(id).toBe('new-party-id');
    expect(ops).toHaveLength(3);
    expect(ops[0]).toEqual({
      type: 'set',
      path: 'parties/new-party-id',
      data: { adminId: 'host-1', status: 'LOBBY', participantCount: 1 },
    });
    expect(ops[1].path).toBe('parties/new-party-id/private/invite');
    expect(Object.keys(ops[1].data).sort()).toEqual(['token', 'updatedAt']);
    expect(ops[1].data.token).toMatch(HEX_128);
    expect(ops[2]).toEqual({ type: 'set', path: 'parties/new-party-id/participants/host-1', data: seat });
  });

  it('join: seat, write-only join proof with the token, count + 1; token never on the seat', async () => {
    const seat = { status: 'GOING', ready: false };
    await joinPartyWithInviteToken({}, 'p1', 'guest-1', TOKEN, seat);
    expect(ops).toEqual([
      { type: 'set', path: 'parties/p1/participants/guest-1', data: seat },
      { type: 'set', path: 'parties/p1/joinProofs/guest-1', data: { token: TOKEN } },
      { type: 'update', path: 'parties/p1', data: { participantCount: { increment: 1 } } },
    ]);
  });

  it('remove participant frees the seat on counted parties only, and marks the removal (G28)', async () => {
    const marker = { type: 'set', path: 'parties/p1/removedSeats/guest-1', data: { removedAt: { serverTimestamp: true } } };
    await removeParticipantSeat({}, { id: 'p1', participantCount: 4 }, 'guest-1');
    expect(ops).toEqual([
      { type: 'delete', path: 'parties/p1/participants/guest-1' },
      marker,
      { type: 'update', path: 'parties/p1', data: { participantCount: { increment: -1 } } },
    ]);
    ops.length = 0;
    await removeParticipantSeat({}, { id: 'legacy' }, 'guest-1');
    expect(ops).toEqual([
      { type: 'delete', path: 'parties/legacy/participants/guest-1' },
      { ...marker, path: 'parties/legacy/removedSeats/guest-1' },
    ]);
  });
});

describe('G28 wasRemovedFromParty', () => {
  it('is true only when the own removal marker exists', async () => {
    getDocMock.mockResolvedValueOnce({ exists: () => true });
    await expect(wasRemovedFromParty({}, 'p1', 'guest-1')).resolves.toBe(true);
    expect(getDocMock.mock.calls[0][0].path).toBe('parties/p1/removedSeats/guest-1');
    getDocMock.mockResolvedValueOnce({ exists: () => false });
    await expect(wasRemovedFromParty({}, 'p1', 'guest-1')).resolves.toBe(false);
  });

  it('treats a denied, failed or slow read as not removed (keeps today\'s message)', async () => {
    getDocMock.mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'permission-denied' }));
    await expect(wasRemovedFromParty({}, 'p1', 'guest-1')).resolves.toBe(false);
    getDocMock.mockRejectedValueOnce(Object.assign(new Error('slow'), { name: 'TimeoutError' }));
    await expect(wasRemovedFromParty({}, 'p1', 'guest-1')).resolves.toBe(false);
    await expect(wasRemovedFromParty({}, 'p1', '')).resolves.toBe(false);
    expect(getDocMock).toHaveBeenCalledTimes(2);
  });
});
