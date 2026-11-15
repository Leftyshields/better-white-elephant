/**
 * Invite requests must not send the host email local-part as hostName.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PartyLobby } from '../../components/PartyLobby.jsx';
import { pickHostNameForInvite } from '../../../../server/lib/display-names.js';

const HOST_UID = 'invite-host-uid1234';
const PARTY_ID = 'invite-privacy-party';

const useAuthMock = vi.fn();
const usePartyMock = vi.fn();
const fetchMock = vi.fn();

vi.mock('../../hooks/useAuth.js', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('../../hooks/useParty.js', () => ({
  useParty: (partyId) => usePartyMock(partyId),
}));

vi.mock('../../hooks/useGameSocket.js', () => ({
  useGameSocket: () => ({ socket: null }),
}));

vi.mock('../../components/PartyManagement.jsx', () => ({
  PartyManagement: () => null,
}));

vi.mock('../../components/dev/SimulationControls.jsx', () => ({
  SimulationControls: () => null,
}));

vi.mock('../../utils/analytics.js', () => ({
  trackSubmitGift: vi.fn(),
  trackStartGame: vi.fn(),
  trackInviteSent: vi.fn(),
  trackParticipantJoin: vi.fn(),
  trackError: vi.fn(),
  trackGameAbandoned: vi.fn(),
}));

vi.mock('../../utils/api.js', () => ({
  apiRequest: vi.fn().mockResolvedValue({ users: {} }),
  scrapeGiftUrl: vi.fn(),
}));

vi.mock('../../utils/firebase.js', () => ({
  db: {},
}));

vi.mock('firebase/firestore', () => {
  const emptyDoc = { exists: false, data: () => ({}) };
  return {
    collection: vi.fn(),
    doc: vi.fn(() => ({
      get: vi.fn().mockResolvedValue(emptyDoc),
      set: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    })),
    setDoc: vi.fn().mockResolvedValue(undefined),
    updateDoc: vi.fn().mockResolvedValue(undefined),
    addDoc: vi.fn().mockResolvedValue(undefined),
    getDoc: vi.fn().mockResolvedValue(emptyDoc),
    deleteDoc: vi.fn().mockResolvedValue(undefined),
    query: vi.fn(),
    where: vi.fn(),
    getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  };
});

describe('PartyLobby invite hostName payload', () => {
  beforeEach(() => {
    vi.stubGlobal('alert', vi.fn());
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });

    useAuthMock.mockReturnValue({
      user: {
        uid: HOST_UID,
        displayName: '',
        email: 'shouldnot.leak@example.com',
        getIdToken: vi.fn(),
      },
    });
    usePartyMock.mockReturnValue({
      party: {
        id: PARTY_ID,
        adminId: HOST_UID,
        status: 'LOBBY',
        title: 'Test Party',
        config: { maxSteals: 3 },
        date: { toDate: () => new Date('2026-12-01') },
      },
      participants: [{ id: HOST_UID, status: 'GOING', ready: false }],
      pendingInvites: [],
      gifts: [],
      loading: false,
      error: null,
    });
  });

  it('sends a non-email-local hostName when resending a failed invite', async () => {
    usePartyMock.mockReturnValue({
      party: {
        id: PARTY_ID,
        adminId: HOST_UID,
        status: 'LOBBY',
        title: 'Test Party',
        config: { maxSteals: 3 },
        date: { toDate: () => new Date('2026-12-01') },
      },
      participants: [{ id: HOST_UID, status: 'GOING', ready: false }],
      pendingInvites: [
        {
          id: 'guest_example_com',
          email: 'guest@example.com',
          status: 'GOING',
          emailFailed: true,
        },
      ],
      gifts: [],
      loading: false,
      error: null,
    });

    render(<PartyLobby partyId={PARTY_ID} onStartGame={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Add participants/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Resend Email/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Resend Email/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const [, requestInit] = fetchMock.mock.calls[0];
    const body = JSON.parse(requestInit.body);
    expect(body.hostName).not.toBe('shouldnot.leak');
    expect(body.hostName).toBe(
      pickHostNameForInvite(HOST_UID, '', 'shouldnot.leak@example.com'),
    );
  });
});