/**
 * Invite landing (batch 2 item 4): no sign-in screen, no join button, no alert(), no reload.
 * The guest gets a silent session and a background seat write with the #t= token while the
 * one-screen card is already on screen. Refusals show inline Copywriter strings.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PartyInviteLanding } from '../../components/PartyInviteLanding.jsx';
import {
  JOIN_ERROR_GENERIC,
  JOIN_ERROR_LINK_INVALID,
  JOIN_ERROR_PARTY_FULL,
  JOIN_ERROR_STARTED,
} from '../../utils/partyInviteCopy.js';
import { GUEST_JOIN_COPY } from '../../utils/guestJoinCopy.js';

const PARTY_ID = 'invite-join-party';
const TOKEN = 'feedfacefeedfacefeedfacefeedface';

const useAuthMock = vi.fn();
const joinMock = vi.fn();
const getDocMock = vi.fn();
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
  addDoc: vi.fn(),
  collection: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
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
  useAuthMock.mockReturnValue({ user: null, loading: false, ensureGuestSession });
}

function signedIn(user) {
  authState.currentUser = user;
  useAuthMock.mockReturnValue({ user, loading: false, ensureGuestSession });
}

describe('PartyInviteLanding join', () => {
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
    expect(screen.getByTestId('guest-card-skeleton')).toBeInTheDocument();
  });

  it('never makes a guest account for a link with no token, and shows link_invalid inline', async () => {
    window.history.replaceState(null, '', `/party/${PARTY_ID}?t=${TOKEN}`);

    render(<PartyInviteLanding partyId={PARTY_ID} />);

    expect(await screen.findByText(JOIN_ERROR_LINK_INVALID)).toBeInTheDocument();
    expect(ensureGuestSession).not.toHaveBeenCalled();
    expect(joinMock).not.toHaveBeenCalled();
    expect(window.alert).not.toHaveBeenCalled();
  });

  it('shows join.error.started for a party that left LOBBY, with no guest account made', async () => {
    window.history.replaceState(null, '', `/party/${PARTY_ID}#t=${TOKEN}`);
    mockPartyReads({ title: 'Swap', adminId: 'host-uid-1', status: 'ACTIVE', participantCount: 4 });

    render(<PartyInviteLanding partyId={PARTY_ID} />);

    expect(await screen.findByText(JOIN_ERROR_STARTED)).toBeInTheDocument();
    expect(ensureGuestSession).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: GUEST_JOIN_COPY.readyCta })).toBeNull();
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
});
