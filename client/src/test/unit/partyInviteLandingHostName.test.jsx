/**
 * Invite landing reads hostDisplayName from the party document only (no user profile).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PartyInviteLanding } from '../../components/PartyInviteLanding.jsx';
import { GUEST_JOIN_COPY } from '../../utils/guestJoinCopy.js';

const PARTY_ID = 'invite-landing-party';

const useAuthMock = vi.fn();
const getDocMock = vi.fn();

vi.mock('../../hooks/useAuth.js', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('../../utils/analytics.js', () => ({
  trackParticipantJoin: vi.fn(),
  trackError: vi.fn(),
  trackSubmitGift: vi.fn(),
}));

vi.mock('../../utils/firebase.js', () => ({
  db: {},
  auth: { currentUser: null },
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, ...path) => ({ path: path.join('/') })),
  getDoc: (...args) => getDocMock(...args),
  setDoc: vi.fn(),
  addDoc: vi.fn(),
  collection: vi.fn(),
  updateDoc: vi.fn(),
}));

describe('PartyInviteLanding host name', () => {
  beforeEach(() => {
    getDocMock.mockReset();
    useAuthMock.mockReturnValue({
      user: null,
      loading: false,
      ensureGuestSession: vi.fn(),
    });
  });

  it('shows hostDisplayName from the party document', async () => {
    getDocMock.mockImplementation(async (ref) => {
      if (ref.path === `parties/${PARTY_ID}`) {
        return {
          exists: () => true,
          data: () => ({
            title: 'Winter Swap',
            date: { toDate: () => new Date('2026-12-25') },
            adminId: 'host-uid-12345678',
            hostDisplayName: 'Jessica Host',
          }),
        };
      }
      throw new Error(`Unexpected getDoc path: ${ref.path}`);
    });

    render(<PartyInviteLanding partyId={PARTY_ID} />);

    await waitFor(() => {
      expect(screen.getByText(/^Jessica here\./)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Host/)).toBeNull();
    expect(getDocMock.mock.calls.filter(([ref]) => ref.path === `parties/${PARTY_ID}`)).toHaveLength(1);
  });

  it('falls back to copy when hostDisplayName is a synthetic Player fallback', async () => {
    getDocMock.mockResolvedValue({
      exists: () => true,
      data: () => ({
        title: 'Winter Swap',
        date: { toDate: () => new Date('2026-12-25') },
        adminId: 'host-uid-12345678',
        hostDisplayName: 'Player host-uid',
      }),
    });

    render(<PartyInviteLanding partyId={PARTY_ID} />);

    await waitFor(() => {
      expect(screen.getByText(GUEST_JOIN_COPY.welcomeBody(null))).toBeInTheDocument();
    });
  });

  it('falls back to copy when hostDisplayName is missing', async () => {
    getDocMock.mockResolvedValue({
      exists: () => true,
      data: () => ({
        title: 'Legacy Party',
        date: { toDate: () => new Date('2026-12-01') },
        adminId: 'legacy-host-uid',
      }),
    });

    render(<PartyInviteLanding partyId={PARTY_ID} />);

    await waitFor(() => {
      expect(screen.getByText(GUEST_JOIN_COPY.welcomeBody(null))).toBeInTheDocument();
    });
    expect(getDocMock.mock.calls.filter(([ref]) => ref.path === `parties/${PARTY_ID}`)).toHaveLength(1);
  });
});