/**
 * UX M5: host gear / End Game must not appear while signed out, loading, or party missing.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PartyModalProvider } from '../../contexts/PartyModalContext.jsx';
import { SoundProvider } from '../../contexts/SoundContext.jsx';
import { Header } from '../../components/Header.jsx';

const useAuthMock = vi.fn();
const usePartyMock = vi.fn();

vi.mock('../../hooks/useAuth.js', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('../../hooks/useParty.js', () => ({
  useParty: (partyId) => usePartyMock(partyId),
}));

function renderHeaderOnPartyRoute(partyId = 'missing-party-id') {
  return render(
    <SoundProvider>
      <PartyModalProvider>
        <MemoryRouter initialEntries={[`/party/${partyId}`]}>
          <Routes>
            <Route path="/party/:partyId" element={<Header />} />
          </Routes>
        </MemoryRouter>
      </PartyModalProvider>
    </SoundProvider>,
  );
}

const manageGameQuery = () => screen.queryByRole('button', { name: 'Manage game' });

describe('Header host / end-game controls (UX M5)', () => {
  beforeEach(() => {
    useAuthMock.mockReset();
    usePartyMock.mockReset();
  });

  it('documents the origin/main isAdmin bug when user and party are both absent', () => {
    const legacyIsAdmin = (user, party) => party?.adminId === user?.uid;
    expect(legacyIsAdmin(null, null)).toBe(true);
    expect(legacyIsAdmin(undefined, undefined)).toBe(true);
  });

  it('does not show Manage game when signed out and party is missing (Party Not Found path)', () => {
    useAuthMock.mockReturnValue({ user: null, signOut: vi.fn(), signInWithGoogle: vi.fn() });
    usePartyMock.mockReturnValue({ party: null, loading: false });

    renderHeaderOnPartyRoute();
    expect(manageGameQuery()).not.toBeInTheDocument();
  });

  it('does not show Manage game while party is still loading', () => {
    useAuthMock.mockReturnValue({
      user: { uid: 'host-uid', displayName: 'Host', getIdToken: vi.fn() },
      signOut: vi.fn(),
      signInWithGoogle: vi.fn(),
    });
    usePartyMock.mockReturnValue({ party: null, loading: true });

    renderHeaderOnPartyRoute();
    expect(manageGameQuery()).not.toBeInTheDocument();
  });

  it('does not show Manage game when signed in but party document is missing', () => {
    useAuthMock.mockReturnValue({
      user: { uid: 'host-uid', displayName: 'Host', getIdToken: vi.fn() },
      signOut: vi.fn(),
      signInWithGoogle: vi.fn(),
    });
    usePartyMock.mockReturnValue({ party: null, loading: false });

    renderHeaderOnPartyRoute();
    expect(manageGameQuery()).not.toBeInTheDocument();
  });

  it('shows Manage game when user is party admin and party has finished loading', () => {
    useAuthMock.mockReturnValue({
      user: { uid: 'host-uid', displayName: 'Host', getIdToken: vi.fn() },
      signOut: vi.fn(),
      signInWithGoogle: vi.fn(),
    });
    usePartyMock.mockReturnValue({
      party: { id: 'p1', adminId: 'host-uid', status: 'ACTIVE' },
      loading: false,
    });

    renderHeaderOnPartyRoute('p1');
    expect(manageGameQuery()).toBeInTheDocument();
  });
});
