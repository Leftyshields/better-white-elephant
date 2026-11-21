/**
 * G18 (c): the host sees a guest's typed seat name before Ready, in the lobby roster and in the
 * Manage Party guest list, through the shared seatDisplayName helper (G21's " (N)" included).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PartyManagement } from '../../components/PartyManagement.jsx';

const HOST_UID = 'roster-host-uid1';
const apiRequestMock = vi.fn();

vi.mock('../../hooks/useAuth.js', () => ({
  useAuth: () => ({ user: { uid: HOST_UID, displayName: 'Dana', getIdToken: vi.fn() } }),
}));
vi.mock('../../utils/api.js', () => ({ apiRequest: (...args) => apiRequestMock(...args) }));
vi.mock('../../utils/firebase.js', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  getDoc: vi.fn().mockResolvedValue({ exists: false, data: () => ({}) }),
  getDocs: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  collection: vi.fn(),
}));

function openGuests(participants) {
  render(
    <PartyManagement
      party={{ id: 'roster-party', adminId: HOST_UID, title: 'Gift Night', status: 'LOBBY' }}
      participants={participants}
      pendingInvites={[]}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /Manage Party/i }));
  fireEvent.click(screen.getByRole('button', { name: /^Guests$/i }));
}

describe('Manage Party guest list names', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it("shows an anonymous guest's saved seat name before Ready, not 'Player <id>'", async () => {
    // The profile lookup has nothing for an anonymous guest; the seat has the typed name.
    apiRequestMock.mockResolvedValue({ users: { anonGuestUid99: 'Player anonGues' } });
    openGuests([
      { id: HOST_UID, status: 'GOING', displayName: 'Dana' },
      { id: 'anonGuestUid99', status: 'GOING', ready: false, displayName: 'Alex' },
    ]);
    await waitFor(() => expect(apiRequestMock).toHaveBeenCalled());
    expect(await screen.findByText('Alex')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/anonGues/);
  });

  it("numbers duplicate names with G21's (N) in seat order", async () => {
    apiRequestMock.mockResolvedValue({ users: {} });
    openGuests([
      { id: HOST_UID, status: 'GOING', displayName: 'Dana' },
      { id: 'g-1', status: 'GOING', ready: false, displayName: 'Alex' },
      { id: 'g-2', status: 'GOING', ready: false, displayName: 'Alex' },
    ]);
    expect(await screen.findByText('Alex (2)')).toBeInTheDocument();
    expect(screen.getByText('Alex')).toBeInTheDocument();
  });

  it('keeps the plain Player fallback when a seat has no name and the lookup fails', async () => {
    apiRequestMock.mockRejectedValue(new Error('network'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    openGuests([
      { id: HOST_UID, status: 'GOING', displayName: 'Dana' },
      { id: 'noNameGuest1', status: 'GOING', ready: false },
    ]);
    await waitFor(() => expect(apiRequestMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.getAllByText(/^Player/).length).toBeGreaterThan(0));
  });
});
