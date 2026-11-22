/**
 * Regression for issue #28: add-person form stays open after each add; name field keeps focus.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PartyLobby } from '../../components/PartyLobby.jsx';

const HOST_UID = 'host-uid';
const PARTY_ID = 'party-add-player-test';

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
  postPartyCode: vi.fn().mockResolvedValue({ ok: true, status: 200, body: { code: 'KX7P4MRB', token: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' } }),
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

describe('Add person pane (issue #28)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

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
      participants: [{ id: HOST_UID, status: 'GOING', ready: false }],
      pendingInvites: [],
      gifts: [],
      loading: false,
      error: null,
    });
    apiRequestMock.mockResolvedValue({ users: {} });
  });

  it('keeps the add form open and refocuses the name field after adding a person', async () => {
    render(<PartyLobby partyId={PARTY_ID} onStartGame={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Add participants/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Add Person$/i }));

    const nameInput = screen.getByLabelText(/Name \(optional\)/i);
    const emailInput = screen.getByLabelText(/^Email$/i);

    fireEvent.change(nameInput, { target: { value: 'Alex' } });
    fireEvent.change(emailInput, { target: { value: 'alex@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /^Add$/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: /^Add Person$/i })).not.toBeInTheDocument();
    expect(nameInput).toHaveValue('');
    expect(emailInput).toHaveValue('');

    await waitFor(() => {
      expect(nameInput).toHaveFocus();
    });
  });
});