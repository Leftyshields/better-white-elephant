/**
 * G25 gift privacy: the lobby gift pot is counted from Ready seats (plus my own gift), because a
 * player can no longer read anyone else's gift doc before the game.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { lobbyGiftPotCount } from '../../utils/giftPotCount.js';
import { PartyLobby } from '../../components/PartyLobby.jsx';

const HOST_UID = 'host-uid';
const GUEST_UID = 'anon-guest';
const PARTY_ID = 'party-pot';

const useAuthMock = vi.fn();
const usePartyMock = vi.fn();

vi.mock('../../hooks/useAuth.js', () => ({ useAuth: () => useAuthMock() }));
vi.mock('../../hooks/useParty.js', () => ({
  useParty: (partyId, authUid) => usePartyMock(partyId, authUid),
}));
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
    limit: vi.fn(),
    getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  };
});

const seats = (...list) => list.map(([id, status, ready]) => ({ id, status, ready }));

describe('lobbyGiftPotCount', () => {
  it('counts GOING guests whose seat is Ready, not the host seat or pending/declined seats', () => {
    const participants = seats(
      [HOST_UID, 'GOING', true],
      ['a', 'GOING', true],
      ['b', 'GOING', false],
      ['c', 'PENDING', true],
      ['d', 'DECLINED', true],
      ['e', 'GOING', true]
    );
    expect(lobbyGiftPotCount({ participants, adminId: HOST_UID, userId: 'b' })).toBe(2);
  });

  it('adds my own gift when my seat is not already counted (host, or a guest not Ready yet)', () => {
    const participants = seats([HOST_UID, 'GOING', false], ['a', 'GOING', true], ['b', 'GOING', false]);
    expect(lobbyGiftPotCount({ participants, adminId: HOST_UID, userId: HOST_UID, hasOwnGift: true })).toBe(2);
    expect(lobbyGiftPotCount({ participants, adminId: HOST_UID, userId: 'b', hasOwnGift: true })).toBe(2);
    // Already counted through my Ready seat: not double counted.
    expect(lobbyGiftPotCount({ participants, adminId: HOST_UID, userId: 'a', hasOwnGift: true })).toBe(1);
  });

  it('is zero with no seats', () => {
    expect(lobbyGiftPotCount({})).toBe(0);
  });
});

describe('PartyLobby gift pot (G25)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    usePartyMock.mockReset();
  });

  function renderAs(uid, { gifts = [], participants }) {
    useAuthMock.mockReturnValue({
      user: { uid, isAnonymous: uid !== HOST_UID, providerData: [], getIdToken: vi.fn() },
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
      participants,
      pendingInvites: [],
      gifts,
      loading: false,
      error: null,
    });
    return render(<PartyLobby partyId={PARTY_ID} onStartGame={vi.fn()} />);
  }

  it('passes my uid to useParty so the lobby listens to my gift only', () => {
    renderAs(GUEST_UID, { participants: seats([HOST_UID, 'GOING', false], [GUEST_UID, 'GOING', false]) });
    expect(usePartyMock).toHaveBeenCalledWith(PARTY_ID, GUEST_UID);
  });

  it('a guest sees the pot counted from Ready seats, not from gift docs', () => {
    renderAs(GUEST_UID, {
      participants: seats(
        [HOST_UID, 'GOING', false],
        [GUEST_UID, 'GOING', false],
        ['g2', 'GOING', true],
        ['g3', 'GOING', true]
      ),
    });
    expect(screen.getByText('2 Gifts in the Pot')).toBeInTheDocument();
    expect(screen.getAllByText('🎁').length).toBeGreaterThanOrEqual(2);
  });

  it('the host sees Ready guests plus their own gift', () => {
    renderAs(HOST_UID, {
      gifts: [{ id: 'host-gift', partyId: PARTY_ID, submitterId: HOST_UID, title: 'Mine' }],
      participants: seats([HOST_UID, 'GOING', false], ['g2', 'GOING', true], ['g3', 'GOING', false]),
    });
    expect(screen.getByText('2 Gifts in the Pot')).toBeInTheDocument();
  });

  it('shows the existing empty state when nobody is Ready and I have no gift', () => {
    renderAs(GUEST_UID, { participants: seats([HOST_UID, 'GOING', false], [GUEST_UID, 'GOING', false]) });
    expect(screen.getByText('Waiting for gifts...')).toBeInTheDocument();
    expect(screen.getByText('0 Gifts in the Pot')).toBeInTheDocument();
  });
});
