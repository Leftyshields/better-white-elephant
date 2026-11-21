/**
 * UX v3 item 1 (HIGH): the participants listener must ask for metadata changes, or a seat the
 * player wrote themselves never arrives as confirmed (hasPendingWrites false). Snapshots where
 * no seat changed (only the cache/online flag flipped) are skipped so consumers do not re-render
 * or refetch names for nothing. Fails on d3eacd3.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useParty } from '../../hooks/useParty.js';

const listeners = [];
vi.mock('../../utils/firebase.js', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, ...p) => ({ path: p.join('/') })),
  collection: vi.fn((_db, ...p) => ({ path: p.join('/') })),
  query: vi.fn((ref) => ref),
  where: vi.fn(),
  onSnapshot: vi.fn((ref, ...rest) => {
    const options = typeof rest[0] === 'object' && typeof rest[0] !== 'function' ? rest.shift() : undefined;
    listeners.push({ path: ref.path, options, next: rest[0] });
    return () => {};
  }),
}));

const participantsListener = () => listeners.find((l) => l.path === 'parties/p1/participants');

function snapshot(seats, changes) {
  return {
    docs: seats.map((s) => ({ id: s.id, data: () => ({ ready: s.ready }), metadata: { hasPendingWrites: s.pending } })),
    docChanges: (opts) => (opts?.includeMetadataChanges ? changes : changes.filter((c) => c.type !== 'metadata')),
  };
}

beforeEach(() => {
  listeners.length = 0;
});

describe('useParty participants listener', () => {
  it('subscribes with includeMetadataChanges and delivers the confirmed own write', () => {
    const { result } = renderHook(() => useParty('p1', 'u1'));
    expect(participantsListener().options).toEqual({ includeMetadataChanges: true });

    act(() => participantsListener().next(snapshot([{ id: 'u1', ready: false, pending: false }], [{ type: 'added' }])));
    act(() => participantsListener().next(snapshot([{ id: 'u1', ready: true, pending: true }], [{ type: 'modified' }])));
    expect(result.current.participants[0]).toMatchObject({ id: 'u1', ready: true, hasPendingWrites: true });

    // Server ack: same data, only the doc's pending flag changes.
    act(() => participantsListener().next(snapshot([{ id: 'u1', ready: true, pending: false }], [{ type: 'metadata' }])));
    expect(result.current.participants[0]).toMatchObject({ id: 'u1', ready: true, hasPendingWrites: false });
  });

  it('skips snapshots where no seat changed, keeping the same array', () => {
    const { result } = renderHook(() => useParty('p1', 'u1'));
    act(() => participantsListener().next(snapshot([{ id: 'u1', ready: false, pending: false }], [{ type: 'added' }])));
    const before = result.current.participants;

    act(() => participantsListener().next(snapshot([{ id: 'u1', ready: false, pending: false }], [])));

    expect(result.current.participants).toBe(before);
  });
});
