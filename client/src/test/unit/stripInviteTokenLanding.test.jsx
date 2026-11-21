/**
 * G19 regression: after a successful join, or when an already-seated member
 * opens a #t= link, the invite fragment is stripped with replaceState.
 * Keep the path and query. Do not add a history entry, reload, or navigate.
 * Do not strip before the token has been read and the join has succeeded or
 * the visitor is confirmed seated. These assertions fail on main.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { readInviteTokenFromHash } from '../../utils/partyInvite.js';
import { PartyInviteLanding } from '../../components/PartyInviteLanding.jsx';
import { Party } from '../../pages/Party.jsx';
import {
  JOIN_ERROR_GENERIC,
  JOIN_ERROR_LINK_INVALID,
} from '../../utils/partyInviteCopy.js';
import { GUEST_JOIN_COPY } from '../../utils/guestJoinCopy.js';
import { clearGuestJoinDrafts } from '../../components/GuestJoinCard.jsx';
import { REQUEST_TIMEOUT_MS } from '../../utils/withTimeout.js';

const PARTY_ID = 'invite-join-party';
const TOKEN = 'feedfacefeedfacefeedfacefeedface';

const useAuthMock = vi.fn();
const usePartyMock = vi.fn();
const joinMock = vi.fn();
const getDocMock = vi.fn();
const ensureGuestSession = vi.fn();
const authState = vi.hoisted(() => ({ currentUser: null }));

vi.mock('../../hooks/useAuth.js', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('../../hooks/useParty.js', () => ({
  useParty: (...args) => usePartyMock(...args),
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
  addDoc: vi.fn(),
  collection: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
}));

vi.mock('../../utils/partyInvite.js', async (importOriginal) => ({
  ...(await importOriginal()),
  joinPartyWithInviteToken: (...args) => joinMock(...args),
}));

vi.mock('../../components/SEO.jsx', () => ({
  SEO: () => null,
}));

vi.mock('../../components/PartyLobby.jsx', () => ({
  PartyLobby: () => <div data-testid="party-lobby">Lobby</div>,
}));

vi.mock('../../pages/GameRoom.jsx', () => ({
  GameRoom: () => <div data-testid="game-room">Game</div>,
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
  useAuthMock.mockReturnValue({ user: null, loading: false, ensureGuestSession });
}

function signedIn(user) {
  authState.currentUser = user;
  useAuthMock.mockReturnValue({ user, loading: false, ensureGuestSession });
}

function address() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

describe('PartyInviteLanding strips #t= only after a successful seat', () => {
  beforeEach(() => {
    joinMock.mockReset();
    getDocMock.mockReset();
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

  it('leaves #t= in the address bar until the join has succeeded', async () => {
    window.history.replaceState(null, '', `/party/${PARTY_ID}#t=${TOKEN}`);
    joinMock.mockReturnValue(new Promise(() => {}));

    render(<PartyInviteLanding partyId={PARTY_ID} />);

    expect(await screen.findByLabelText(GUEST_JOIN_COPY.nameLabel)).toBeInTheDocument();
    expect(readInviteTokenFromHash(window.location.hash)).toBe(TOKEN);
    expect(address()).toBe(`/party/${PARTY_ID}#t=${TOKEN}`);
  });

  it('strips #t= with replaceState after a successful join, keeping path and query', async () => {
    window.history.replaceState({ from: 'invite' }, '', `/party/${PARTY_ID}?src=link#t=${TOKEN}`);
    const replaceSpy = vi.spyOn(window.history, 'replaceState');
    const pushSpy = vi.spyOn(window.history, 'pushState');
    joinMock.mockResolvedValue(undefined);

    render(<PartyInviteLanding partyId={PARTY_ID} />);

    await waitFor(() => expect(joinMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(readInviteTokenFromHash(window.location.hash)).toBeNull());
    expect(window.location.pathname).toBe(`/party/${PARTY_ID}`);
    expect(window.location.search).toBe('?src=link');
    expect(window.location.hash).toBe('');
    expect(replaceSpy).toHaveBeenCalledWith(expect.anything(), '', `/party/${PARTY_ID}?src=link`);
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it('strips #t= when an already-seated member opens the invite link', async () => {
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
    await waitFor(() => expect(readInviteTokenFromHash(window.location.hash)).toBeNull());
    expect(joinMock).not.toHaveBeenCalled();
    expect(address()).toBe(`/party/${PARTY_ID}`);
  });

  it('keeps #t= when the join fails', async () => {
    window.history.replaceState(null, '', `/party/${PARTY_ID}#t=${TOKEN}`);
    joinMock.mockRejectedValue(Object.assign(new Error('denied'), { code: 'permission-denied' }));

    render(<PartyInviteLanding partyId={PARTY_ID} />);

    expect(await screen.findByText(JOIN_ERROR_LINK_INVALID)).toBeInTheDocument();
    expect(readInviteTokenFromHash(window.location.hash)).toBe(TOKEN);
    expect(address()).toBe(`/party/${PARTY_ID}#t=${TOKEN}`);
  });

  it('keeps #t= when the guest session cannot be made', async () => {
    window.history.replaceState(null, '', `/party/${PARTY_ID}#t=${TOKEN}`);
    ensureGuestSession.mockRejectedValue(Object.assign(new Error('nope'), { code: 'auth/operation-not-allowed' }));

    render(<PartyInviteLanding partyId={PARTY_ID} />);

    expect(await screen.findByText(JOIN_ERROR_GENERIC)).toBeInTheDocument();
    expect(readInviteTokenFromHash(window.location.hash)).toBe(TOKEN);
  });

  // PR 130 behaviors kept after the G19 rebase onto main.
  function signedInWithParty(status, { seated }) {
    const user = { uid: 'guest-1', isAnonymous: false, displayName: 'Alex Kim', email: null };
    signedIn(user);
    ensureGuestSession.mockResolvedValue(user);
    getDocMock.mockImplementation(async (ref) => {
      if (ref.path === `parties/${PARTY_ID}`) {
        return { exists: () => true, data: () => ({ title: 'Swap', adminId: 'h', status, participantCount: 2 }) };
      }
      if (ref.path === `parties/${PARTY_ID}/participants/guest-1`) {
        return seated ? { exists: () => true, data: () => ({}) } : missing;
      }
      return missing;
    });
  }

  it('keeps #t= and writes nothing for a signed-in visitor to a CANCELLED party', async () => {
    window.history.replaceState(null, '', `/party/${PARTY_ID}#t=${TOKEN}`);
    signedInWithParty('CANCELLED', { seated: false });

    render(<PartyInviteLanding partyId={PARTY_ID} />);

    await waitFor(() => expect(getDocMock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(ensureGuestSession).not.toHaveBeenCalled();
    expect(joinMock).not.toHaveBeenCalled();
    expect(address()).toBe(`/party/${PARTY_ID}#t=${TOKEN}`);
  });

  it('shows the late card and keeps #t= for a signed-in visitor with no seat in an ACTIVE party', async () => {
    window.history.replaceState(null, '', `/party/${PARTY_ID}#t=${TOKEN}`);
    signedInWithParty('ACTIVE', { seated: false });

    render(<PartyInviteLanding partyId={PARTY_ID} />);

    expect(await screen.findByTestId('late-invite-card')).toBeInTheDocument();
    expect(joinMock).not.toHaveBeenCalled();
    expect(address()).toBe(`/party/${PARTY_ID}#t=${TOKEN}`);
  });

  it('strips #t= and never shows the late card for a seated player returning to an ACTIVE party', async () => {
    window.history.replaceState(null, '', `/party/${PARTY_ID}#t=${TOKEN}`);
    signedInWithParty('ACTIVE', { seated: true });

    render(<PartyInviteLanding partyId={PARTY_ID} />);

    await waitFor(() => expect(readInviteTokenFromHash(window.location.hash)).toBeNull());
    expect(screen.queryByTestId('late-invite-card')).toBeNull();
    expect(joinMock).not.toHaveBeenCalled();
    expect(address()).toBe(`/party/${PARTY_ID}`);
  });

  it('does not strip #t= after a hung seat write times out', async () => {
    vi.useFakeTimers();
    window.history.replaceState(null, '', `/party/${PARTY_ID}?src=link#t=${TOKEN}`);
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
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    });
    expect(readInviteTokenFromHash(window.location.hash)).toBe(TOKEN);
    expect(address()).toBe(`/party/${PARTY_ID}?src=link#t=${TOKEN}`);
  });

  it('strips #t= after a successful seat retry, keeping path and query', async () => {
    vi.useFakeTimers();
    window.history.replaceState({ from: 'invite' }, '', `/party/${PARTY_ID}?src=link#t=${TOKEN}`);
    const replaceSpy = vi.spyOn(window.history, 'replaceState');
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
    expect(readInviteTokenFromHash(window.location.hash)).toBe(TOKEN);

    fireEvent.change(screen.getByLabelText(GUEST_JOIN_COPY.nameLabel), { target: { value: 'Sam Lee' } });
    fireEvent.click(screen.getByRole('button', { name: GUEST_JOIN_COPY.giftManualToggle }));
    fireEvent.change(screen.getByLabelText(GUEST_JOIN_COPY.giftUrlLabel), { target: { value: 'https://example.com/socks' } });
    fireEvent.change(screen.getByLabelText(GUEST_JOIN_COPY.giftTitleLabel), { target: { value: 'Wool socks' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    });
    expect(readInviteTokenFromHash(window.location.hash)).toBe(TOKEN);
    fireEvent.click(screen.getByRole('button', { name: GUEST_JOIN_COPY.readyCta }));
    await act(async () => {
      finishJoin({ id: 'anon-1' });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(readInviteTokenFromHash(window.location.hash)).toBeNull();
    expect(window.location.pathname).toBe(`/party/${PARTY_ID}`);
    expect(window.location.search).toBe('?src=link');
    expect(window.location.hash).toBe('');
    expect(replaceSpy).toHaveBeenCalledWith(expect.anything(), '', `/party/${PARTY_ID}?src=link`);
  });
});

describe('Party strips #t= for an already-seated member', () => {
  const user = { uid: 'guest-1', isAnonymous: true };

  beforeEach(() => {
    useAuthMock.mockReset();
    usePartyMock.mockReset();
    signedIn(user);
  });

  afterEach(() => {
    clearGuestJoinDrafts();
    window.history.replaceState(null, '', '/');
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function renderParty() {
    return render(
      <MemoryRouter initialEntries={[`/party/${PARTY_ID}`]}>
        <Routes>
          <Route path="/party/:partyId" element={<Party />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('strips the fragment once the visitor is confirmed seated, without a new history entry', async () => {
    window.history.replaceState({ from: 'invite' }, '', `/party/${PARTY_ID}#t=${TOKEN}`);
    const replaceSpy = vi.spyOn(window.history, 'replaceState');
    const pushSpy = vi.spyOn(window.history, 'pushState');
    usePartyMock.mockReturnValue({
      party: { id: PARTY_ID, title: 'Swap', status: 'LOBBY', adminId: 'h' },
      participants: [{ id: 'guest-1', displayName: 'Alex' }],
      loading: false,
      error: null,
    });

    renderParty();

    await waitFor(() => expect(screen.getByTestId('party-lobby')).toBeInTheDocument());
    await waitFor(() => expect(readInviteTokenFromHash(window.location.hash)).toBeNull());
    expect(window.location.pathname).toBe(`/party/${PARTY_ID}`);
    expect(replaceSpy).toHaveBeenCalledWith(expect.anything(), '', `/party/${PARTY_ID}`);
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it('does not strip #t= before the visitor is confirmed seated', async () => {
    window.history.replaceState(null, '', `/party/${PARTY_ID}#t=${TOKEN}`);
    signedOut();
    ensureGuestSession.mockResolvedValue({ uid: 'anon-1', isAnonymous: true, displayName: null, email: null });
    joinMock.mockReturnValue(new Promise(() => {}));
    mockPartyReads({ title: 'Swap', adminId: 'h', status: 'LOBBY', participantCount: 1 });
    usePartyMock.mockReturnValue({
      party: { id: PARTY_ID, title: 'Swap', status: 'LOBBY', adminId: 'h' },
      participants: [],
      loading: false,
      error: null,
    });

    renderParty();

    expect(await screen.findByLabelText(GUEST_JOIN_COPY.nameLabel)).toBeInTheDocument();
    expect(readInviteTokenFromHash(window.location.hash)).toBe(TOKEN);
    expect(address()).toBe(`/party/${PARTY_ID}#t=${TOKEN}`);
  });

  function activeGameWithLaggingList(seated) {
    usePartyMock.mockReturnValue({
      party: { id: PARTY_ID, title: 'Swap', status: 'ACTIVE', adminId: 'h' },
      participants: [],
      loading: false,
      error: null,
    });
    getDocMock.mockImplementation(async (ref) => {
      if (ref.path === `parties/${PARTY_ID}/participants/guest-1`) {
        return seated ? { exists: () => true, data: () => ({}) } : missing;
      }
      return missing;
    });
  }

  it('strips #t= in an ACTIVE game when the list is empty but the own-seat read finds the seat', async () => {
    window.history.replaceState({ from: 'invite' }, '', `/party/${PARTY_ID}#t=${TOKEN}`);
    const replaceSpy = vi.spyOn(window.history, 'replaceState');
    const pushSpy = vi.spyOn(window.history, 'pushState');
    activeGameWithLaggingList(true);

    renderParty();

    expect(await screen.findByTestId('game-room')).toBeInTheDocument();
    await waitFor(() => expect(readInviteTokenFromHash(window.location.hash)).toBeNull());
    expect(replaceSpy).toHaveBeenCalledWith(expect.anything(), '', `/party/${PARTY_ID}`);
    expect(pushSpy).not.toHaveBeenCalled();
    expect(screen.queryByTestId('late-invite-card')).toBeNull();
  });

  it('keeps #t= in an ACTIVE game when the own-seat read finds no seat', async () => {
    window.history.replaceState(null, '', `/party/${PARTY_ID}#t=${TOKEN}`);
    activeGameWithLaggingList(false);

    renderParty();

    expect(await screen.findByTestId('late-invite-card')).toBeInTheDocument();
    expect(address()).toBe(`/party/${PARTY_ID}#t=${TOKEN}`);
  });
});
