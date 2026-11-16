/**
 * Invite landing joins with the token from the URL fragment (#t=...), never a query string.
 * Join refusals map from party doc state (read before joining) to Copywriter strings.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PartyInviteLanding } from '../../components/PartyInviteLanding.jsx';
import {
  JOIN_ERROR_GENERIC,
  JOIN_ERROR_LINK_INVALID,
  JOIN_ERROR_PARTY_FULL,
  JOIN_ERROR_STARTED,
} from '../../utils/partyInviteCopy.js';

const PARTY_ID = 'invite-join-party';
const TOKEN = 'feedfacefeedfacefeedfacefeedface';

const useAuthMock = vi.fn();
const joinMock = vi.fn();
const getDocMock = vi.fn();

vi.mock('../../hooks/useAuth.js', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('../../utils/analytics.js', () => ({
  trackParticipantJoin: vi.fn(),
  trackError: vi.fn(),
}));

vi.mock('../../components/Snowflakes.jsx', () => ({
  Snowflakes: () => null,
}));

vi.mock('../../utils/firebase.js', () => ({
  db: { name: 'test-db' },
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, ...path) => ({ path: path.join('/') })),
  getDoc: (...args) => getDocMock(...args),
}));

vi.mock('../../utils/partyInvite.js', async (importOriginal) => ({
  ...(await importOriginal()),
  joinPartyWithInviteToken: (...args) => joinMock(...args),
}));

function partyDoc(data) {
  return {
    exists: () => true,
    data: () => data,
  };
}

function mockPartyReads(partyData) {
  getDocMock.mockImplementation(async (ref) => {
    if (ref.path === `parties/${PARTY_ID}`) {
      return partyDoc(partyData);
    }
    return { exists: () => false, data: () => undefined };
  });
}

describe('PartyInviteLanding join', () => {
  beforeEach(() => {
    joinMock.mockReset();
    getDocMock.mockReset();
    window.sessionStorage.clear();
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    mockPartyReads({
      title: 'Swap',
      adminId: 'host-uid-1',
      status: 'LOBBY',
      participantCount: 2,
    });
  });

  afterEach(() => {
    window.history.replaceState(null, '', '/');
    vi.restoreAllMocks();
  });

  it('passes the #t= token to the join batch', async () => {
    window.history.replaceState(null, '', `/party/${PARTY_ID}#t=${TOKEN}`);
    useAuthMock.mockReturnValue({ user: { uid: 'guest-1' }, signInWithGoogle: vi.fn(), loading: false });
    joinMock.mockRejectedValue(Object.assign(new Error('stop before reload'), { code: 'test' }));

    render(<PartyInviteLanding partyId={PARTY_ID} />);
    fireEvent.click(await screen.findByRole('button', { name: /join this party/i }));

    await waitFor(() => expect(joinMock).toHaveBeenCalledTimes(1));
    expect(joinMock).toHaveBeenCalledWith(
      { name: 'test-db' },
      PARTY_ID,
      'guest-1',
      TOKEN,
      expect.objectContaining({ status: 'GOING', ready: false }),
    );
  });

  it('writes the Google first name and last initial onto the seat', async () => {
    window.history.replaceState(null, '', `/party/${PARTY_ID}#t=${TOKEN}`);
    useAuthMock.mockReturnValue({
      user: { uid: 'guest-1', displayName: 'Alex Kim', email: 'alex.kim@example.com' },
      signInWithGoogle: vi.fn(),
      loading: false,
    });
    joinMock.mockRejectedValue(Object.assign(new Error('stop before reload'), { code: 'test' }));

    render(<PartyInviteLanding partyId={PARTY_ID} />);
    fireEvent.click(await screen.findByRole('button', { name: /join this party/i }));

    await waitFor(() => expect(joinMock).toHaveBeenCalledTimes(1));
    expect(joinMock.mock.calls[0][4]).toMatchObject({ displayName: 'Alex', lastInitial: 'K' });
  });

  it('leaves the seat name off when the Google name is email-shaped', async () => {
    window.history.replaceState(null, '', `/party/${PARTY_ID}#t=${TOKEN}`);
    useAuthMock.mockReturnValue({
      user: { uid: 'guest-1', displayName: 'alex@example.com', email: 'alex@example.com' },
      signInWithGoogle: vi.fn(),
      loading: false,
    });
    joinMock.mockRejectedValue(Object.assign(new Error('stop before reload'), { code: 'test' }));

    render(<PartyInviteLanding partyId={PARTY_ID} />);
    fireEvent.click(await screen.findByRole('button', { name: /join this party/i }));

    await waitFor(() => expect(joinMock).toHaveBeenCalledTimes(1));
    expect(joinMock.mock.calls[0][4]).not.toHaveProperty('displayName');
    expect(joinMock.mock.calls[0][4]).not.toHaveProperty('lastInitial');
  });

  it('sends no token when the link has none (rules then refuse the join)', async () => {
    window.history.replaceState(null, '', `/party/${PARTY_ID}?t=${TOKEN}`);
    useAuthMock.mockReturnValue({ user: { uid: 'guest-1' }, signInWithGoogle: vi.fn(), loading: false });
    joinMock.mockRejectedValue(Object.assign(new Error('denied'), { code: 'permission-denied' }));

    render(<PartyInviteLanding partyId={PARTY_ID} />);
    fireEvent.click(await screen.findByRole('button', { name: /join this party/i }));

    await waitFor(() => expect(joinMock).toHaveBeenCalledTimes(1));
    expect(joinMock.mock.calls[0][3]).toBeNull();
  });

  it('keeps the #t= fragment in the post-sign-in redirect', async () => {
    window.history.replaceState(null, '', `/party/${PARTY_ID}#t=${TOKEN}`);
    const signInWithGoogle = vi.fn().mockResolvedValue({ success: false });
    useAuthMock.mockReturnValue({ user: null, signInWithGoogle, loading: false });

    render(<PartyInviteLanding partyId={PARTY_ID} />);
    fireEvent.click(await screen.findByRole('button', { name: /join this party/i }));

    await waitFor(() => expect(signInWithGoogle).toHaveBeenCalledTimes(1));
    expect(window.sessionStorage.getItem('redirectAfterAuth')).toBe(`/party/${PARTY_ID}#t=${TOKEN}`);
    expect(joinMock).not.toHaveBeenCalled();
  });

  it('alerts join.error.started when party status is not LOBBY', async () => {
    window.history.replaceState(null, '', `/party/${PARTY_ID}#t=${TOKEN}`);
    mockPartyReads({
      title: 'Swap',
      adminId: 'host-uid-1',
      status: 'ACTIVE',
      participantCount: 4,
    });
    useAuthMock.mockReturnValue({ user: { uid: 'guest-1' }, signInWithGoogle: vi.fn(), loading: false });
    joinMock.mockRejectedValue(Object.assign(new Error('denied'), { code: 'permission-denied' }));

    render(<PartyInviteLanding partyId={PARTY_ID} />);
    fireEvent.click(await screen.findByRole('button', { name: /join this party/i }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(JOIN_ERROR_STARTED));
  });

  it('alerts join.error.party_full when participantCount is 30', async () => {
    window.history.replaceState(null, '', `/party/${PARTY_ID}#t=${TOKEN}`);
    mockPartyReads({
      title: 'Swap',
      adminId: 'host-uid-1',
      status: 'LOBBY',
      participantCount: 30,
    });
    useAuthMock.mockReturnValue({ user: { uid: 'guest-1' }, signInWithGoogle: vi.fn(), loading: false });
    joinMock.mockRejectedValue(Object.assign(new Error('denied'), { code: 'permission-denied' }));

    render(<PartyInviteLanding partyId={PARTY_ID} />);
    fireEvent.click(await screen.findByRole('button', { name: /join this party/i }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(JOIN_ERROR_PARTY_FULL));
  });

  it('alerts join.error.link_invalid for a permission-denied join in an open lobby', async () => {
    window.history.replaceState(null, '', `/party/${PARTY_ID}#t=${TOKEN}`);
    mockPartyReads({
      title: 'Swap',
      adminId: 'host-uid-1',
      status: 'LOBBY',
      participantCount: 3,
    });
    useAuthMock.mockReturnValue({ user: { uid: 'guest-1' }, signInWithGoogle: vi.fn(), loading: false });
    joinMock.mockRejectedValue(Object.assign(new Error('denied'), { code: 'permission-denied' }));

    render(<PartyInviteLanding partyId={PARTY_ID} />);
    fireEvent.click(await screen.findByRole('button', { name: /join this party/i }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(JOIN_ERROR_LINK_INVALID));
  });

  it('alerts join.error.link_invalid when the URL fragment has no token', async () => {
    window.history.replaceState(null, '', `/party/${PARTY_ID}`);
    useAuthMock.mockReturnValue({ user: { uid: 'guest-1' }, signInWithGoogle: vi.fn(), loading: false });
    joinMock.mockRejectedValue(Object.assign(new Error('denied'), { code: 'permission-denied' }));

    render(<PartyInviteLanding partyId={PARTY_ID} />);
    fireEvent.click(await screen.findByRole('button', { name: /join this party/i }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(JOIN_ERROR_LINK_INVALID));
  });

  it('alerts join.error.generic for unavailable (not link_invalid)', async () => {
    window.history.replaceState(null, '', `/party/${PARTY_ID}#t=${TOKEN}`);
    useAuthMock.mockReturnValue({ user: { uid: 'guest-1' }, signInWithGoogle: vi.fn(), loading: false });
    joinMock.mockRejectedValue(Object.assign(new Error('blip'), { code: 'unavailable' }));

    render(<PartyInviteLanding partyId={PARTY_ID} />);
    fireEvent.click(await screen.findByRole('button', { name: /join this party/i }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(JOIN_ERROR_GENERIC));
  });

  it('alerts join.error.generic when the pre-join party read fails', async () => {
    window.history.replaceState(null, '', `/party/${PARTY_ID}#t=${TOKEN}`);
    let partyDocReads = 0;
    getDocMock.mockImplementation(async (ref) => {
      if (ref.path === `parties/${PARTY_ID}`) {
        partyDocReads += 1;
        // First call: landing info. Second: pre-join read in handleJoin — fail that one.
        if (partyDocReads === 1) {
          return partyDoc({
            title: 'Swap',
            adminId: 'host-uid-1',
            status: 'LOBBY',
            participantCount: 2,
          });
        }
        throw Object.assign(new Error('read failed'), { code: 'unavailable' });
      }
      return { exists: () => false, data: () => undefined };
    });
    useAuthMock.mockReturnValue({ user: { uid: 'guest-1' }, signInWithGoogle: vi.fn(), loading: false });

    render(<PartyInviteLanding partyId={PARTY_ID} />);
    fireEvent.click(await screen.findByRole('button', { name: /join this party/i }));

    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(JOIN_ERROR_GENERIC));
    expect(joinMock).not.toHaveBeenCalled();
  });
});
