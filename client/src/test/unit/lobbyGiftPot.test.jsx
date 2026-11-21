/**
 * G25 + G26: a player can't read anyone else's gift before the game, so the lobby pot is counted
 * from seats with hasGift true (host included). Same number for every viewer; Ready/undo Ready
 * doesn't move it. The seat owner's lobby load repairs a stale link.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { lobbyGiftPotCount } from '../../utils/giftPotCount.js';
import { seatGiftReconcileFields } from '../../utils/seatGift.js';
import { PartyLobby } from '../../components/PartyLobby.jsx';

const HOST_UID = 'host-uid';
const GUEST_UID = 'anon-guest';
const PARTY_ID = 'party-pot';

const useAuthMock = vi.fn();
const updateDocMock = vi.fn();
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
    doc: vi.fn((_db, ...path) => ({ path: path.join('/') })),
    setDoc: vi.fn().mockResolvedValue(undefined),
    updateDoc: (...args) => updateDocMock(...args),
    getDoc: vi.fn().mockResolvedValue(emptyDoc),
    deleteDoc: vi.fn().mockResolvedValue(undefined),
    deleteField: () => '__delete__',
    writeBatch: vi.fn(),
    query: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  };
});

const seat = (id, { status = 'GOING', ready = false, hasGift, giftId } = {}) => ({
  id,
  status,
  ready,
  ...(hasGift === undefined ? {} : { hasGift }),
  ...(giftId === undefined ? {} : { giftId }),
});

describe('lobbyGiftPotCount', () => {
  it('counts every GOING seat with hasGift true, host included, whatever ready says', () => {
    const participants = [
      seat(HOST_UID, { ready: false, hasGift: true, giftId: 'gh' }), // host submit leaves ready false
      seat('a', { ready: true, hasGift: true, giftId: 'ga' }),
      seat('b', { ready: false, hasGift: true, giftId: 'gb' }), // undid Ready: still counted
      seat('c', { ready: true }), // Ready without the link (older seat): not counted
      seat('d', { status: 'PENDING', hasGift: true, giftId: 'gd' }),
      seat('e', { status: 'DECLINED', hasGift: true, giftId: 'ge' }),
    ];
    expect(lobbyGiftPotCount(participants)).toBe(3);
  });

  it('is zero with no seats', () => {
    expect(lobbyGiftPotCount()).toBe(0);
    expect(lobbyGiftPotCount([])).toBe(0);
  });
});

describe('seatGiftReconcileFields', () => {
  it('links a seat that has my gift but no (or the wrong) link', () => {
    expect(seatGiftReconcileFields(seat('u'), { id: 'g1' })).toEqual({ hasGift: true, giftId: 'g1' });
    expect(seatGiftReconcileFields(seat('u', { hasGift: true, giftId: 'old' }), { id: 'g1' })).toEqual({
      hasGift: true,
      giftId: 'g1',
    });
  });

  it('unlinks a seat whose gift is gone', () => {
    expect(seatGiftReconcileFields(seat('u', { hasGift: true, giftId: 'g1' }), null)).toEqual({
      hasGift: false,
      giftId: '__delete__',
    });
  });

  it('leaves a matching or empty seat alone', () => {
    expect(seatGiftReconcileFields(seat('u', { hasGift: true, giftId: 'g1' }), { id: 'g1' })).toBeNull();
    expect(seatGiftReconcileFields(seat('u'), null)).toBeNull();
    expect(seatGiftReconcileFields(null, { id: 'g1' })).toBeNull();
  });
});

describe('PartyLobby gift pot (G25 + G26)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    usePartyMock.mockReset();
    updateDocMock.mockReset().mockResolvedValue(undefined);
  });

  function renderAs(uid, { gifts = [], participants, loading = false }) {
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
      loading,
      error: null,
    });
    return render(<PartyLobby partyId={PARTY_ID} onStartGame={vi.fn()} />);
  }

  const party3 = [
    seat(HOST_UID, { hasGift: true, giftId: 'gh' }),
    seat(GUEST_UID, { hasGift: false }),
    seat('g2', { ready: true, hasGift: true, giftId: 'g2gift' }),
  ];

  it('passes my uid to useParty so the lobby listens to my gift only', () => {
    renderAs(GUEST_UID, { participants: party3 });
    expect(usePartyMock).toHaveBeenCalledWith(PARTY_ID, GUEST_UID);
  });

  it('host and guest see the same count (host gift included)', () => {
    const host = renderAs(HOST_UID, { participants: party3, gifts: [{ id: 'gh', submitterId: HOST_UID }] });
    expect(screen.getByText('2 Gifts in the Pot')).toBeInTheDocument();
    host.unmount();
    renderAs(GUEST_UID, { participants: party3 });
    expect(screen.getByText('2 Gifts in the Pot')).toBeInTheDocument();
  });

  it('a guest undoing Ready keeps the count', () => {
    renderAs(GUEST_UID, {
      participants: [
        seat(HOST_UID, { hasGift: true, giftId: 'gh' }),
        seat(GUEST_UID, { ready: false, hasGift: true, giftId: 'mine' }),
      ],
      gifts: [{ id: 'mine', submitterId: GUEST_UID }],
    });
    expect(screen.getByText('2 Gifts in the Pot')).toBeInTheDocument();
  });

  it('says "1 Gift in the Pot" for one gift', () => {
    renderAs(GUEST_UID, { participants: [seat(HOST_UID, { hasGift: true, giftId: 'gh' }), seat(GUEST_UID)] });
    expect(screen.getByText('1 Gift in the Pot')).toBeInTheDocument();
  });

  it('shows the existing empty state with no gifts', () => {
    renderAs(GUEST_UID, { participants: [seat(HOST_UID), seat(GUEST_UID)] });
    expect(screen.getByText('Waiting for gifts...')).toBeInTheDocument();
    expect(screen.getByText('0 Gifts in the Pot')).toBeInTheDocument();
  });

  it('repairs my own stale seat link once my gift has loaded, and only my seat', async () => {
    renderAs(GUEST_UID, {
      participants: [seat(HOST_UID), seat(GUEST_UID, { ready: true }), seat('g2', { ready: true })],
      gifts: [{ id: 'mine', submitterId: GUEST_UID }],
    });
    await waitFor(() => expect(updateDocMock).toHaveBeenCalledTimes(1));
    const [ref, fields] = updateDocMock.mock.calls[0];
    expect(ref.path).toBe(`parties/${PARTY_ID}/participants/${GUEST_UID}`);
    expect(fields).toMatchObject({ hasGift: true, giftId: 'mine' });
  });

  it('does not touch the seat while gifts are still loading', async () => {
    renderAs(GUEST_UID, { loading: true, participants: [seat(HOST_UID), seat(GUEST_UID, { hasGift: true, giftId: 'x' })] });
    await new Promise((r) => setTimeout(r, 20));
    expect(updateDocMock).not.toHaveBeenCalled();
  });
});
