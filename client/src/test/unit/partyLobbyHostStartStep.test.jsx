/**
 * Regression: host "All participants ready" setup step must not show complete early.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PartyLobby } from '../../components/PartyLobby.jsx';
import lobbySetupStrings from '../../copy/lobbySetupStrings.js';

const HOST_UID = 'host-uid';
const GUEST_UID = 'guest-uid';
const PARTY_ID = 'party-ready-step';

const useAuthMock = vi.fn();
const usePartyMock = vi.fn();
const apiRequestMock = vi.fn();

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
  PartyManagement: () => <div data-testid="party-management-stub" />,
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
  apiRequest: (...args) => apiRequestMock(...args),
  scrapeGiftUrl: vi.fn(),
}));

vi.mock('../../utils/firebase.js', () => ({
  db: {},
}));

vi.mock('firebase/firestore', () => {
  const adminUserDoc = {
    exists: () => true,
    data: () => ({
      shippingAddress: { street: '1 Main St', city: 'Town' },
    }),
  };
  const emptyDoc = { exists: () => false, data: () => ({}) };
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
    getDoc: vi.fn().mockResolvedValue(adminUserDoc),
    deleteDoc: vi.fn().mockResolvedValue(undefined),
    query: vi.fn(),
    where: vi.fn(),
    getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  };
});

describe('PartyLobby host start step checklist', () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({
      user: { uid: HOST_UID, displayName: 'Host', getIdToken: vi.fn() },
    });
    usePartyMock.mockReturnValue({
      party: {
        id: PARTY_ID,
        adminId: HOST_UID,
        status: 'LOBBY',
        title: 'Holiday Swap',
        config: { maxSteals: 3 },
        date: { toDate: () => new Date('2026-12-01') },
      },
      participants: [
        { id: HOST_UID, status: 'GOING', ready: false },
        { id: GUEST_UID, status: 'GOING', ready: false },
      ],
      pendingInvites: [],
      gifts: [
        { id: 'g-host', submitterId: HOST_UID },
        { id: 'g-guest', submitterId: GUEST_UID },
      ],
      loading: false,
      error: null,
    });
    apiRequestMock.mockResolvedValue({
      users: { [GUEST_UID]: 'Guest Player' },
      bots: {},
    });
  });

  it('does not mark the ready step complete while a guest is not ready', async () => {
    render(<PartyLobby partyId={PARTY_ID} onStartGame={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('All participants ready')).toBeInTheDocument();
    });

    const readyStepButton = screen.getByRole('button', { name: /All participants ready/i });
    expect(readyStepButton).toHaveTextContent('4');
    expect(readyStepButton).not.toHaveTextContent('✓');
  });

  it('shows live count in the open start step', async () => {
    render(<PartyLobby partyId={PARTY_ID} onStartGame={vi.fn()} />);

    await waitFor(
      () => {
        expect(screen.getAllByText(/1 of 2 ready/).length).toBeGreaterThan(0);
      },
      { timeout: 3000 },
    );
    const startButtons = screen.getAllByRole('button', {
      name: lobbySetupStrings['host.start.cta'],
    });
    expect(startButtons.some((button) => button.disabled)).toBe(true);
  });
});