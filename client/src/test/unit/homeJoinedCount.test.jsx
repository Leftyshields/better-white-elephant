import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router-dom';
import { PartyModalProvider } from '../../contexts/PartyModalContext.jsx';
import { Home } from '../../pages/Home.jsx';

const mockUser = { uid: 'host-uid', email: 'host@example.com' };

const { onSnapshot } = vi.hoisted(() => ({
  onSnapshot: vi.fn(),
}));

vi.mock('../../hooks/useAuth.js', () => ({
  useAuth: () => ({
    user: mockUser,
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

function partyDoc(party) {
  const { id, ...data } = party;
  return {
    id,
    data: () => ({
      title: data.title,
      status: data.status || 'LOBBY',
      adminId: mockUser.uid,
      createdAt: { toDate: () => new Date('2026-01-01') },
      date: { toDate: () => new Date('2026-01-15') },
      ...data,
    }),
  };
}

function setupSnapshotHandlers() {
  const admin = { onNext: null, onError: null };
  const participants = new Map();

  onSnapshot.mockImplementation((ref, onNext, onError) => {
    if (ref.path === 'parties') {
      admin.onNext = onNext;
      admin.onError = onError;
      return vi.fn();
    }

    const match = /^parties\/([^/]+)\/participants$/.exec(ref.path);
    if (match) {
      participants.set(match[1], { onNext, onError });
      return vi.fn();
    }

    return vi.fn();
  });

  return { admin, participants };
}

function deliverAdminParties(admin, parties) {
  act(() => {
    admin.onNext({
      docs: parties.map((party) => partyDoc(party)),
    });
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

describe('Home joined count', () => {
  beforeEach(() => {
    onSnapshot.mockReset();
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('shows participantCount when present even if the participants query errors', async () => {
    const { admin, participants } = setupSnapshotHandlers();
    renderSignedInHome();

    deliverAdminParties(admin, [
      { id: 'party-stored', title: 'Stored Count Party', participantCount: 2 },
    ]);

    await waitFor(() => {
      expect(screen.getByText('Stored Count Party')).toBeInTheDocument();
    });

    const listener = participants.get('party-stored');
    if (listener?.onError) {
      act(() => {
        listener.onError(new Error('permission-denied'));
      });
    }

    const card = screen.getByText('Stored Count Party').closest('.group');
    expect(within(card).getByText('2 Joined')).toBeInTheDocument();
    expect(within(card).queryByText('0 Joined')).toBeNull();
  });

  it('does not show a stuck 0 on a legacy party when a failed query is followed by a sized snapshot', async () => {
    const { admin, participants } = setupSnapshotHandlers();
    renderSignedInHome();

    deliverAdminParties(admin, [
      { id: 'party-legacy', title: 'Legacy Count Party' },
    ]);

    await waitFor(() => {
      expect(participants.get('party-legacy')?.onError).toEqual(expect.any(Function));
    });

    act(() => {
      participants.get('party-legacy').onError(new Error('permission-denied'));
    });

    const card = screen.getByText('Legacy Count Party').closest('.group');
    expect(within(card).queryByText('0 Joined')).toBeNull();
    expect(within(card).getByText('Joined')).toBeInTheDocument();

    act(() => {
      participants.get('party-legacy').onNext({ size: 3 });
    });

    expect(within(card).getByText('3 Joined')).toBeInTheDocument();
    expect(within(card).queryByText('0 Joined')).toBeNull();
  });

  it('keeps party A counts when party B resubscribes', async () => {
    const { admin, participants } = setupSnapshotHandlers();
    renderSignedInHome();

    const parties = [
      { id: 'party-a', title: 'Party Alpha' },
      { id: 'party-b', title: 'Party Beta' },
    ];

    deliverAdminParties(admin, parties);

    await waitFor(() => {
      expect(participants.get('party-a')?.onNext).toEqual(expect.any(Function));
      expect(participants.get('party-b')?.onNext).toEqual(expect.any(Function));
    });

    act(() => {
      participants.get('party-a').onNext({ size: 2 });
      participants.get('party-b').onNext({ size: 5 });
    });

    const cardA = screen.getByText('Party Alpha').closest('.group');
    const cardB = screen.getByText('Party Beta').closest('.group');
    expect(within(cardA).getByText('2 Joined')).toBeInTheDocument();
    expect(within(cardB).getByText('5 Joined')).toBeInTheDocument();

    deliverAdminParties(admin, parties);

    await waitFor(() => {
      expect(participants.get('party-a')?.onNext).toEqual(expect.any(Function));
      expect(participants.get('party-b')?.onNext).toEqual(expect.any(Function));
    });

    act(() => {
      participants.get('party-b').onNext({ size: 6 });
    });

    expect(within(cardA).getByText('2 Joined')).toBeInTheDocument();
    expect(within(cardB).getByText('6 Joined')).toBeInTheDocument();
  });
});
