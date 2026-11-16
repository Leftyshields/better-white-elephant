/**
 * Google host Share Link modal: rotate invite token CTA, helper, and done live region.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PartyLobby } from '../../components/PartyLobby.jsx';
import {
  HOST_INVITE_ROTATE_CTA,
  HOST_INVITE_ROTATE_DONE,
  HOST_INVITE_ROTATE_HELPER,
} from '../../utils/partyInviteCopy.js';

const HOST_UID = 'host-uid';
const PARTY_ID = 'party-rotate-test';
const OLD_TOKEN = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const NEW_TOKEN = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const useAuthMock = vi.fn();
const usePartyMock = vi.fn();
const apiRequestMock = vi.fn();
const ensureInviteTokenMock = vi.fn();
const rotateInviteTokenMock = vi.fn();

vi.mock('../../hooks/useAuth.js', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('../../hooks/useParty.js', () => ({
  useParty: (partyId) => usePartyMock(partyId),
}));

vi.mock('../../hooks/useGameSocket.js', () => ({
  useGameSocket: () => ({ socket: null }),
}));

vi.mock('../../components/PartyManagement.jsx', () => ({
  PartyManagement: () => <div data-testid="party-management-stub" />,
}));

vi.mock('../../components/dev/SimulationControls.jsx', () => ({
  SimulationControls: () => null,
}));

vi.mock('../../utils/analytics.js', () => ({
  trackSubmitGift: vi.fn(),
  trackStartGame: vi.fn(),
  trackInviteSent: vi.fn(),
  trackParticipantJoin: vi.fn(),
  trackError: vi.fn(),
  trackGameAbandoned: vi.fn(),
}));

vi.mock('../../utils/api.js', () => ({
  apiRequest: (...args) => apiRequestMock(...args),
  scrapeGiftUrl: vi.fn(),
}));

vi.mock('../../utils/firebase.js', () => ({
  db: { name: 'test-db' },
}));

vi.mock('../../utils/partyInvite.js', async (importOriginal) => ({
  ...(await importOriginal()),
  ensureInviteToken: (...args) => ensureInviteTokenMock(...args),
  rotateInviteToken: (...args) => rotateInviteTokenMock(...args),
}));

vi.mock('firebase/firestore', () => {
  const emptyDoc = { exists: () => false, data: () => ({}) };
  return {
    collection: vi.fn(),
    doc: vi.fn(() => ({})),
    setDoc: vi.fn().mockResolvedValue(undefined),
    updateDoc: vi.fn().mockResolvedValue(undefined),
    addDoc: vi.fn().mockResolvedValue(undefined),
    getDoc: vi.fn().mockResolvedValue(emptyDoc),
    deleteDoc: vi.fn().mockResolvedValue(undefined),
    query: vi.fn(),
    where: vi.fn(),
    getDocs: vi.fn().mockResolvedValue({ docs: [] }),
  };
});

function hostUser(overrides = {}) {
  return {
    uid: HOST_UID,
    displayName: 'Host',
    getIdToken: vi.fn(),
    providerData: [{ providerId: 'google.com' }],
    ...overrides,
  };
}

function stubParty() {
  usePartyMock.mockReturnValue({
    party: {
      id: PARTY_ID,
      adminId: HOST_UID,
      status: 'LOBBY',
      title: 'Holiday Swap',
      config: { maxSteals: 3 },
      date: { toDate: () => new Date('2026-12-01') },
    },
    participants: [{ id: HOST_UID, status: 'GOING', ready: false }],
    pendingInvites: [],
    gifts: [],
    loading: false,
    error: null,
  });
}

describe('PartyLobby invite link rotate', () => {
  beforeEach(() => {
    ensureInviteTokenMock.mockReset();
    rotateInviteTokenMock.mockReset();
    ensureInviteTokenMock.mockResolvedValue(OLD_TOKEN);
    rotateInviteTokenMock.mockResolvedValue(NEW_TOKEN);
    apiRequestMock.mockResolvedValue({ users: { [HOST_UID]: 'Host' } });
    stubParty();
  });

  it('shows the rotate button only for Google hosts', async () => {
    useAuthMock.mockReturnValue({
      user: hostUser({ providerData: [{ providerId: 'password' }] }),
    });

    render(<PartyLobby partyId={PARTY_ID} onStartGame={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Share Link/i }));

    await waitFor(() => {
      expect(screen.getByDisplayValue(new RegExp(`#t=${OLD_TOKEN}`))).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: HOST_INVITE_ROTATE_CTA })).not.toBeInTheDocument();
  });

  it('calls rotateInviteToken, shows done text, and updates the share link', async () => {
    useAuthMock.mockReturnValue({ user: hostUser() });

    render(<PartyLobby partyId={PARTY_ID} onStartGame={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Share Link/i }));

    const rotateButton = await screen.findByRole('button', { name: HOST_INVITE_ROTATE_CTA });
    expect(rotateButton.tagName).toBe('BUTTON');
    expect(rotateButton).toHaveAttribute('aria-describedby');
    expect(screen.getByText(HOST_INVITE_ROTATE_HELPER)).toBeInTheDocument();
    expect(rotateButton.className).toMatch(/min-h-11/);
    expect(rotateButton.className).toMatch(/focus-visible:ring-2/);

    fireEvent.click(rotateButton);

    await waitFor(() => expect(rotateInviteTokenMock).toHaveBeenCalledTimes(1));
    expect(rotateInviteTokenMock).toHaveBeenCalledWith({ name: 'test-db' }, PARTY_ID);

    await waitFor(() => {
      expect(screen.getByDisplayValue(new RegExp(`#t=${NEW_TOKEN}`))).toBeInTheDocument();
    });
    const done = screen.getByRole('status');
    expect(done).toHaveAttribute('aria-live', 'polite');
    expect(done).toHaveTextContent(HOST_INVITE_ROTATE_DONE);
  });
});
