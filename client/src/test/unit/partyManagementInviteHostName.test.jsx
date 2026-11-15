/**
 * PartyManagement invite requests must not send the host email local-part as hostName.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PartyManagement } from '../../components/PartyManagement.jsx';
import { pickHostNameForInvite } from '../../../../server/lib/display-names.js';

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

describe('PartyManagement invite hostName payload', () => {
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
      },
    });
  });

  it('sends a safe hostName when adding a person and sending invite', async () => {
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
    fireEvent.change(
      screen.getByPlaceholderText('friend@example.com'),
      { target: { value: 'friend@example.com' } },
    );
    fireEvent.click(screen.getByRole('button', { name: /^Add$/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const [, requestInit] = fetchMock.mock.calls[0];
    const body = JSON.parse(requestInit.body);
    expect(body.hostName).not.toBe('mgmt.leak');
    expect(body.hostName).not.toContain('@');
    expect(body.hostName).toBe(
      pickHostNameForInvite(HOST_UID, '', 'mgmt.leak@example.com'),
    );
  });
});