/**
 * G19 regression: after a successful join, or when an already-seated member
 * opens a #t= link, the invite fragment is stripped with replaceState.
 * Keep the path and query. Do not add a history entry, reload, or navigate.
 * Do not strip before the token has been read and the join has succeeded or
 * the visitor is confirmed seated. These assertions fail on main.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { readInviteTokenFromHash } from '../../utils/partyInvite.js';
import { PartyInviteLanding } from '../../components/PartyInviteLanding.jsx';
import { Party } from '../../pages/Party.jsx';
import {
  JOIN_ERROR_GENERIC,
  JOIN_ERROR_LINK_INVALID,
} from '../../utils/partyInviteCopy.js';
import { GUEST_JOIN_COPY } from '../../utils/guestJoinCopy.js';

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
    window.history.replaceState(null, '', '/');
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
});

describe('Party strips #t= for an already-seated member', () => {
  const user = { uid: 'guest-1', isAnonymous: true };

  beforeEach(() => {
    useAuthMock.mockReset();
    usePartyMock.mockReset();
    signedIn(user);
  });

  afterEach(() => {
    window.history.replaceState(null, '', '/');
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
});
