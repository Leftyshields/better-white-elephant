/**
 * Invite landing (batch 2 item 4): no sign-in screen, no join button, no alert(), no reload.
 * The guest gets a silent session and a background seat write with the #t= token while the
 * one-screen card is already on screen. Refusals show inline Copywriter strings.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PartyInviteLanding } from '../../components/PartyInviteLanding.jsx';
import { clearGuestJoinDrafts } from '../../components/GuestJoinCard.jsx';
import {
  JOIN_ERROR_CANCELLED,
  JOIN_ERROR_GENERIC,
  JOIN_ERROR_LINK_INVALID,
  JOIN_ERROR_PARTY_FULL,
  JOIN_ERROR_STARTED,
} from '../../utils/partyInviteCopy.js';
import { GUEST_JOIN_COPY } from '../../utils/guestJoinCopy.js';
import { LATE_INVITE_COPY, formatLatePartyLine } from '../../utils/lateInvite.js';
import { REQUEST_TIMEOUT_MS } from '../../utils/withTimeout.js';

const PARTY_ID = 'invite-join-party';
const TOKEN = 'feedfacefeedfacefeedfacefeedface';

const useAuthMock = vi.fn();
const joinMock = vi.fn();
const getDocMock = vi.fn();
const addDocMock = vi.fn();
const updateDocMock = vi.fn();
const ensureGuestSession = vi.fn();
const authState = vi.hoisted(() => ({ currentUser: null }));

vi.mock('../../hooks/useAuth.js', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('../../utils/analytics.js', () => ({
  trackParticipantJoin: vi.fn(),
  trackError: vi.fn(),
  trackSubmitGift: vi.fn(),
}));

vi.mock('../../utils/firebase.js', () => ({
  db: { name: 'test-db' },
  auth: authState,
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, ...path) => ({ path: path.join('/') })),
  getDoc: (...args) => getDocMock(...args),
  addDoc: (...args) => addDocMock(...args),
  collection: vi.fn((_db, name) => ({ path: name })),
  getDocs: vi.fn(() => Promise.resolve({ empty: true, docs: [] })),
  query: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: (...args) => updateDocMock(...args),
}));

vi.mock('../../utils/partyInvite.js', async (importOriginal) => ({
  ...(await importOriginal()),
  joinPartyWithInviteToken: (...args) => joinMock(...args),
}));

const missing = { exists: () => false, data: () => undefined };

function mockPartyReads(partyData) {
  getDocMock.mockImplementation(async (ref) => {
    if (ref.path === `parties/${PARTY_ID}`) return { exists: () => true, data: () => partyData };
    return missing;
  });
}

function signedOut() {
  authState.currentUser = null;
  useAuthMock.mockReturnValue({ user: null, loading: false, ensureGuestSession, signInWithGoogle: vi.fn() });
}

function signedIn(user) {
  authState.currentUser = user;
  useAuthMock.mockReturnValue({ user, loading: false, ensureGuestSession, signInWithGoogle: vi.fn() });
}

describe('PartyInviteLanding join', () => {
  beforeEach(() => {
    joinMock.mockReset();
    getDocMock.mockReset();
    addDocMock.mockReset().mockResolvedValue({ id: 'g1' });
    updateDocMock.mockReset().mockResolvedValue(undefined);
    ensureGuestSession.mockReset();
    ensureGuestSession.mockResolvedValue({ uid: 'anon-1', isAnonymous: true, displayName: null, email: null });
    window.sessionStorage.clear();
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockPartyReads({ title: 'Swap', adminId: 'host-uid-1', hostDisplayName: 'Dana Host', status: 'LOBBY', participantCount: 2 });
    signedOut();
  });

  afterEach(() => {
    clearGuestJoinDrafts();
    window.history.replaceState(null, '', '/');
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows the one-screen card with no sign-in step and no join button', async () => {
    window.history.replaceState(null, '', `/party/${PARTY_ID}#t=${TOKEN}`);
    joinMock.mockReturnValue(new Promise(() => {}));

    render(<PartyInviteLanding partyId={PARTY_ID} />);

    expect(await screen.findByLabelText(GUEST_JOIN_COPY.nameLabel)).toBeInTheDocument();
    expect(screen.getByText(GUEST_JOIN_COPY.welcomeTitle('Swap'))).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /join this party/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /sign in/i })).toBeNull();
    expect(screen.getAllByRole('button', { name: GUEST_JOIN_COPY.readyCta })).toHaveLength(1);
  });

  it('seats a signed-out guest in the background with an anonymous session and the #t= token', async () => {
    window.history.replaceState(null, '', `/party/${PARTY_ID}#t=${TOKEN}`);
    joinMock.mockResolvedValue(undefined);

    render(<PartyInviteLanding partyId={PARTY_ID} />);

    await waitFor(() => expect(joinMock).toHaveBeenCalledTimes(1));
    expect(ensureGuestSession).toHaveBeenCalledTimes(1);
    expect(joinMock).toHaveBeenCalledWith(
      { name: 'test-db' },
      PARTY_ID,
      'anon-1',
      TOKEN,
      expect.objectContaining({ status: 'GOING', ready: false }),
    );
    expect(joinMock.mock.calls[0][4]).not.toHaveProperty('displayName');
    expect(window.alert).not.toHaveBeenCalled();
  });

  it('writes the Google first name and last initial onto the seat for a signed-in guest', async () => {
    window.history.replaceState(null, '', `/party/${PARTY_ID}#t=${TOKEN}`);
    const user = { uid: 'guest-1', displayName: 'Alex Kim', email: 'alex.kim@example.com' };
    signedIn(user);
    ensureGuestSession.mockResolvedValue(user);
    joinMock.mockResolvedValue(undefined);

    render(<PartyInviteLanding partyId={PARTY_ID} />);

    await waitFor(() => expect(joinMock).toHaveBeenCalledTimes(1));
    expect(joinMock.mock.calls[0][2]).toBe('guest-1');
    expect(joinMock.mock.calls[0][4]).toMatchObject({ displayName: 'Alex', lastInitial: 'K' });
  });

  it('leaves the seat name off when the Google name is email-shaped', async () => {
    window.history.replaceState(null, '', `/party/${PARTY_ID}#t=${TOKEN}`);
    const user = { uid: 'guest-1', displayName: 'alex@example.com', email: 'alex@example.com' };
    signedIn(user);
    ensureGuestSession.mockResolvedValue(user);
    joinMock.mockResolvedValue(undefined);

    render(<PartyInviteLanding partyId={PARTY_ID} />);

    await waitFor(() => expect(joinMock).toHaveBeenCalledTimes(1));
    expect(joinMock.mock.calls[0][4]).not.toHaveProperty('displayName');
    expect(joinMock.mock.calls[0][4]).not.toHaveProperty('lastInitial');
  });

  it('does not seat a returning guest twice', async () => {
    window.history.replaceState(null, '', `/party/${PARTY_ID}#t=${TOKEN}`);
    const user = { uid: 'guest-1', isAnonymous: true };
    signedIn(user);
    ensureGuestSession.mockResolvedValue(user);
    getDocMock.mockImplementation(async (ref) => {
      if (ref.path === `parties/${PARTY_ID}`) {
        return { exists: () => true, data: () => ({ title: 'Swap', adminId: 'h', status: 'LOBBY', participantCount: 2 }) };
      }
      if (ref.path === `parties/${PARTY_ID}/participants/guest-1`) return { exists: () => true, data: () => ({}) };
      return missing;
    });

    render(<PartyInviteLanding partyId={PARTY_ID} />);

    await waitFor(() => expect(ensureGuestSession).toHaveBeenCalled());
    expect(joinMock).not.toHaveBeenCalled();
    expect(await screen.findByText(GUEST_JOIN_COPY.welcomeTitle('Swap'))).toBeInTheDocument();
    expect(screen.queryByTestId('guest-card-skeleton')).toBeNull();
  });

  it('never makes a guest account for a link with no token, and shows link_invalid inline', async () => {
    window.history.replaceState(null, '', `/party/${PARTY_ID}?t=${TOKEN}`);

    render(<PartyInviteLanding partyId={PARTY_ID} />);

    expect(await screen.findByText(JOIN_ERROR_LINK_INVALID)).toBeInTheDocument();
    expect(ensureGuestSession).not.toHaveBeenCalled();
    expect(joinMock).not.toHaveBeenCalled();
    expect(window.alert).not.toHaveBeenCalled();
  });

  it('shows the started late-invite card for an ACTIVE party, with no guest account made', async () => {
    window.history.replaceState(null, '', `/party/${PARTY_ID}#t=${TOKEN}`);
    mockPartyReads({ title: 'Swap', adminId: 'host-uid-1', status: 'ACTIVE', participantCount: 4 });

    render(<PartyInviteLanding partyId={PARTY_ID} />);

    expect(await screen.findByRole('heading', { name: LATE_INVITE_COPY.gameAlreadyStartedHeading })).toBeInTheDocument();
    expect(screen.getByText(LATE_INVITE_COPY.gameAlreadyStartedBody)).toBeInTheDocument();
    expect(screen.getByText(formatLatePartyLine('Swap', null))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: LATE_INVITE_COPY.lateGoHome })).toHaveAttribute('href', '/');
    expect(screen.getByRole('button', { name: LATE_INVITE_COPY.lateSignInLink })).toBeInTheDocument();
    expect(screen.queryByText(JOIN_ERROR_STARTED)).not.toBeInTheDocument();
    expect(screen.queryByText(GUEST_JOIN_COPY.welcomeTitle('Swap'))).not.toBeInTheDocument();
    expect(ensureGuestSession).not.toHaveBeenCalled();
    expect(joinMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: GUEST_JOIN_COPY.readyCta })).toBeNull();
  });

  it('shows the over late-invite card for an ENDED party, with no guest account made', async () => {
    window.history.replaceState(null, '', `/party/${PARTY_ID}#t=${TOKEN}`);
    mockPartyReads({
      title: 'Swap',
      adminId: 'host-uid-1',
      hostDisplayName: 'Dana',
      status: 'ENDED',
      participantCount: 4,
    });

    render(<PartyInviteLanding partyId={PARTY_ID} />);

    expect(await screen.findByRole('heading', { name: LATE_INVITE_COPY.gameAlreadyOverHeading })).toBeInTheDocument();
    expect(screen.getByText(LATE_INVITE_COPY.gameAlreadyOverBody)).toBeInTheDocument();
    expect(screen.getByText(formatLatePartyLine('Swap', 'Dana'))).toBeInTheDocument();
    expect(ensureGuestSession).not.toHaveBeenCalled();
    expect(joinMock).not.toHaveBeenCalled();
    expect(screen.queryByText(JOIN_ERROR_STARTED)).not.toBeInTheDocument();
  });

  it('swaps to the started late-invite card in place when a lobby join loses the race, with no alert', async () => {
    window.history.replaceState(null, '', `/party/${PARTY_ID}#t=${TOKEN}`);
    getDocMock.mockImplementation(async (ref) => {
      if (ref.path === `parties/${PARTY_ID}`) {
        const status = joinMock.mock.calls.length > 0 ? 'ACTIVE' : 'LOBBY';
        return {
          exists: () => true,
          data: () => ({ title: 'Swap', adminId: 'host-uid-1', hostDisplayName: 'Dana', status, participantCount: 4 }),
        };
      }
      return missing;
    });
    joinMock.mockRejectedValue(Object.assign(new Error('denied'), { code: 'permission-denied' }));

    render(<PartyInviteLanding partyId={PARTY_ID} />);

    expect(await screen.findByRole('heading', { name: LATE_INVITE_COPY.gameAlreadyStartedHeading })).toBeInTheDocument();
    expect(screen.queryByText(JOIN_ERROR_STARTED)).not.toBeInTheDocument();
    expect(window.alert).not.toHaveBeenCalled();
  });

  it('shows join.error.party_full when the seat write is refused at 30', async () => {
    window.history.replaceState(null, '', `/party/${PARTY_ID}#t=${TOKEN}`);
    getDocMock.mockImplementation(async (ref) => {
      if (ref.path === `parties/${PARTY_ID}`) {
        const count = getDocMock.mock.calls.filter(([r]) => r.path === ref.path).length > 1 ? 30 : 29;
        return { exists: () => true, data: () => ({ title: 'Swap', adminId: 'h', status: 'LOBBY', participantCount: count }) };
      }
      return missing;
    });
    joinMock.mockRejectedValue(Object.assign(new Error('denied'), { code: 'permission-denied' }));

    render(<PartyInviteLanding partyId={PARTY_ID} />);

    expect(await screen.findByText(JOIN_ERROR_PARTY_FULL)).toBeInTheDocument();
    expect(window.alert).not.toHaveBeenCalled();
  });

  it('shows join.error.link_invalid for a permission-denied join in an open lobby', async () => {
    window.history.replaceState(null, '', `/party/${PARTY_ID}#t=${TOKEN}`);
    joinMock.mockRejectedValue(Object.assign(new Error('denied'), { code: 'permission-denied' }));

    render(<PartyInviteLanding partyId={PARTY_ID} />);

    expect(await screen.findByText(JOIN_ERROR_LINK_INVALID)).toBeInTheDocument();
  });

  it('shows join.error.generic for unavailable (not link_invalid)', async () => {
    window.history.replaceState(null, '', `/party/${PARTY_ID}#t=${TOKEN}`);
    joinMock.mockRejectedValue(Object.assign(new Error('blip'), { code: 'unavailable' }));

    render(<PartyInviteLanding partyId={PARTY_ID} />);

    expect(await screen.findByText(JOIN_ERROR_GENERIC)).toBeInTheDocument();
  });

  it('shows join.error.generic when the guest session cannot be made', async () => {
    window.history.replaceState(null, '', `/party/${PARTY_ID}#t=${TOKEN}`);
    ensureGuestSession.mockRejectedValue(Object.assign(new Error('nope'), { code: 'auth/operation-not-allowed' }));

    render(<PartyInviteLanding partyId={PARTY_ID} />);

    expect(await screen.findByText(JOIN_ERROR_GENERIC)).toBeInTheDocument();
    expect(joinMock).not.toHaveBeenCalled();
  });

  it('refuses a signed-in visitor on a CANCELLED party with an invite token before any seat write', async () => {
    window.history.replaceState(null, '', `/party/${PARTY_ID}#t=${TOKEN}`);
    const user = { uid: 'guest-1', displayName: 'Alex Kim', email: 'alex.kim@example.com' };
    signedIn(user);
    ensureGuestSession.mockResolvedValue(user);
    mockPartyReads({ title: 'Swap', adminId: 'host-uid-1', hostDisplayName: 'Dana Host', status: 'CANCELLED', participantCount: 2 });

    render(<PartyInviteLanding partyId={PARTY_ID} />);

    expect(await screen.findByText(JOIN_ERROR_CANCELLED)).toBeInTheDocument();
    expect(ensureGuestSession).not.toHaveBeenCalled();
    expect(joinMock).not.toHaveBeenCalled();
    const seatReads = getDocMock.mock.calls.filter(
      ([ref]) => ref?.path === `parties/${PARTY_ID}/participants/guest-1`,
    );
    expect(seatReads).toEqual([]);
    expect(screen.queryByTestId('late-invite-card')).toBeNull();
    expect(window.alert).not.toHaveBeenCalled();
  });

  it('keeps the join card after a hung seat write, then offers a retry without a second write while the first is in flight', async () => {
    vi.useFakeTimers();
    window.history.replaceState(null, '', `/party/${PARTY_ID}#t=${TOKEN}`);
    joinMock.mockReturnValue(new Promise(() => {}));

    render(<PartyInviteLanding partyId={PARTY_ID} />);
    await act(async () => {
      for (let i = 0; i < 20 && joinMock.mock.calls.length === 0; i += 1) {
        await Promise.resolve();
      }
      // Let writeSeat arm withTimeout after joinPartyWithInviteToken returns.
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(joinMock).toHaveBeenCalledTimes(1);

    const name = screen.getByLabelText(GUEST_JOIN_COPY.nameLabel);
    fireEvent.change(name, { target: { value: 'Sam Lee' } });
    fireEvent.click(screen.getByRole('button', { name: GUEST_JOIN_COPY.giftManualToggle }));
    fireEvent.change(screen.getByLabelText(GUEST_JOIN_COPY.giftUrlLabel), { target: { value: 'https://example.com/socks' } });
    fireEvent.change(screen.getByLabelText(GUEST_JOIN_COPY.giftTitleLabel), { target: { value: 'Wool socks' } });
    expect(screen.getByText(GUEST_JOIN_COPY.readyLockedSeat)).toBeInTheDocument();
    const ready = screen.getByRole('button', { name: GUEST_JOIN_COPY.readyCta });
    expect(ready).toBeDisabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    });

    expect(screen.getByText(GUEST_JOIN_COPY.readySaveSlow)).toBeInTheDocument();
    expect(screen.queryByText(JOIN_ERROR_GENERIC)).toBeNull();
    expect(ready).toBeEnabled();
    fireEvent.click(ready);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(joinMock).toHaveBeenCalledTimes(1);
  });

  it('refuses a seat retry client-side when the party is no longer in the lobby', async () => {
    vi.useFakeTimers();
    window.history.replaceState(null, '', `/party/${PARTY_ID}#t=${TOKEN}`);
    const lobby = { title: 'Swap', adminId: 'host-uid-1', hostDisplayName: 'Dana Host', status: 'LOBBY', participantCount: 2 };
    mockPartyReads(lobby);
    joinMock.mockReturnValue(new Promise(() => {}));

    render(<PartyInviteLanding partyId={PARTY_ID} />);
    await act(async () => {
      for (let i = 0; i < 20 && joinMock.mock.calls.length === 0; i += 1) {
        await Promise.resolve();
      }
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(joinMock).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText(GUEST_JOIN_COPY.nameLabel), { target: { value: 'Sam Lee' } });
    fireEvent.click(screen.getByRole('button', { name: GUEST_JOIN_COPY.giftManualToggle }));
    fireEvent.change(screen.getByLabelText(GUEST_JOIN_COPY.giftUrlLabel), { target: { value: 'https://example.com/socks' } });
    fireEvent.change(screen.getByLabelText(GUEST_JOIN_COPY.giftTitleLabel), { target: { value: 'Wool socks' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    });
    mockPartyReads({ ...lobby, status: 'ACTIVE' });
    fireEvent.click(screen.getByRole('button', { name: GUEST_JOIN_COPY.readyCta }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(joinMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText(JOIN_ERROR_STARTED)).toBeInTheDocument();
  });

  it('times out a hung pre-seat session so Saving your spot does not sit forever', async () => {
    vi.useFakeTimers();
    window.history.replaceState(null, '', `/party/${PARTY_ID}#t=${TOKEN}`);
    ensureGuestSession.mockReturnValue(new Promise(() => {}));
    render(<PartyInviteLanding partyId={PARTY_ID} />);
    await act(async () => {
      for (let i = 0; i < 20; i += 1) {
        await Promise.resolve();
      }
    });
    fireEvent.change(screen.getByLabelText(GUEST_JOIN_COPY.nameLabel), { target: { value: 'Sam Lee' } });
    fireEvent.click(screen.getByRole('button', { name: GUEST_JOIN_COPY.giftManualToggle }));
    fireEvent.change(screen.getByLabelText(GUEST_JOIN_COPY.giftUrlLabel), { target: { value: 'https://example.com/socks' } });
    fireEvent.change(screen.getByLabelText(GUEST_JOIN_COPY.giftTitleLabel), { target: { value: 'Wool socks' } });
    expect(screen.getByText(GUEST_JOIN_COPY.readyLockedSeat)).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    });
    expect(screen.getByText(GUEST_JOIN_COPY.readySaveSlow)).toBeInTheDocument();
    expect(joinMock).not.toHaveBeenCalled();
    const ready = screen.getByRole('button', { name: GUEST_JOIN_COPY.readyCta });
    expect(ready).toBeEnabled();
  });

  it('continues to save the name, gift, and ready flag after a successful seat retry, in one tap', async () => {
    vi.useFakeTimers();
    window.history.replaceState(null, '', `/party/${PARTY_ID}#t=${TOKEN}`);
    let finishJoin;
    joinMock.mockReturnValue(new Promise((resolve) => { finishJoin = resolve; }));
    render(<PartyInviteLanding partyId={PARTY_ID} />);
    await act(async () => {
      for (let i = 0; i < 20 && joinMock.mock.calls.length === 0; i += 1) {
        await Promise.resolve();
      }
      await Promise.resolve();
      await Promise.resolve();
    });
    fireEvent.change(screen.getByLabelText(GUEST_JOIN_COPY.nameLabel), { target: { value: 'Sam Lee' } });
    fireEvent.click(screen.getByRole('button', { name: GUEST_JOIN_COPY.giftManualToggle }));
    fireEvent.change(screen.getByLabelText(GUEST_JOIN_COPY.giftUrlLabel), { target: { value: 'https://example.com/socks' } });
    fireEvent.change(screen.getByLabelText(GUEST_JOIN_COPY.giftTitleLabel), { target: { value: 'Wool socks' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    });
    expect(screen.getByText(GUEST_JOIN_COPY.readySaveSlow)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: GUEST_JOIN_COPY.readyCta }));
    await act(async () => {
      finishJoin({ id: 'anon-1' });
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
    });
    expect(addDocMock).toHaveBeenCalledTimes(1);
    expect(updateDocMock).toHaveBeenCalledWith(
      { path: `parties/${PARTY_ID}/participants/anon-1` },
      expect.objectContaining({ ready: true, displayName: 'Sam', lastInitial: 'L' }),
    );
  });
});
