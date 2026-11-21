/**
 * Port of UX's PR 135 v3 HOLD probes (/workspace/pr135-d3eacd3/ux-v3-probe.test.jsx, probe 2) plus
 * the item 5 Low, inverted to assert the required behavior. Each fails on d3eacd3 and passes after
 * the fix. Probe 1 (the one-tap handover) needs the Party page around the card; it lives in
 * partyReadyHandover.test.jsx.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { GuestJoinCard, clearGuestJoinDrafts } from '../../components/GuestJoinCard.jsx';
import { GUEST_JOIN_COPY as COPY } from '../../utils/guestJoinCopy.js';
import { REQUEST_TIMEOUT_MS } from '../../utils/withTimeout.js';

const updateDocMock = vi.fn();
vi.mock('../../utils/firebase.js', () => ({ db: {} }));
vi.mock('../../utils/analytics.js', () => ({ trackSubmitGift: vi.fn() }));
vi.mock('../../utils/api.js', () => ({ scrapeGiftUrl: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, ...p) => ({ path: p.join('/') })),
  collection: vi.fn(),
  getDocs: vi.fn(() => Promise.resolve({ empty: true, docs: [] })),
  query: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  addDoc: vi.fn(() => Promise.resolve({ id: 'g9' })),
  setDoc: vi.fn(() => Promise.resolve()),
  updateDoc: (...a) => updateDocMock(...a),
}));

const base = { partyId: 'pV', partyTitle: 'Swap', hostFirstName: 'Dana', user: { uid: 'u1', isAnonymous: true }, terminalMessage: null, seated: true };
const gift = { id: 'g1', title: 'Socks', url: 'https://example.com/s' };
const seat = (ready, hasPendingWrites) => ({ id: 'u1', displayName: 'Sam', ready, hasPendingWrites });

afterEach(() => {
  clearGuestJoinDrafts();
  vi.useRealTimers();
});

describe('UX v3 probe 2: a late undo that lands switches the card off "You\'re in!"', () => {
  it('undo times out, then the write succeeds with no further snapshot: the card shows the form again', async () => {
    vi.useFakeTimers();
    let resolveUndo;
    updateDocMock.mockReset().mockReturnValue(new Promise((r) => { resolveUndo = r; }));
    const { rerender } = render(<GuestJoinCard {...base} gift={gift} participant={seat(true, false)} />);
    fireEvent.click(screen.getByRole('button', { name: COPY.readyUndo }));
    rerender(<GuestJoinCard {...base} gift={gift} participant={seat(false, true)} />);
    await act(async () => { vi.advanceTimersByTime(REQUEST_TIMEOUT_MS + 100); });
    expect(screen.getByText(COPY.readyUndoSlow)).toBeTruthy();

    await act(async () => { resolveUndo(); await Promise.resolve(); await Promise.resolve(); });

    expect(screen.queryByText(COPY.readyDone)).toBeNull();
    expect(screen.queryByText(COPY.readyUndoSlow)).toBeNull();
    expect(screen.getByRole('button', { name: COPY.readyCta })).toBeTruthy();
  });

  it('undo times out, then the confirmed snapshot (includeMetadataChanges) says not ready: the card follows it', async () => {
    vi.useFakeTimers();
    updateDocMock.mockReset().mockReturnValue(new Promise(() => {}));
    const { rerender } = render(<GuestJoinCard {...base} gift={gift} participant={seat(true, false)} />);
    fireEvent.click(screen.getByRole('button', { name: COPY.readyUndo }));
    rerender(<GuestJoinCard {...base} gift={gift} participant={seat(false, true)} />);
    await act(async () => { vi.advanceTimersByTime(REQUEST_TIMEOUT_MS + 100); });
    expect(screen.getByText(COPY.readyDone)).toBeTruthy();

    rerender(<GuestJoinCard {...base} gift={gift} participant={seat(false, false)} />);

    expect(screen.queryByText(COPY.readyDone)).toBeNull();
    expect(screen.getByRole('button', { name: COPY.readyCta })).toBeTruthy();
  });

  it('a late undo does not undo a newer I\'m ready tap', async () => {
    vi.useFakeTimers();
    let resolveUndo;
    updateDocMock.mockReset()
      .mockReturnValueOnce(new Promise((r) => { resolveUndo = r; }))
      .mockReturnValue(Promise.resolve());
    const { rerender } = render(<GuestJoinCard {...base} gift={gift} participant={seat(true, false)} />);
    fireEvent.click(screen.getByRole('button', { name: COPY.readyUndo }));
    await act(async () => { vi.advanceTimersByTime(REQUEST_TIMEOUT_MS + 100); });
    // The guest sees the confirmed not-ready state, taps I'm ready again, and that save lands.
    rerender(<GuestJoinCard {...base} gift={gift} participant={seat(false, false)} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: COPY.readyCta }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText(COPY.readyDone)).toBeTruthy();

    await act(async () => { resolveUndo(); await Promise.resolve(); await Promise.resolve(); });

    expect(screen.getByText(COPY.readyDone)).toBeTruthy();
  });
});

describe('UX v3 item 5: no "Tap I\'m ready" hint under "You\'re in!"', () => {
  it('a timed-out ready save that the server then confirms clears the slow message', async () => {
    vi.useFakeTimers();
    updateDocMock.mockReset().mockReturnValue(new Promise(() => {}));
    const { rerender } = render(<GuestJoinCard {...base} gift={gift} participant={seat(false, false)} />);
    fireEvent.click(screen.getByRole('button', { name: COPY.readyCta }));
    await act(async () => { await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 100); });
    expect(screen.getByText(COPY.readySaveSlow)).toBeTruthy();

    rerender(<GuestJoinCard {...base} gift={gift} participant={seat(true, false)} />);

    expect(screen.getByText(COPY.readyDone)).toBeTruthy();
    expect(screen.queryByText(COPY.readySaveSlow)).toBeNull();
  });
});
