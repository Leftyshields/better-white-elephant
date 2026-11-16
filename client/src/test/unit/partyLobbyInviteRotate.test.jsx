/**
 * Google host Share Link modal: invite load, accessible full link, rotate confirm/success/failure.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PartyLobby } from '../../components/PartyLobby.jsx';
import { buildPartyShareLink } from '../../utils/partyInvite.js';
import {
  HOST_INVITE_LOAD_FAILED,
  HOST_INVITE_ROTATE_CONFIRM,
  HOST_INVITE_ROTATE_CTA,
  HOST_INVITE_ROTATE_DONE,
  HOST_INVITE_ROTATE_FAILED,
  HOST_INVITE_ROTATE_HELPER,
  HOST_INVITE_ROTATE_RETRY,
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

async function openShareModalAsGoogleHost() {
  useAuthMock.mockReturnValue({ user: hostUser() });
  render(<PartyLobby partyId={PARTY_ID} onStartGame={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /Share Link/i }));
  await waitFor(() => {
    expect(screen.getByDisplayValue(new RegExp(`#t=${OLD_TOKEN}`))).toBeInTheDocument();
  });
  return screen.getByRole('button', { name: HOST_INVITE_ROTATE_CTA });
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

  it('first tap shows confirm + Cancel and does not call rotateInviteToken', async () => {
    const rotateCta = await openShareModalAsGoogleHost();
    expect(rotateCta).toHaveAttribute('aria-describedby');
    expect(screen.getByText(HOST_INVITE_ROTATE_HELPER)).toBeInTheDocument();
    expect(rotateCta.className).toMatch(/min-h-11/);
    expect(rotateCta.className).toMatch(/focus-visible:ring-2/);

    fireEvent.click(rotateCta);

    expect(rotateInviteTokenMock).not.toHaveBeenCalled();
    const confirm = screen.getByRole('button', { name: HOST_INVITE_ROTATE_CONFIRM });
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(confirm).toHaveAttribute('aria-describedby');
    const helperId = confirm.getAttribute('aria-describedby');
    expect(document.getElementById(helperId)).toHaveTextContent(HOST_INVITE_ROTATE_HELPER);
    await waitFor(() => {
      expect(document.activeElement).toBe(cancel);
    });
  });

  it('Cancel restores the initial CTA and returns focus to it', async () => {
    const rotateCta = await openShareModalAsGoogleHost();
    fireEvent.click(rotateCta);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    const restoredCta = await screen.findByRole('button', { name: HOST_INVITE_ROTATE_CTA });
    expect(screen.queryByRole('button', { name: HOST_INVITE_ROTATE_CONFIRM })).not.toBeInTheDocument();
    expect(rotateInviteTokenMock).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(document.activeElement).toBe(restoredCta);
    });
  });

  it('Escape restores the initial CTA and returns focus to it', async () => {
    const rotateCta = await openShareModalAsGoogleHost();
    fireEvent.click(rotateCta);
    expect(screen.getByRole('button', { name: HOST_INVITE_ROTATE_CONFIRM })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    const restoredCta = await screen.findByRole('button', { name: HOST_INVITE_ROTATE_CTA });
    expect(screen.queryByRole('button', { name: HOST_INVITE_ROTATE_CONFIRM })).not.toBeInTheDocument();
    expect(rotateInviteTokenMock).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(document.activeElement).toBe(restoredCta);
    });
  });

  it('confirm calls rotate once, shows done text, updates the link, and focuses Copy', async () => {
    const rotateCta = await openShareModalAsGoogleHost();
    fireEvent.click(rotateCta);

    const confirm = screen.getByRole('button', { name: HOST_INVITE_ROTATE_CONFIRM });
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    await waitFor(() => expect(rotateInviteTokenMock).toHaveBeenCalledTimes(1));
    expect(rotateInviteTokenMock).toHaveBeenCalledWith({ name: 'test-db' }, PARTY_ID);

    await waitFor(() => {
      expect(screen.getByDisplayValue(new RegExp(`#t=${NEW_TOKEN}`))).toBeInTheDocument();
    });
    const done = screen.getByRole('status');
    expect(done).toHaveAttribute('aria-live', 'polite');
    expect(done).toHaveTextContent(HOST_INVITE_ROTATE_DONE);

    const copyButton = screen.getByRole('button', { name: 'Copy' });
    await waitFor(() => {
      expect(document.activeElement).toBe(copyButton);
    });
  });

  it('failure shows rotate_failed with Try again, keeps the old link, and retry rotates again', async () => {
    rotateInviteTokenMock
      .mockRejectedValueOnce(new Error('rotate failed'))
      .mockResolvedValueOnce(NEW_TOKEN);

    const rotateCta = await openShareModalAsGoogleHost();
    fireEvent.click(rotateCta);
    fireEvent.click(screen.getByRole('button', { name: HOST_INVITE_ROTATE_CONFIRM }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(HOST_INVITE_ROTATE_FAILED);
    expect(screen.getByRole('button', { name: HOST_INVITE_ROTATE_RETRY })).toBeInTheDocument();
    const oldLinkField = screen.getByDisplayValue(new RegExp(`#t=${OLD_TOKEN}`));
    expect(oldLinkField).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeEnabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: HOST_INVITE_ROTATE_RETRY }));

    await waitFor(() => expect(rotateInviteTokenMock).toHaveBeenCalledTimes(2));
    await waitFor(() => {
      expect(screen.getByDisplayValue(new RegExp(`#t=${NEW_TOKEN}`))).toBeInTheDocument();
    });
    expect(screen.getByRole('status')).toHaveTextContent(HOST_INVITE_ROTATE_DONE);
  });

  it('invite token load failure shows load_failed alert and Try again re-fetches', async () => {
    ensureInviteTokenMock
      .mockRejectedValueOnce(new Error('load failed'))
      .mockResolvedValueOnce(OLD_TOKEN);

    useAuthMock.mockReturnValue({ user: hostUser() });
    render(<PartyLobby partyId={PARTY_ID} onStartGame={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Share Link/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(HOST_INVITE_LOAD_FAILED);
    const retry = screen.getByRole('button', { name: HOST_INVITE_ROTATE_RETRY });
    expect(retry.className).toMatch(/min-h-11/);
    expect(screen.getByRole('button', { name: 'Copy' })).toBeDisabled();
    expect(ensureInviteTokenMock).toHaveBeenCalledTimes(1);

    fireEvent.click(retry);

    await waitFor(() => {
      expect(screen.getByDisplayValue(new RegExp(`#t=${OLD_TOKEN}`))).toBeInTheDocument();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(ensureInviteTokenMock).toHaveBeenCalledTimes(2);
  });

  it('share link field is named by the modal title, described by the intro, and shows the full URL', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    await openShareModalAsGoogleHost();

    const expectedLink = buildPartyShareLink(window.location.origin, PARTY_ID, OLD_TOKEN);
    const linkField = screen.getByRole('textbox', { name: 'Share Party Link' });
    expect(linkField.tagName).toBe('TEXTAREA');
    expect(linkField).toHaveValue(expectedLink);
    expect(linkField.className).toMatch(/break-all/);
    expect(linkField).not.toHaveClass('truncate');

    const labelledBy = linkField.getAttribute('aria-labelledby');
    expect(document.getElementById(labelledBy)).toHaveTextContent('Share Party Link');
    const describedBy = linkField.getAttribute('aria-describedby');
    expect(document.getElementById(describedBy)).toHaveTextContent(
      'Share this link with friends to let them join your party. Anyone with the link can join!',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(expectedLink);
    });
    expect(expectedLink).toContain(`#t=${OLD_TOKEN}`);
  });

  it('after rotate the full new URL is visible and different from the old link', async () => {
    const rotateCta = await openShareModalAsGoogleHost();
    const oldLink = buildPartyShareLink(window.location.origin, PARTY_ID, OLD_TOKEN);
    const newLink = buildPartyShareLink(window.location.origin, PARTY_ID, NEW_TOKEN);
    expect(oldLink).not.toBe(newLink);

    fireEvent.click(rotateCta);
    fireEvent.click(screen.getByRole('button', { name: HOST_INVITE_ROTATE_CONFIRM }));

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Share Party Link' })).toHaveValue(newLink);
    });
    expect(screen.queryByDisplayValue(oldLink)).not.toBeInTheDocument();
  });
});
