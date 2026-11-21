/**
 * Port of UX's PR 135 HOLD probes (/workspace/pr135-d9dff7c/ux-pr135-probe.test.jsx),
 * inverted to assert the required behavior: they fail on d9dff7c and pass after the fix.
 */
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { GuestJoinCard } from '../../components/GuestJoinCard.jsx';
import { GUEST_JOIN_COPY as COPY } from '../../utils/guestJoinCopy.js';
import { REQUEST_TIMEOUT_MS } from '../../utils/withTimeout.js';

const updateDocMock = vi.fn();
vi.mock('../../utils/firebase.js', () => ({ db: {} }));
vi.mock('../../utils/analytics.js', () => ({ trackSubmitGift: vi.fn() }));
vi.mock('../../utils/api.js', () => ({ scrapeGiftUrl: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, ...p) => ({ path: p.join('/') })),
  collection: vi.fn(), addDoc: vi.fn(), setDoc: vi.fn(() => Promise.resolve()),
  updateDoc: (...a) => updateDocMock(...a),
}));
const base = { partyId: 'pX', partyTitle: 'Swap', hostFirstName: 'Dana', user: { uid: 'u1', isAnonymous: true }, terminalMessage: null, seated: true, gift: { id: 'g1', title: 'Socks', url: 'https://example.com/s' } };

describe('UX probe PR135 (required behavior)', () => {
  it('undo that hangs: unlocks within 10s and shows a visible message, not endless Saving...', async () => {
    vi.useFakeTimers();
    updateDocMock.mockReset().mockReturnValue(new Promise(() => {}));
    const { rerender } = render(<GuestJoinCard {...base} participant={{ id: 'u1', displayName: 'Sam', ready: true }} />);
    fireEvent.click(screen.getByRole('button', { name: COPY.readyUndo }));
    // Firestore latency compensation: local snapshot flips ready:false immediately
    rerender(<GuestJoinCard {...base} participant={{ id: 'u1', displayName: 'Sam', ready: false, hasPendingWrites: true }} />);
    await act(async () => { vi.advanceTimersByTime(REQUEST_TIMEOUT_MS + 100); });
    expect(screen.queryByRole('button', { name: COPY.readySaving })).toBeNull();
    expect(screen.getByText(COPY.readyUndoSlow)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: COPY.readyUndo })).not.toBeDisabled();
    vi.useRealTimers();
  });

  it('ready save that hangs while local snapshot shows ready: do not show You are in; show slow message + retry', async () => {
    vi.useFakeTimers();
    updateDocMock.mockReset().mockReturnValue(new Promise(() => {}));
    const { rerender } = render(<GuestJoinCard {...base} participant={{ id: 'u1', displayName: 'Sam', ready: false }} />);
    fireEvent.click(screen.getByRole('button', { name: COPY.readyCta }));
    rerender(<GuestJoinCard {...base} participant={{ id: 'u1', displayName: 'Sam', ready: true, hasPendingWrites: true }} />);
    await act(async () => { vi.advanceTimersByTime(REQUEST_TIMEOUT_MS + 100); });
    expect(screen.queryByText(COPY.readyDone)).toBeNull();
    expect(screen.getByText(COPY.readySaveSlow)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: COPY.readyCta })).not.toBeDisabled();
    vi.useRealTimers();
  });

  it('seat retry: sets busy state immediately and ignores a double tap', async () => {
    let resolve; const onRetrySeat = vi.fn(() => new Promise((r) => { resolve = r; }));
    render(<GuestJoinCard {...base} gift={null} seated={false} participant={null} seatWriteSlow onRetrySeat={onRetrySeat} />);
    fireEvent.change(screen.getByLabelText(COPY.nameLabel), { target: { value: 'Sam Lee' } });
    fireEvent.click(screen.getByRole('button', { name: COPY.giftManualToggle }));
    fireEvent.change(screen.getByLabelText(COPY.giftUrlLabel), { target: { value: 'https://example.com/s' } });
    fireEvent.change(screen.getByLabelText(COPY.giftTitleLabel), { target: { value: 'Wool socks' } });
    const btn = screen.getByRole('button', { name: COPY.readyCta });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(onRetrySeat).toHaveBeenCalledTimes(1);
    const busy = screen.getByRole('button', { name: COPY.readySaving });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');
    resolve();
  });
});
