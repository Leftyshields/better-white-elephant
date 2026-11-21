/**
 * Signed-in Home: the "Join a party" box sits above "Your games", and the empty state points to it
 * with Copywriter's signed line.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router-dom';
import { PartyModalProvider } from '../../contexts/PartyModalContext.jsx';
import { Home } from '../../pages/Home.jsx';
import { SIGNED_IN_COPY } from '../../utils/landingMarketingCopy.js';
import { PARTY_INVITE_COPY } from '../../utils/partyInviteCopy.js';

const { onSnapshot } = vi.hoisted(() => ({ onSnapshot: vi.fn() }));
const mockUser = { uid: 'host-uid', email: 'host@example.com', providerData: [{ providerId: 'google.com' }] };

vi.mock('../../hooks/useAuth.js', () => ({
  useAuth: () => ({ user: mockUser, loading: false, signInWithGoogle: vi.fn(), ensureGuestSession: vi.fn() }),
}));
vi.mock('../../utils/analytics.js', () => ({
  trackButtonClick: vi.fn(),
  trackCreateParty: vi.fn(),
  trackSignUp: vi.fn(),
  trackLogin: vi.fn(),
  trackGameAbandoned: vi.fn(),
  trackError: vi.fn(),
}));
vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal()),
  collection: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  where: vi.fn(),
  orderBy: vi.fn(),
  collectionGroup: vi.fn(),
  doc: vi.fn((...args) => ({ path: args.join('/') })),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  onSnapshot,
}));

describe('Signed-in Home join box', () => {
  beforeEach(() => {
    onSnapshot.mockReset().mockImplementation((_ref, onNext) => {
      onNext({ docs: [], size: 0 });
      return vi.fn();
    });
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });

  it('renders the join box above "Your games" and the signed empty-state line', async () => {
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={['/']}>
          <PartyModalProvider>
            <Home />
          </PartyModalProvider>
        </MemoryRouter>
      </HelmetProvider>,
    );
    const heading = screen.getByRole('heading', { name: SIGNED_IN_COPY.heading });
    const joinBox = screen.getByRole('form', { name: PARTY_INVITE_COPY['home.join.title'] });
    expect(joinBox.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await waitFor(() =>
      expect(
        screen.getByText('Have a party code from your host? Enter it above to join, or host your own game.'),
      ).toBeInTheDocument(),
    );
  });
});
