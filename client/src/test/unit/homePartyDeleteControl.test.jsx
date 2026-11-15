import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router-dom';
import { PartyModalProvider } from '../../contexts/PartyModalContext.jsx';
import { Home } from '../../pages/Home.jsx';
import { hostCanDeletePartyFromHome } from '../../utils/partyUiCopy.js';

const mockUser = { uid: 'host-uid', email: 'host@example.com' };

const partyFixtures = [
  { id: 'p-lobby', title: 'Party Lobby Test', status: 'LOBBY' },
  { id: 'p-active', title: 'Party Active Test', status: 'ACTIVE' },
  { id: 'p-ended', title: 'Party Ended Test', status: 'ENDED' },
  { id: 'p-cancelled', title: 'Party Cancelled Test', status: 'CANCELLED' },
];

const { onSnapshot } = vi.hoisted(() => ({
  onSnapshot: vi.fn(),
}));

vi.mock('../../hooks/useAuth.js', () => ({
  useAuth: () => ({
    user: mockUser,
    loading: false,
    signInWithGoogle: vi.fn(),
    signInWithEmailAndPassword: vi.fn(),
    signUpWithEmailAndPassword: vi.fn(),
  }),
}));

vi.mock('../../utils/analytics.js', () => ({
  trackButtonClick: vi.fn(),
  trackCreateParty: vi.fn(),
  trackSignUp: vi.fn(),
  trackLogin: vi.fn(),
  trackGameAbandoned: vi.fn(),
  trackError: vi.fn(),
}));

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    collection: vi.fn(() => ({})),
    query: vi.fn((...args) => ({ kind: 'party-query', args })),
    where: vi.fn(),
    orderBy: vi.fn(),
    collectionGroup: vi.fn(),
    doc: vi.fn((...args) => ({ path: args.join('/') })),
    addDoc: vi.fn(),
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    deleteDoc: vi.fn(),
    onSnapshot,
  };
});

function stubAdminPartiesSnapshot() {
  let adminDelivered = false;
  onSnapshot.mockImplementation((_ref, onNext) => {
    if (!adminDelivered) {
      adminDelivered = true;
      onNext({
        docs: partyFixtures.map((party) => ({
          id: party.id,
          data: () => ({
            title: party.title,
            status: party.status,
            adminId: mockUser.uid,
            createdAt: { toDate: () => new Date('2026-01-01') },
            date: { toDate: () => new Date('2026-01-15') },
          }),
        })),
      });
    } else {
      onNext({ size: 0 });
    }
    return vi.fn();
  });
}

function renderSignedInHome() {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={['/']}>
        <PartyModalProvider>
          <Home />
        </PartyModalProvider>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

describe('hostCanDeletePartyFromHome', () => {
  it('allows delete only for admin hosts with ENDED or CANCELLED status', () => {
    expect(hostCanDeletePartyFromHome({ isAdmin: true, status: 'LOBBY' })).toBe(false);
    expect(hostCanDeletePartyFromHome({ isAdmin: true, status: 'ACTIVE' })).toBe(false);
    expect(hostCanDeletePartyFromHome({ isAdmin: true, status: 'ENDED' })).toBe(true);
    expect(hostCanDeletePartyFromHome({ isAdmin: true, status: 'CANCELLED' })).toBe(true);
    expect(hostCanDeletePartyFromHome({ isAdmin: false, status: 'ENDED' })).toBe(false);
  });
});

describe('Home party delete control', () => {
  beforeEach(() => {
    onSnapshot.mockReset();
    stubAdminPartiesSnapshot();
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });

  it('shows Delete only for ENDED and CANCELLED parties, not LOBBY or ACTIVE', async () => {
    renderSignedInHome();

    await waitFor(() => {
      expect(screen.getByText('Party Lobby Test')).toBeInTheDocument();
    });

    const lobbyCard = screen.getByText('Party Lobby Test').closest('.group');
    const activeCard = screen.getByText('Party Active Test').closest('.group');
    const endedCard = screen.getByText('Party Ended Test').closest('.group');
    const cancelledCard = screen.getByText('Party Cancelled Test').closest('.group');

    expect(within(lobbyCard).queryByTitle('Party options')).toBeNull();
    expect(within(activeCard).queryByTitle('Party options')).toBeNull();

    expect(within(endedCard).getByTitle('Party options')).toBeInTheDocument();
    expect(within(cancelledCard).getByTitle('Party options')).toBeInTheDocument();
  });
});