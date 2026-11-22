/**
 * G28: a guest the host removed sees Copywriter's removed message, but only when the server has
 * their removal marker. A real dead link, a failed read or a stranger keeps today's message.
 * The late card names the host with the server-written roster label when it is valid.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PartyInviteLanding, hostNameForLateCard } from '../../components/PartyInviteLanding.jsx';
import { formatLatePartyLine } from '../../utils/lateInvite.js';
import { JOIN_ERROR_LINK_INVALID, PARTY_INVITE_COPY } from '../../utils/partyInviteCopy.js';
import { GUEST_JOIN_COPY } from '../../utils/guestJoinCopy.js';

const PARTY_ID = 'g28-party';
const useAuthMock = vi.fn();
const getDocMock = vi.fn();
const ensureGuestSession = vi.fn();
const joinMock = vi.fn();
const authState = vi.hoisted(() => ({ currentUser: null }));

vi.mock('../../hooks/useAuth.js', () => ({ useAuth: () => useAuthMock() }));
vi.mock('../../utils/analytics.js', () => ({
  trackParticipantJoin: vi.fn(),
  trackError: vi.fn(),
  trackSubmitGift: vi.fn(),
}));
vi.mock('../../utils/firebase.js', () => ({ db: { name: 'test-db' }, auth: authState }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, ...path) => ({ path: path.join('/') })),
  getDoc: (...args) => getDocMock(...args),
  addDoc: vi.fn(),
  collection: vi.fn(),
  increment: vi.fn(),
  serverTimestamp: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  writeBatch: vi.fn(),
}));
vi.mock('../../utils/partyInvite.js', async (importOriginal) => ({
  ...(await importOriginal()),
  joinPartyWithInviteToken: (...args) => joinMock(...args),
}));

const REMOVED_TITLE = 'Your host removed you from this party.';
const REMOVED_BODY = 'If that was a mistake, ask your host to invite you again.';
const missing = { exists: () => false, data: () => undefined };
const guest = { uid: 'guest-1', isAnonymous: true, providerData: [] };
const lobbyParty = { title: 'Office Swap', adminId: 'host-1', hostDisplayName: 'Dana Reyes', status: 'LOBBY', participantCount: 3 };
const SEAT_PATH = `parties/${PARTY_ID}/participants/guest-1`;
const MARKER_PATH = `parties/${PARTY_ID}/removedSeats/guest-1`;

function signedIn(user) {
  authState.currentUser = user;
  useAuthMock.mockReturnValue({ user, loading: false, ensureGuestSession });
  ensureGuestSession.mockResolvedValue(user);
}

function reads({ party = lobbyParty, marker }) {
  getDocMock.mockImplementation(async (ref) => {
    if (ref.path === `parties/${PARTY_ID}`) return { exists: () => true, data: () => party };
    if (ref.path === SEAT_PATH) return missing;
    if (ref.path === MARKER_PATH) {
      if (marker instanceof Error) throw marker;
      return marker ? { exists: () => true, data: () => ({ removedAt: {} }) } : missing;
    }
    return missing;
  });
}

beforeEach(() => {
  joinMock.mockReset();
  getDocMock.mockReset();
  ensureGuestSession.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
});

describe('G28 removed guest', () => {
  it('uses Copywriter\'s final strings verbatim', () => {
    expect(PARTY_INVITE_COPY.inviteRemovedTitle).toBe(REMOVED_TITLE);
    expect(PARTY_INVITE_COPY.inviteRemovedBody).toBe(REMOVED_BODY);
  });

  it('shows the removed title and body when the server has this guest\'s removal marker', async () => {
    signedIn(guest);
    reads({ marker: true });

    render(<PartyInviteLanding partyId={PARTY_ID} />);

    expect(await screen.findByRole('heading', { name: REMOVED_TITLE })).toBeInTheDocument();
    expect(screen.getByText(REMOVED_BODY)).toBeInTheDocument();
    expect(screen.queryByText(GUEST_JOIN_COPY.welcomeTitle('Office Swap'))).toBeNull();
    expect(screen.queryByText(JOIN_ERROR_LINK_INVALID)).toBeNull();
    expect(screen.getByRole('link', { name: GUEST_JOIN_COPY.goHome })).toBeInTheDocument();
    expect(getDocMock.mock.calls.map((c) => c[0].path)).toContain(MARKER_PATH);
    expect(joinMock).not.toHaveBeenCalled();
  });

  it('keeps today\'s dead-link message when there is no marker (never seated, or a stale link)', async () => {
    signedIn(guest);
    reads({ marker: false });

    render(<PartyInviteLanding partyId={PARTY_ID} />);

    expect(await screen.findByText(JOIN_ERROR_LINK_INVALID)).toBeInTheDocument();
    expect(screen.queryByText(REMOVED_TITLE)).toBeNull();
    expect(screen.queryByText(REMOVED_BODY)).toBeNull();
  });

  it('keeps today\'s message when the marker read fails (denied or unavailable), never guessing "removed"', async () => {
    for (const code of ['permission-denied', 'unavailable']) {
      signedIn(guest);
      reads({ marker: Object.assign(new Error(code), { code }) });
      const { unmount } = render(<PartyInviteLanding partyId={PARTY_ID} />);
      expect(await screen.findByText(JOIN_ERROR_LINK_INVALID)).toBeInTheDocument();
      expect(screen.queryByText(REMOVED_TITLE)).toBeNull();
      unmount();
    }
  });

  it('with a new invite link, a removed guest still joins (the marker is not read)', async () => {
    window.history.replaceState(null, '', `/party/${PARTY_ID}#t=feedfacefeedfacefeedfacefeedface`);
    signedIn(guest);
    reads({ marker: true });
    joinMock.mockResolvedValue(undefined);

    render(<PartyInviteLanding partyId={PARTY_ID} />);

    await waitFor(() => expect(screen.queryByTestId('guest-card-skeleton')).toBeNull());
    expect(screen.queryByText(REMOVED_TITLE)).toBeNull();
    expect(getDocMock.mock.calls.map((c) => c[0].path)).not.toContain(MARKER_PATH);
  });
});

describe('G28 late card host label', () => {
  it('uses the server roster label when valid and falls back to the first name otherwise', () => {
    expect(hostNameForLateCard({ adminId: 'host-1', hostDisplayName: 'Dana Reyes', hostRosterLabel: 'Dana R.' })).toBe('Dana R.');
    expect(hostNameForLateCard({ adminId: 'host-1', hostDisplayName: 'Dana Reyes', hostRosterLabel: 'Dana' })).toBe('Dana');
    expect(hostNameForLateCard({ adminId: 'host-1', hostDisplayName: 'Dana Reyes' })).toBe('Dana');
    for (const bad of ['', 'Dana R. (2)', 'dana@example.com', 'Dana r.', 42, null]) {
      expect(hostNameForLateCard({ adminId: 'host-1', hostDisplayName: 'Dana Reyes', hostRosterLabel: bad })).toBe('Dana');
    }
    expect(hostNameForLateCard({ hostDisplayName: 'Dana Reyes', hostRosterLabel: 'Dana R.' })).toBeNull();
  });

  it('ends the sentence once after an initial (no "Brian S..")', () => {
    expect(formatLatePartyLine('Office Swap', 'Dana R.')).toBe('This link is for Office Swap, hosted by Dana R.');
    expect(formatLatePartyLine('Office Swap', 'Dana')).toBe('This link is for Office Swap, hosted by Dana.');
    expect(formatLatePartyLine('Office Swap', null)).toBe('This link is for Office Swap.');
  });

  it('the landing late card shows the roster label', async () => {
    signedIn(guest);
    reads({ party: { ...lobbyParty, status: 'ACTIVE', hostRosterLabel: 'Dana R.' }, marker: false });

    render(<PartyInviteLanding partyId={PARTY_ID} />);

    expect(await screen.findByText('This link is for Office Swap, hosted by Dana R.')).toBeInTheDocument();
  });
});
