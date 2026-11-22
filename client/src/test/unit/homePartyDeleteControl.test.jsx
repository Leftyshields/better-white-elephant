import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import { deleteDoc, getDoc } from 'firebase/firestore';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router-dom';
import { PartyModalProvider } from '../../contexts/PartyModalContext.jsx';
import { Home } from '../../pages/Home.jsx';
import {
  hostCanDeletePartyFromHome,
  homeDeletePartyTitle,
  HOME_DELETE_PARTY_COPY,
} from '../../utils/partyUiCopy.js';

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

async function openDeleteFor(title) {
  const card = screen.getByText(title).closest('.group');
  fireEvent.click(within(card).getByTitle('Party options'));
  const item = await screen.findByRole('menuitem', { name: 'Delete Party' });
  fireEvent.click(item);
  await waitFor(() => {
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
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
    deleteDoc.mockReset();
    getDoc.mockReset();
    deleteDoc.mockResolvedValue(undefined);
    getDoc.mockResolvedValue({ data: () => ({ status: 'ENDED', participantCount: 2 }) });
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
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

  it('opens one in-app confirm and calls delete once; the card is gone without a reload', async () => {
    renderSignedInHome();
    await waitFor(() => {
      expect(screen.getByText('Party Ended Test')).toBeInTheDocument();
    });

    await openDeleteFor('Party Ended Test');
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Delete Party Ended Test?' })).toBeInTheDocument();
    expect(screen.getByText(HOME_DELETE_PARTY_COPY.body)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: HOME_DELETE_PARTY_COPY.cancel })).toHaveFocus();
    expect(window.confirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: HOME_DELETE_PARTY_COPY.confirm }));

    await waitFor(() => {
      expect(deleteDoc).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText('Party Ended Test')).toBeNull();
    expect(screen.getByText('Party Cancelled Test')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(HOME_DELETE_PARTY_COPY.success);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(window.alert).not.toHaveBeenCalled();
  });

  it('restores the card and shows the inline error if delete fails', async () => {
    deleteDoc.mockRejectedValue(new Error('permission-denied'));
    renderSignedInHome();
    await waitFor(() => {
      expect(screen.getByText('Party Ended Test')).toBeInTheDocument();
    });

    await openDeleteFor('Party Ended Test');
    fireEvent.click(screen.getByRole('button', { name: HOME_DELETE_PARTY_COPY.confirm }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(HOME_DELETE_PARTY_COPY.error);
    });
    expect(screen.getByText('Party Ended Test')).toBeInTheDocument();
    expect(deleteDoc).toHaveBeenCalledTimes(1);
    expect(window.alert).not.toHaveBeenCalled();
  });

  it('Escape closes the dialog and does not call delete', async () => {
    renderSignedInHome();
    await waitFor(() => {
      expect(screen.getByText('Party Ended Test')).toBeInTheDocument();
    });

    await openDeleteFor('Party Ended Test');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(deleteDoc).not.toHaveBeenCalled();
    expect(screen.getByText('Party Ended Test')).toBeInTheDocument();
  });

  it('Cancel closes the dialog and does not call delete', async () => {
    renderSignedInHome();
    await waitFor(() => {
      expect(screen.getByText('Party Ended Test')).toBeInTheDocument();
    });

    await openDeleteFor('Party Ended Test');
    fireEvent.click(screen.getByRole('button', { name: HOME_DELETE_PARTY_COPY.cancel }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(deleteDoc).not.toHaveBeenCalled();
    expect(screen.getByText('Party Ended Test')).toBeInTheDocument();
  });
});

describe('HOME_DELETE_PARTY_COPY', () => {
  it('uses the signed strings verbatim', () => {
    expect(homeDeletePartyTitle('Office Party')).toBe('Delete Office Party?');
    expect(homeDeletePartyTitle('')).toBe('Delete this party?');
    expect(homeDeletePartyTitle('   ')).toBe('Delete this party?');
    expect(HOME_DELETE_PARTY_COPY).toEqual({
      untitledTitle: 'Delete this party?',
      body: "It's gone for your guests too. You can't undo this.",
      cancel: 'Cancel',
      confirm: 'Delete party',
      success: 'Party deleted.',
      error: "Couldn't delete the party. Try again.",
    });
  });
});
