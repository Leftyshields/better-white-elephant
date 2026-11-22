import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router-dom';
import { PartyModalProvider } from '../../contexts/PartyModalContext.jsx';
import { Home } from '../../pages/Home.jsx';
import { LANDING_COPY, SIGNED_IN_COPY } from '../../utils/landingMarketingCopy.js';

const GOOGLE_USER = {
  uid: 'host-uid',
  email: 'host@example.com',
  isAnonymous: false,
  providerData: [{ providerId: 'google.com' }],
};
const ANON_USER = { uid: 'anon-uid', isAnonymous: true, providerData: [] };

const { onSnapshot, authState } = vi.hoisted(() => ({
  onSnapshot: vi.fn(),
  authState: { user: null },
}));

vi.mock('../../hooks/useAuth.js', () => ({
  useAuth: () => ({
    user: authState.user,
    loading: false,
    signInWithGoogle: vi.fn(),
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
    collection: vi.fn((_db, ...segments) => ({ path: segments.join('/') })),
    query: vi.fn((ref) => ({ path: ref.path })),
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

function partyDoc({ id, ...data }) {
  return {
    id,
    data: () => ({
      status: 'LOBBY',
      adminId: authState.user?.uid,
      participantCount: 1,
      createdAt: { toDate: () => new Date('2026-01-01') },
      date: { toDate: () => new Date('2026-01-15') },
      ...data,
    }),
  };
}

function captureAdminListener() {
  const admin = { onNext: null };
  onSnapshot.mockImplementation((ref, onNext) => {
    if (ref.path === 'parties') admin.onNext = onNext;
    return vi.fn();
  });
  return admin;
}

function renderHome() {
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

async function renderWithParties(user, parties) {
  authState.user = user;
  const admin = captureAdminListener();
  renderHome();
  await waitFor(() => expect(admin.onNext).toEqual(expect.any(Function)));
  act(() => {
    admin.onNext({ docs: parties.map(partyDoc) });
  });
}

const TWO_PARTIES = [
  { id: 'p1', title: 'Office Swap' },
  { id: 'p2', title: 'Family Swap' },
];

function phoneCreateButton() {
  return screen
    .queryAllByRole('button', { name: LANDING_COPY.primaryCta })
    .find((b) => b.className.includes('md:hidden'));
}

describe('Home phone create button (P1 #7a)', () => {
  beforeEach(() => {
    onSnapshot.mockReset();
    authState.user = null;
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  // Regression: before the fix a Google host with parties had no create button below md
  // (the header button is `hidden md:block`, the dashed card shows only with zero parties).
  it('regression: a Google-signed-in host with parties has a create button on phones', async () => {
    await renderWithParties(GOOGLE_USER, TWO_PARTIES);
    await screen.findByText('Office Swap');
    expect(phoneCreateButton()).toBeDefined();
  });

  it('is phone-only, full width, 44px+, uses the shared focus ring, and sits above the party list', async () => {
    await renderWithParties(GOOGLE_USER, TWO_PARTIES);
    const firstCard = (await screen.findByText('Office Swap')).closest('.group');
    const button = phoneCreateButton();
    expect(button.className).toMatch(/(^|\s)md:hidden(\s|$)/);
    expect(button.className).toMatch(/(^|\s)w-full(\s|$)/);
    expect(button.className).toMatch(/(^|\s)min-h-11(\s|$)/);
    expect(button.className).toContain('focus-visible:ring-purple-500');
    expect(button.compareDocumentPosition(firstCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('opens the create party modal', async () => {
    await renderWithParties(GOOGLE_USER, TWO_PARTIES);
    await screen.findByText('Office Swap');
    expect(screen.queryByPlaceholderText(SIGNED_IN_COPY.partyPlaceholder)).toBeNull();
    fireEvent.click(phoneCreateButton());
    expect(await screen.findByPlaceholderText(SIGNED_IN_COPY.partyPlaceholder)).toBeInTheDocument();
  });

  it('does not render for an anonymous user with parties', async () => {
    await renderWithParties(ANON_USER, TWO_PARTIES);
    await screen.findByText('Office Swap');
    expect(phoneCreateButton()).toBeUndefined();
  });

  it('does not render signed out', () => {
    authState.user = null;
    captureAdminListener();
    renderHome();
    expect(phoneCreateButton()).toBeUndefined();
  });

  it('leaves the zero-parties dashed card as the only create entry when there are no parties', async () => {
    await renderWithParties(GOOGLE_USER, []);
    expect(await screen.findByText(SIGNED_IN_COPY.emptyTitle)).toBeInTheDocument();
    expect(phoneCreateButton()).toBeUndefined();
  });
});
