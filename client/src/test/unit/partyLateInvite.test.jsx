import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LATE_INVITE_COPY, formatLatePartyLine } from '../../utils/lateInvite.js';

const useAuthMock = vi.fn();
const usePartyMock = vi.fn();
const useOwnSeatStatusMock = vi.fn();

vi.mock('../../hooks/useAuth.js', () => ({
  useAuth: () => useAuthMock(),
}));
vi.mock('../../hooks/useParty.js', () => ({
  useParty: (...args) => usePartyMock(...args),
}));
vi.mock('../../hooks/useOwnSeatStatus.js', () => ({
  useOwnSeatStatus: (...args) => useOwnSeatStatusMock(...args),
}));
vi.mock('../../pages/GameRoom.jsx', () => ({
  GameRoom: () => <div data-testid="game-room">Game room</div>,
}));
vi.mock('../../components/PartyLobby.jsx', () => ({
  PartyLobby: () => <div data-testid="party-lobby">Lobby</div>,
}));
vi.mock('../../components/PartyInviteLanding.jsx', () => ({
  PartyInviteLanding: () => <div data-testid="invite-landing">Landing</div>,
  hostNameForLateCard: (data) => {
    if (typeof data?.hostRosterLabel === 'string') return data.hostRosterLabel;
    const stored = typeof data?.hostDisplayName === 'string' ? data.hostDisplayName.trim() : '';
    return stored ? stored.split(/\s+/)[0] : null;
  },
}));
vi.mock('../../components/SEO.jsx', () => ({
  SEO: () => null,
}));

import { Party } from '../../pages/Party.jsx';

function renderParty() {
  return render(
    <MemoryRouter initialEntries={['/party/p1']}>
      <Routes>
        <Route path="/party/:partyId" element={<Party />} />
      </Routes>
    </MemoryRouter>,
  );
}

const googleUser = { uid: 'user-1', providerData: [{ providerId: 'google.com' }] };
const activeParty = {
  id: 'p1',
  title: 'Office Swap',
  status: 'ACTIVE',
  adminId: 'host-1',
  hostDisplayName: 'Dana',
};

describe('Party late-invite routing (regression: no GameRoom for a late visitor)', () => {
  it('shows the started late card for a signed-in visitor with no seat, never GameRoom or Refresh', () => {
    useAuthMock.mockReturnValue({ user: googleUser, loading: false, signInWithGoogle: vi.fn() });
    usePartyMock.mockReturnValue({ party: activeParty, participants: [], loading: false, error: null });
    useOwnSeatStatusMock.mockReturnValue('not-seated');

    renderParty();

    expect(screen.getByRole('heading', { name: LATE_INVITE_COPY.gameAlreadyStartedHeading })).toBeInTheDocument();
    expect(screen.getByText(formatLatePartyLine('Office Swap', 'Dana'))).toBeInTheDocument();
    expect(screen.queryByTestId('game-room')).toBeNull();
    expect(screen.queryByText(/couldn'?t load the game/i)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Refresh' })).toBeNull();
    expect(screen.queryByRole('button', { name: LATE_INVITE_COPY.lateSignInLink })).toBeNull();
    expect(useOwnSeatStatusMock).toHaveBeenCalledWith('p1', 'user-1');
  });

  it('G28: names the host with the roster label the players saw, not just the first name', () => {
    useAuthMock.mockReturnValue({ user: googleUser, loading: false, signInWithGoogle: vi.fn() });
    usePartyMock.mockReturnValue({
      party: { ...activeParty, hostDisplayName: 'Dana Reyes', hostRosterLabel: 'Dana R.' },
      participants: [],
      loading: false,
      error: null,
    });
    useOwnSeatStatusMock.mockReturnValue('not-seated');

    renderParty();

    expect(screen.getByText(formatLatePartyLine('Office Swap', 'Dana R.'))).toBeInTheDocument();
    expect(screen.queryByText(formatLatePartyLine('Office Swap', 'Dana'))).toBeNull();
  });

  it('shows the over late card for a signed-in visitor on an ENDED party', () => {
    useAuthMock.mockReturnValue({ user: googleUser, loading: false, signInWithGoogle: vi.fn() });
    usePartyMock.mockReturnValue({
      party: { ...activeParty, status: 'ENDED', hostDisplayName: '' },
      participants: [],
      loading: false,
      error: null,
    });
    useOwnSeatStatusMock.mockReturnValue('not-seated');

    renderParty();

    expect(screen.getByRole('heading', { name: LATE_INVITE_COPY.gameAlreadyOverHeading })).toBeInTheDocument();
    expect(screen.getByText(formatLatePartyLine('Office Swap', null))).toBeInTheDocument();
    expect(screen.queryByTestId('game-room')).toBeNull();
  });

  it('keeps the Loading party spinner while the own-seat read is in flight, so a seated player never flashes the late card', () => {
    useAuthMock.mockReturnValue({ user: googleUser, loading: false, signInWithGoogle: vi.fn() });
    usePartyMock.mockReturnValue({
      party: activeParty,
      participants: [],
      loading: false,
      error: null,
    });
    useOwnSeatStatusMock.mockReturnValue('checking');

    renderParty();

    expect(screen.getByText('Loading party...')).toBeInTheDocument();
    expect(screen.queryByTestId('late-invite-card')).toBeNull();
    expect(screen.queryByTestId('game-room')).toBeNull();
    expect(screen.queryByRole('heading', { name: LATE_INVITE_COPY.gameAlreadyStartedHeading })).toBeNull();
  });

  it('renders GameRoom for a seated player even when the participants list is still empty', () => {
    useAuthMock.mockReturnValue({ user: googleUser, loading: false, signInWithGoogle: vi.fn() });
    usePartyMock.mockReturnValue({ party: activeParty, participants: [], loading: false, error: null });
    useOwnSeatStatusMock.mockReturnValue('seated');

    renderParty();

    expect(screen.getByTestId('game-room')).toBeInTheDocument();
    expect(screen.queryByTestId('late-invite-card')).toBeNull();
  });

  it('renders GameRoom when the own-seat read errors, so the real load-error path can still appear', () => {
    useAuthMock.mockReturnValue({ user: googleUser, loading: false, signInWithGoogle: vi.fn() });
    usePartyMock.mockReturnValue({ party: activeParty, participants: [], loading: false, error: null });
    useOwnSeatStatusMock.mockReturnValue('error');

    renderParty();

    expect(screen.getByTestId('game-room')).toBeInTheDocument();
    expect(screen.queryByTestId('late-invite-card')).toBeNull();
  });
});
