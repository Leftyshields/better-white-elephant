/**
 * Invite landing reads hostDisplayName from the party document only (no user profile).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PartyInviteLanding } from '../../components/PartyInviteLanding.jsx';

const PARTY_ID = 'invite-landing-party';

const useAuthMock = vi.fn();
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
  db: {},
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, ...path) => ({ path: path.join('/') })),
  getDoc: (...args) => getDocMock(...args),
  setDoc: vi.fn(),
}));

describe('PartyInviteLanding host name', () => {
  beforeEach(() => {
    getDocMock.mockReset();
    useAuthMock.mockReturnValue({
      user: null,
      signInWithGoogle: vi.fn(),
      loading: false,
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
      expect(screen.getByText('Jessica Host')).toBeInTheDocument();
    });
    expect(getDocMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to Party Host when hostDisplayName is a synthetic Player fallback', async () => {
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
      expect(screen.getByText('Party Host')).toBeInTheDocument();
    });
  });

  it('falls back to Party Host when hostDisplayName is missing', async () => {
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
      expect(screen.getByText('Party Host')).toBeInTheDocument();
    });
    expect(getDocMock).toHaveBeenCalledTimes(1);
  });
});