/**
 * G25 gift privacy: in the lobby useParty listens only to the caller's own gift; once the game is
 * ACTIVE or ENDED it listens to every gift in the party (the game board needs them).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const listeners = [];

vi.mock('../../utils/firebase.js', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, ...path) => ({ kind: 'doc', path: path.join('/') })),
  collection: vi.fn((_db, ...path) => ({ kind: 'collection', path: path.join('/') })),
  where: vi.fn((field, op, value) => ({ field, op, value })),
  query: vi.fn((ref, ...filters) => ({ kind: 'query', path: ref.path, filters })),
  onSnapshot: vi.fn((target, next) => {
    const entry = { target, next, active: true };
    listeners.push(entry);
    return () => {
      entry.active = false;
    };
  }),
}));

const { useParty, giftListenScope } = await import('../../hooks/useParty.js');

const PARTY_ID = 'party-g25';

function partyListener() {
  return listeners.find((l) => l.target.kind === 'doc' && l.target.path === `parties/${PARTY_ID}`);
}
function activeGiftListeners() {
  return listeners.filter((l) => l.active && l.target.path === 'gifts');
}
function emitParty(status) {
  act(() => {
    partyListener().next({ id: PARTY_ID, exists: () => true, data: () => ({ adminId: 'host', status }) });
  });
}

describe('giftListenScope', () => {
  it('maps party status and uid to a listen scope', () => {
    expect(giftListenScope(null, 'u1')).toBe('none');
    expect(giftListenScope({ status: 'LOBBY' }, null)).toBe('none');
    expect(giftListenScope({ status: 'LOBBY' }, 'u1')).toBe('own');
    expect(giftListenScope({ status: 'CANCELLED' }, 'u1')).toBe('own');
    expect(giftListenScope({ status: 'ACTIVE' }, null)).toBe('party');
    expect(giftListenScope({ status: 'ENDED' }, 'u1')).toBe('party');
  });
});

describe('useParty gift listener (G25)', () => {
  beforeEach(() => {
    listeners.length = 0;
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not listen to gifts before the party loads', () => {
    renderHook(() => useParty(PARTY_ID, 'guest-1'));
    expect(activeGiftListeners()).toHaveLength(0);
  });

  it('in the lobby listens only to the caller\'s own gift', () => {
    renderHook(() => useParty(PARTY_ID, 'guest-1'));
    emitParty('LOBBY');
    const gifts = activeGiftListeners();
    expect(gifts).toHaveLength(1);
    expect(gifts[0].target.filters).toEqual([
      { field: 'partyId', op: '==', value: PARTY_ID },
      { field: 'submitterId', op: '==', value: 'guest-1' },
    ]);
  });

  it('in the lobby without a signed-in uid listens to no gifts', () => {
    renderHook(() => useParty(PARTY_ID, null));
    emitParty('LOBBY');
    expect(activeGiftListeners()).toHaveLength(0);
  });

  it('switches to every party gift when the game starts, and drops the own-gift listener', () => {
    const { result } = renderHook(() => useParty(PARTY_ID, 'guest-1'));
    emitParty('LOBBY');
    emitParty('ACTIVE');
    const gifts = activeGiftListeners();
    expect(gifts).toHaveLength(1);
    expect(gifts[0].target.filters).toEqual([{ field: 'partyId', op: '==', value: PARTY_ID }]);
    act(() => {
      gifts[0].next({ docs: [{ id: 'g1', data: () => ({ partyId: PARTY_ID, submitterId: 'other' }) }] });
    });
    expect(result.current.gifts).toEqual([{ id: 'g1', partyId: PARTY_ID, submitterId: 'other' }]);
  });

  it('the game board (no uid passed) still gets every gift once ACTIVE', () => {
    renderHook(() => useParty(PARTY_ID));
    emitParty('ACTIVE');
    const gifts = activeGiftListeners();
    expect(gifts).toHaveLength(1);
    expect(gifts[0].target.filters).toEqual([{ field: 'partyId', op: '==', value: PARTY_ID }]);
  });
});
