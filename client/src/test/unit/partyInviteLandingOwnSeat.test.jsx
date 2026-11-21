/**
 * MEDIUM: Party.jsx sends signed-in users to PartyInviteLanding when the
 * party read fails or comes back empty. The landing must not treat those
 * visitors as not seated. It should use the own-seat read and only show
 * the late card after that read confirms a missing seat.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PartyInviteLanding } from '../../components/PartyInviteLanding.jsx';
import { LATE_INVITE_COPY, formatLatePartyLine } from '../../utils/lateInvite.js';

const PARTY_ID = 'invite-join-party';
const useAuthMock = vi.fn();
const getDocMock = vi.fn();
const ensureGuestSession = vi.fn();
const joinMock = vi.fn();
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
const googleUser = { uid: 'user-1', displayName: 'Alex Kim', email: 'alex@example.com', providerData: [{ providerId: 'google.com' }] };
const activeParty = { title: 'Office Swap', adminId: 'host-1', hostDisplayName: 'Dana', status: 'ACTIVE', participantCount: 4 };

function signedIn(user) {
  authState.currentUser = user;
  useAuthMock.mockReturnValue({ user, loading: false, ensureGuestSession });
}

describe('PartyInviteLanding own-seat read for a signed-in visitor', () => {
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

  it('does not show the late card to a signed-in seated player when the landing is shown after a failed or empty party list', async () => {
    signedIn(googleUser);
    ensureGuestSession.mockResolvedValue(googleUser);
    let resolveSeat;
    const seatPromise = new Promise((resolve) => {
      resolveSeat = resolve;
    });
    getDocMock.mockImplementation(async (ref) => {
      if (ref.path === `parties/${PARTY_ID}`) {
        return { exists: () => true, data: () => activeParty };
      }
      if (ref.path === `parties/${PARTY_ID}/participants/user-1`) {
        return seatPromise;
      }
      return missing;
    });

    render(<PartyInviteLanding partyId={PARTY_ID} />);

    await waitFor(() => {
      expect(getDocMock.mock.calls.some((c) => c[0]?.path === `parties/${PARTY_ID}`)).toBe(true);
    });
    expect(screen.queryByTestId('late-invite-card')).toBeNull();
    expect(screen.queryByRole('heading', { name: LATE_INVITE_COPY.gameAlreadyStartedHeading })).toBeNull();
    expect(screen.getByTestId('guest-card-skeleton')).toBeInTheDocument();

    resolveSeat({ exists: () => true, data: () => ({ displayName: 'Alex' }) });

    await waitFor(() => expect(ensureGuestSession).toHaveBeenCalled());
    expect(screen.queryByTestId('late-invite-card')).toBeNull();
    expect(screen.queryByRole('heading', { name: LATE_INVITE_COPY.gameAlreadyStartedHeading })).toBeNull();
    expect(joinMock).not.toHaveBeenCalled();
    expect(await screen.findByTestId('guest-card-skeleton')).toBeInTheDocument();
  });

  it('shows the late card only after the own-seat read confirms a signed-in visitor has no seat', async () => {
    signedIn(googleUser);
    ensureGuestSession.mockResolvedValue(googleUser);
    getDocMock.mockImplementation(async (ref) => {
      if (ref.path === `parties/${PARTY_ID}`) {
        return { exists: () => true, data: () => activeParty };
      }
      if (ref.path === `parties/${PARTY_ID}/participants/user-1`) {
        return missing;
      }
      return missing;
    });

    render(<PartyInviteLanding partyId={PARTY_ID} />);

    expect(await screen.findByTestId('late-invite-card')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: LATE_INVITE_COPY.gameAlreadyStartedHeading })).toBeInTheDocument();
    expect(screen.getByText(formatLatePartyLine('Office Swap', 'Dana'))).toBeInTheDocument();
    expect(joinMock).not.toHaveBeenCalled();
  });
});
