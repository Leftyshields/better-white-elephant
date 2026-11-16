/**
 * Invite landing joins with the token from the URL fragment (#t=...), never a query string.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PartyInviteLanding } from '../../components/PartyInviteLanding.jsx';

const PARTY_ID = 'invite-join-party';
const TOKEN = 'feedfacefeedfacefeedfacefeedface';

const useAuthMock = vi.fn();
const joinMock = vi.fn();

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
  getDoc: vi.fn(async (ref) =>
    ref.path === `parties/${PARTY_ID}`
      ? { exists: () => true, data: () => ({ title: 'Swap', adminId: 'host-uid-1' }) }
      : { exists: () => false, data: () => undefined },
  ),
}));

vi.mock('../../utils/partyInvite.js', async (importOriginal) => ({
  ...(await importOriginal()),
  joinPartyWithInviteToken: (...args) => joinMock(...args),
}));

describe('PartyInviteLanding join', () => {
  beforeEach(() => {
    joinMock.mockReset();
    window.sessionStorage.clear();
    vi.spyOn(window, 'alert').mockImplementation(() => {});
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
});
