/**
 * BUG-8: host lobby shows guests' seat names even when /api/users/batch fails.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PartyLobby } from '../../components/PartyLobby.jsx';

const HOST_UID = 'host-uid';
const PARTY_ID = 'party-seat-names';

const useAuthMock = vi.fn();
const usePartyMock = vi.fn();
const apiRequestMock = vi.fn();

vi.mock('../../hooks/useAuth.js', () => ({ useAuth: () => useAuthMock() }));
vi.mock('../../hooks/useParty.js', () => ({ useParty: (partyId) => usePartyMock(partyId) }));
vi.mock('../../hooks/useGameSocket.js', () => ({ useGameSocket: () => ({ socket: null }) }));
vi.mock('../../components/PartyManagement.jsx', () => ({ PartyManagement: () => null }));
vi.mock('../../components/dev/SimulationControls.jsx', () => ({ SimulationControls: () => null }));
vi.mock('../../utils/analytics.js', () => ({
  trackSubmitGift: vi.fn(),
  trackStartGame: vi.fn(),
  trackInviteSent: vi.fn(),
  trackParticipantJoin: vi.fn(),
  trackError: vi.fn(),
  trackGameAbandoned: vi.fn(),
}));
vi.mock('../../utils/api.js', () => ({
  apiRequest: (...args) => apiRequestMock(...args),
  scrapeGiftUrl: vi.fn(),
}));
vi.mock('../../utils/firebase.js', () => ({ db: {} }));
vi.mock('firebase/firestore', () => {
  const emptyDoc = { exists: () => false, data: () => ({}) };
  return {
    collection: vi.fn(),
    doc: vi.fn(() => ({})),
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

function renderLobby(participants) {
  usePartyMock.mockReturnValue({
    party: {
      id: PARTY_ID,
      adminId: HOST_UID,
      status: 'LOBBY',
      title: 'Holiday Swap',
      config: { maxSteals: 3 },
      date: { toDate: () => new Date('2026-12-01') },
    },
    participants,
    pendingInvites: [],
    gifts: [],
    loading: false,
    error: null,
  });
  render(<PartyLobby partyId={PARTY_ID} onStartGame={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /Add participants/i }));
}

describe('PartyLobby seat names', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    useAuthMock.mockReturnValue({ user: { uid: HOST_UID, displayName: 'Host', getIdToken: vi.fn() } });
    apiRequestMock.mockReset();
  });

  it('shows the seat first name when the batch API fails', async () => {
    apiRequestMock.mockRejectedValue(new Error('network'));
    renderLobby([
      { id: HOST_UID, status: 'GOING', ready: false },
      { id: 'YJiLkrOtGuest', status: 'GOING', ready: false, displayName: 'Alex' },
    ]);
    await waitFor(() => expect(apiRequestMock).toHaveBeenCalled());
    expect(screen.getAllByText('Alex').length).toBeGreaterThan(0);
    expect(screen.queryByText('Player YJiLkrOt')).not.toBeInTheDocument();
  });

  it('keeps the Player fallback when a seat has no usable name', async () => {
    apiRequestMock.mockRejectedValue(new Error('network'));
    renderLobby([
      { id: HOST_UID, status: 'GOING', ready: false },
      { id: 'NoNameGuest1', status: 'GOING', ready: false },
    ]);
    await waitFor(() => expect(screen.getAllByText('Player NoNameGu').length).toBeGreaterThan(0));
  });

  it('shows the last initial when two guests share a first name', async () => {
    apiRequestMock.mockResolvedValue({ users: {} });
    renderLobby([
      { id: HOST_UID, status: 'GOING', ready: false },
      { id: 'guest-a', status: 'GOING', ready: false, displayName: 'Sam', lastInitial: 'L' },
      { id: 'guest-b', status: 'GOING', ready: false, displayName: 'Sam', lastInitial: 'R' },
    ]);
    await waitFor(() => expect(screen.getAllByText('Sam L.').length).toBeGreaterThan(0));
    expect(screen.getAllByText('Sam R.').length).toBeGreaterThan(0);
  });
});
