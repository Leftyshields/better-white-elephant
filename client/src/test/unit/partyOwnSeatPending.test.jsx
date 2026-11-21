/**
 * HIGH: while the party is still loading, useOwnSeatStatus is first called
 * without a partyId/uid, so a stale 'not-seated' must not reach the first
 * ACTIVE render. These tests use the REAL hook and leave the seat read
 * pending. They fail on the current PR head, which returns 'not-seated'
 * on that first render and flashes the late card (stealing focus).
 */
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LATE_INVITE_COPY } from '../../utils/lateInvite.js';
import { useOwnSeatStatus } from '../../hooks/useOwnSeatStatus.js';

const { lateCardPaints, getDocMock, useAuthMock, usePartyMock } = vi.hoisted(() => ({
  lateCardPaints: [],
  getDocMock: vi.fn(),
  useAuthMock: vi.fn(),
  usePartyMock: vi.fn(),
}));

vi.mock('../../hooks/useAuth.js', () => ({
  useAuth: () => useAuthMock(),
}));
vi.mock('../../hooks/useParty.js', () => ({
  useParty: (...args) => usePartyMock(...args),
}));
vi.mock('../../utils/firebase.js', () => ({
  db: { name: 'test-db' },
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, ...path) => ({ path: path.join('/') })),
  getDoc: (...args) => getDocMock(...args),
}));
vi.mock('../../pages/GameRoom.jsx', () => ({
  GameRoom: () => <div data-testid="game-room">Game room</div>,
}));
vi.mock('../../components/PartyLobby.jsx', () => ({
  PartyLobby: () => <div data-testid="party-lobby">Lobby</div>,
}));
vi.mock('../../components/PartyInviteLanding.jsx', () => ({
  PartyInviteLanding: () => <div data-testid="invite-landing">Landing</div>,
  hostFirstNameFromParty: (data) => {
    const stored = typeof data?.hostDisplayName === 'string' ? data.hostDisplayName.trim() : '';
    return stored ? stored.split(/\s+/)[0] : null;
  },
}));
vi.mock('../../components/LateInviteCard.jsx', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    LateInviteCard: (props) => {
      lateCardPaints.push(props);
      return actual.LateInviteCard(props);
    },
  };
});
vi.mock('../../components/SEO.jsx', () => ({
  SEO: () => null,
}));

import { Party } from '../../pages/Party.jsx';

const googleUser = { uid: 'user-1', providerData: [{ providerId: 'google.com' }] };
const activeParty = {
  id: 'p1',
  title: 'Office Swap',
  status: 'ACTIVE',
  adminId: 'host-1',
  hostDisplayName: 'Dana',
};

function PartyHarness() {
  return (
    <MemoryRouter initialEntries={['/party/p1']}>
      <Routes>
        <Route path="/party/:partyId" element={<Party />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('useOwnSeatStatus keys its result to partyId+uid', () => {
  afterEach(() => {
    getDocMock.mockReset();
  });

  it('returns checking on the first render after partyId and uid appear, while the seat read is still pending', () => {
    getDocMock.mockReturnValue(new Promise(() => {}));
    const statuses = [];

    function Probe({ partyId, uid }) {
      const status = useOwnSeatStatus(partyId, uid);
      statuses.push({ partyId, uid, status });
      return <div data-testid="seat-status">{status}</div>;
    }

    const view = render(<Probe partyId={null} uid={null} />);
    expect(statuses[statuses.length - 1]).toEqual({ partyId: null, uid: null, status: 'not-seated' });

    view.rerender(<Probe partyId="p1" uid="user-1" />);

    const afterKeyChange = statuses.filter((s) => s.partyId === 'p1' && s.uid === 'user-1');
    expect(afterKeyChange.length).toBeGreaterThan(0);
    expect(afterKeyChange[0].status).toBe('checking');
    expect(afterKeyChange.map((s) => s.status)).not.toContain('not-seated');
  });
});

describe('Party + real useOwnSeatStatus (pending seat read)', () => {
  beforeEach(() => {
    lateCardPaints.length = 0;
    getDocMock.mockReset();
    useAuthMock.mockReset();
    usePartyMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not flash the late card or steal focus when the party goes from loading to ACTIVE while the seat read is still pending', async () => {
    let resolveSeat;
    getDocMock.mockReturnValue(
      new Promise((resolve) => {
        resolveSeat = resolve;
      }),
    );
    useAuthMock.mockReturnValue({ user: googleUser, loading: false, signInWithGoogle: vi.fn() });
    usePartyMock.mockReturnValue({ party: null, participants: [], loading: true, error: null });

    const view = render(<PartyHarness />);

    expect(screen.getByText('Loading party...')).toBeInTheDocument();
    expect(lateCardPaints).toEqual([]);
    expect(screen.queryByTestId('late-invite-card')).toBeNull();

    usePartyMock.mockReturnValue({
      party: activeParty,
      participants: [],
      loading: false,
      error: null,
    });
    view.rerender(<PartyHarness />);

    // A seated player must never see this card, not even on the first ACTIVE
    // commit before the hook's effect can set 'checking'.
    expect(lateCardPaints).toEqual([]);
    expect(screen.queryByTestId('late-invite-card')).toBeNull();
    expect(screen.queryByRole('heading', { name: LATE_INVITE_COPY.gameAlreadyStartedHeading })).toBeNull();
    expect(document.activeElement?.textContent).not.toBe(LATE_INVITE_COPY.gameAlreadyStartedHeading);
    expect(screen.getByText('Loading party...')).toBeInTheDocument();
    expect(screen.queryByTestId('game-room')).toBeNull();

    await act(async () => {
      resolveSeat({ exists: () => true, data: () => ({}) });
    });

    expect(await screen.findByTestId('game-room')).toBeInTheDocument();
    expect(lateCardPaints).toEqual([]);
    expect(screen.queryByTestId('late-invite-card')).toBeNull();
  });

  it('lobby then join then start shows no late card for a seated player', async () => {
    const lobbyParty = {
      id: 'p1',
      title: 'Office Swap',
      status: 'LOBBY',
      adminId: 'host-1',
      hostDisplayName: 'Dana',
    };
    // If a LOBBY own-seat read ran, it would resolve not-seated (seat not written yet).
    getDocMock.mockResolvedValue({ exists: () => false, data: () => undefined });
    useAuthMock.mockReturnValue({ user: googleUser, loading: false, signInWithGoogle: vi.fn() });
    usePartyMock.mockReturnValue({
      party: lobbyParty,
      participants: [],
      loading: false,
      error: null,
    });

    const view = render(<PartyHarness />);

    expect(await screen.findByTestId('invite-landing')).toBeInTheDocument();
    expect(lateCardPaints).toEqual([]);
    expect(screen.queryByTestId('late-invite-card')).toBeNull();

    usePartyMock.mockReturnValue({
      party: lobbyParty,
      participants: [{ id: googleUser.uid }],
      loading: false,
      error: null,
    });
    view.rerender(<PartyHarness />);

    expect(await screen.findByTestId('party-lobby')).toBeInTheDocument();
    expect(lateCardPaints).toEqual([]);
    expect(screen.queryByTestId('late-invite-card')).toBeNull();

    usePartyMock.mockReturnValue({
      party: activeParty,
      participants: [{ id: googleUser.uid }],
      loading: false,
      error: null,
    });
    view.rerender(<PartyHarness />);

    expect(await screen.findByTestId('game-room')).toBeInTheDocument();
    expect(lateCardPaints).toEqual([]);
    expect(screen.queryByTestId('late-invite-card')).toBeNull();
    expect(screen.queryByRole('heading', { name: LATE_INVITE_COPY.gameAlreadyStartedHeading })).toBeNull();
  });
});
