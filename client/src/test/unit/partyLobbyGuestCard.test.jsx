/**
 * Guest lobby (batch 2 item 4): the one-screen card replaces the guest Setup Progress accordion
 * and the address-gated ready block. One ready control only; no shipping-address lock.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PartyLobby } from '../../components/PartyLobby.jsx';
import { GUEST_JOIN_COPY as COPY } from '../../utils/guestJoinCopy.js';

const HOST_UID = 'host-uid';
const GUEST_UID = 'anon-guest';
const PARTY_ID = 'party-guest-card';

const useAuthMock = vi.fn();
const usePartyMock = vi.fn();

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
  apiRequest: vi.fn().mockResolvedValue({}),
  scrapeGiftUrl: vi.fn(),
  postPartyCode: vi.fn().mockResolvedValue({ ok: false, status: 403, body: {} }),
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

describe('PartyLobby guest card', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    useAuthMock.mockReturnValue({
      user: { uid: GUEST_UID, isAnonymous: true, providerData: [], getIdToken: vi.fn() },
    });
    usePartyMock.mockReturnValue({
      party: {
        id: PARTY_ID,
        adminId: HOST_UID,
        hostDisplayName: 'Dana Host',
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
      gifts: [],
      loading: false,
      error: null,
    });
  });

  it('shows the one-screen card with a single ready control and no address gate', () => {
    render(<PartyLobby partyId={PARTY_ID} onStartGame={vi.fn()} />);
    expect(screen.getByTestId('guest-join-card')).toBeInTheDocument();
    expect(screen.getByText(COPY.welcomeTitle('Holiday Swap'))).toBeInTheDocument();
    expect(screen.getByText(COPY.welcomeBody('Dana'))).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: COPY.readyCta })).toHaveLength(1);
    expect(screen.queryByText(/Mark yourself as ready/i)).toBeNull();
    expect(screen.queryByText(/Setup Progress/i)).toBeNull();
    expect(screen.queryByText(/shipping address/i)).toBeNull();
  });
  it('never shows the anonymous guest uid on the card or the roster before I\'m ready', async () => {
    render(<PartyLobby partyId={PARTY_ID} onStartGame={vi.fn()} />);
    await screen.findByTestId('guest-join-card');
    expect(document.body.textContent).not.toMatch(/anon-gue/i);
    expect(document.body.textContent).not.toMatch(/Player anon/i);
  });
});
