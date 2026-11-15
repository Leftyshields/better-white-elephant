/**
 * PartyManagement invite requests must not send hostName (server resolves host display name).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PartyManagement } from '../../components/PartyManagement.jsx';

const HOST_UID = 'mgmt-host-uid1234';
const PARTY_ID = 'mgmt-party-id';

const useAuthMock = vi.fn();
const fetchMock = vi.fn();

vi.mock('../../hooks/useAuth.js', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('../../utils/api.js', () => ({
  apiRequest: vi.fn().mockResolvedValue({ users: {} }),
}));

vi.mock('../../utils/firebase.js', () => ({
  db: {},
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  setDoc: vi.fn().mockResolvedValue(undefined),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  deleteDoc: vi.fn().mockResolvedValue(undefined),
  getDoc: vi.fn().mockResolvedValue({ exists: false, data: () => ({}) }),
  getDocs: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  collection: vi.fn(),
}));

describe('PartyManagement invite auth payload', () => {
  beforeEach(() => {
    vi.stubGlobal('alert', vi.fn());
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });

    useAuthMock.mockReturnValue({
      user: {
        uid: HOST_UID,
        displayName: '',
        email: 'mgmt.leak@example.com',
        getIdToken: vi.fn().mockResolvedValue('fake-id-token'),
      },
    });
  });

  it('sends only email and partyId with Authorization (no client hostName)', async () => {
    const party = {
      id: PARTY_ID,
      adminId: HOST_UID,
      title: 'Gift Night',
      status: 'LOBBY',
    };

    render(
      <PartyManagement
        party={party}
        participants={[{ id: HOST_UID, status: 'GOING' }]}
        pendingInvites={[]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Manage Party/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Guests$/i }));
    fireEvent.click(screen.getByRole('button', { name: /Add Person/i }));
    fireEvent.change(screen.getByPlaceholderText('friend@example.com'), {
      target: { value: 'friend@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Add$/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const [, requestInit] = fetchMock.mock.calls[0];
    const body = JSON.parse(requestInit.body);
    expect(body).toEqual({
      email: 'friend@example.com',
      partyId: PARTY_ID,
    });
    expect(body.hostName).toBeUndefined();
    expect(requestInit.headers.Authorization).toBe('Bearer fake-id-token');
  });
});