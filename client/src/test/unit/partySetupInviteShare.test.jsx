/**
 * Setup step 2 (Add participants): host sees an inline party code and copy buttons;
 * guests do not. Copy, Copied revert, failure, and step completion are unchanged.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PartyLobby } from '../../components/PartyLobby.jsx';
import { PartySetupInviteShare } from '../../components/PartySetupInviteShare.jsx';
import { buildPartyShareLink } from '../../utils/partyInvite.js';
import {
  HOST_INVITE_ROTATE_CTA,
  HOST_SHARE_LOAD_FAILED,
  PARTY_INVITE_COPY,
  SETUP_INVITE_INTRO,
} from '../../utils/partyInviteCopy.js';

const HOST_UID = 'host-uid';
const GUEST_UID = 'guest-uid';
const PARTY_ID = 'party-setup-share-test';
const SHARE = { code: 'KX7P4MRB', token: 'a'.repeat(32) };

const useAuthMock = vi.fn();
const usePartyMock = vi.fn();
const apiRequestMock = vi.fn();
const postPartyCodeMock = vi.fn();

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
  postPartyCode: (...args) => postPartyCodeMock(...args),
}));

vi.mock('../../utils/firebase.js', () => ({
  db: {},
}));

vi.mock('firebase/firestore', () => {
  const emptyDoc = { exists: false, data: () => ({}) };
  return {
    collection: vi.fn(),
    doc: vi.fn(() => ({
      get: vi.fn().mockResolvedValue(emptyDoc),
      set: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    })),
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

function hostParty({ participants, pendingInvites = [] }) {
  return {
    party: {
      id: PARTY_ID,
      adminId: HOST_UID,
      status: 'LOBBY',
      title: 'Holiday Swap',
      config: { maxSteals: 3 },
      date: { toDate: () => new Date('2026-12-01') },
    },
    participants,
    pendingInvites,
    gifts: [],
    loading: false,
    error: null,
  };
}

function renderHostLobby(participants) {
  useAuthMock.mockReturnValue({
    user: { uid: HOST_UID, displayName: 'Host', getIdToken: vi.fn() },
  });
  usePartyMock.mockReturnValue(hostParty({ participants }));
  apiRequestMock.mockResolvedValue({ users: {} });
  return render(<PartyLobby partyId={PARTY_ID} onStartGame={vi.fn()} />);
}

describe('PartyLobby setup invite share', () => {
  beforeEach(() => {
    postPartyCodeMock.mockReset();
    postPartyCodeMock.mockResolvedValue({ ok: true, status: 200, body: SHARE });
    apiRequestMock.mockReset();
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  it('shows the intro, formatted code, and both copy buttons to the host in Add participants', async () => {
    renderHostLobby([{ id: HOST_UID, status: 'GOING', ready: false }]);

    expect(await screen.findByTestId('setup-invite-share')).toBeInTheDocument();
    expect(screen.getByText(SETUP_INVITE_INTRO)).toBeInTheDocument();
    const code = screen.getByTestId('setup-invite-code');
    expect(code).toHaveTextContent('KX7P-4MRB');
    expect(code.className).toMatch(/font-mono/);
    expect(code.className).toMatch(/text-\[20px\]/);
    expect(screen.getByRole('button', { name: PARTY_INVITE_COPY['host.share.link.copy_name'] })).toHaveTextContent(
      PARTY_INVITE_COPY['host.share.link.copy'],
    );
    expect(screen.getByRole('button', { name: PARTY_INVITE_COPY['host.share.code.copy_name'] })).toHaveTextContent(
      PARTY_INVITE_COPY['host.share.code.copy'],
    );
    expect(screen.getByRole('button', { name: 'Add Person' })).toBeInTheDocument();
    expect(postPartyCodeMock).toHaveBeenCalledWith('share', { partyId: PARTY_ID });
  });

  it('does not show the inline share block to a guest', async () => {
    useAuthMock.mockReturnValue({
      user: { uid: GUEST_UID, displayName: 'Guest', isAnonymous: true, providerData: [], getIdToken: vi.fn() },
    });
    usePartyMock.mockReturnValue({
      party: {
        id: PARTY_ID,
        adminId: HOST_UID,
        status: 'LOBBY',
        title: 'Holiday Swap',
        config: { maxSteals: 3 },
        date: { toDate: () => new Date('2026-12-01') },
      },
      participants: [
        { id: HOST_UID, status: 'GOING', ready: false },
        { id: GUEST_UID, status: 'GOING', ready: false },
      ],
      pendingInvites: [],
      gifts: [],
      loading: false,
      error: null,
    });
    render(<PartyLobby partyId={PARTY_ID} onStartGame={vi.fn()} />);

    await waitFor(() => {
      expect(screen.queryByText('Loading party lobby...')).not.toBeInTheDocument();
    });
    expect(screen.queryByTestId('setup-invite-share')).toBeNull();
    expect(screen.queryByText(SETUP_INVITE_INTRO)).toBeNull();
    expect(screen.queryByText('KX7P-4MRB')).toBeNull();
    expect(screen.queryByRole('button', { name: PARTY_INVITE_COPY['host.share.link.copy_name'] })).toBeNull();
    expect(postPartyCodeMock).not.toHaveBeenCalled();
  });

  it('does not count the share block toward Add participants completion', async () => {
    renderHostLobby([{ id: HOST_UID, status: 'GOING', ready: false }]);
    expect(await screen.findByText('1 of 4 complete')).toBeInTheDocument();
    expect(screen.getByText(/You need at least 2 players to start. You have 1/)).toBeInTheDocument();
  });

  it('still marks Add participants complete when a second person is present', async () => {
    renderHostLobby([
      { id: HOST_UID, status: 'GOING', ready: false },
      { id: GUEST_UID, status: 'GOING', ready: false },
    ]);
    expect(await screen.findByText('2 of 4 complete')).toBeInTheDocument();
  });

  it('keeps the banner Share Link, and does not put make-a-new-code on the inline block', async () => {
    renderHostLobby([{ id: HOST_UID, status: 'GOING', ready: false }]);
    const shareBlock = await screen.findByTestId('setup-invite-share');
    expect(screen.getByRole('button', { name: 'Share Link' })).toBeInTheDocument();
    expect(shareBlock).not.toHaveTextContent(HOST_INVITE_ROTATE_CTA);
    fireEvent.click(screen.getByRole('button', { name: 'Share Link' }));
    expect(await screen.findByTestId('share-party-code')).toHaveTextContent('KX7P-4MRB');
  });

  it('shows the load_failed alert when the share route fails', async () => {
    postPartyCodeMock.mockResolvedValue({ ok: false, status: 500, body: {} });
    renderHostLobby([{ id: HOST_UID, status: 'GOING', ready: false }]);
    expect(await screen.findByRole('alert')).toHaveTextContent(HOST_SHARE_LOAD_FAILED);
    expect(screen.getByRole('button', { name: PARTY_INVITE_COPY['host.share.link.copy_name'] })).toBeDisabled();
    expect(screen.getByRole('button', { name: PARTY_INVITE_COPY['host.share.code.copy_name'] })).toBeDisabled();
  });
});

describe('PartySetupInviteShare copy actions', () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  it('copies the link and the code, announcing each on a polite live region', async () => {
    render(
      <PartySetupInviteShare
        invite={SHARE}
        loadFailed={false}
        link={buildPartyShareLink(window.location.origin, PARTY_ID, SHARE.token)}
      />,
    );
    const expectedLink = buildPartyShareLink(window.location.origin, PARTY_ID, SHARE.token);
    fireEvent.click(screen.getByRole('button', { name: PARTY_INVITE_COPY['host.share.link.copy_name'] }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expectedLink));
    const linkBtn = screen.getByRole('button', { name: PARTY_INVITE_COPY['host.share.link.copy_name'] });
    expect(linkBtn).toHaveTextContent(PARTY_INVITE_COPY['host.share.link.copy_done']);
    expect(linkBtn).toHaveTextContent('✓');
    expect(screen.getByText(PARTY_INVITE_COPY['host.share.link.copy_status'])).toHaveAttribute('aria-live', 'polite');

    fireEvent.click(screen.getByRole('button', { name: PARTY_INVITE_COPY['host.share.code.copy_name'] }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('KX7P-4MRB'));
    expect(screen.getByRole('button', { name: PARTY_INVITE_COPY['host.share.code.copy_name'] })).toHaveTextContent(
      PARTY_INVITE_COPY['host.share.code.copy_done'],
    );
    expect(screen.getByText(PARTY_INVITE_COPY['host.share.code.copy_status'])).toHaveAttribute('aria-live', 'polite');
  });

  it('Copied! reverts after 2 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(
        <PartySetupInviteShare
          invite={SHARE}
          loadFailed={false}
          link={buildPartyShareLink(window.location.origin, PARTY_ID, SHARE.token)}
        />,
      );
      const btn = screen.getByRole('button', { name: PARTY_INVITE_COPY['host.share.link.copy_name'] });
      fireEvent.click(btn);
      await waitFor(() => expect(btn).toHaveTextContent(PARTY_INVITE_COPY['host.share.link.copy_done']));
      await act(async () => {
        vi.advanceTimersByTime(2100);
      });
      await waitFor(() => expect(btn).toHaveTextContent(PARTY_INVITE_COPY['host.share.link.copy']));
    } finally {
      vi.useRealTimers();
    }
  });

  it('when copy fails: no Copied!, the visible code is selected, and the fallback line shows', async () => {
    navigator.clipboard.writeText = vi.fn().mockRejectedValue(new Error('denied'));
    const originalExec = document.execCommand;
    document.execCommand = vi.fn(() => false);
    try {
      render(
        <PartySetupInviteShare
          invite={SHARE}
          loadFailed={false}
          link={buildPartyShareLink(window.location.origin, PARTY_ID, SHARE.token)}
        />,
      );
      const codeBtn = screen.getByRole('button', { name: PARTY_INVITE_COPY['host.share.code.copy_name'] });
      fireEvent.click(codeBtn);
      const fallback = await screen.findByTestId('setup-code-copy-failed');
      await waitFor(() => expect(fallback).toHaveTextContent(PARTY_INVITE_COPY['host.share.copy_failed']));
      expect(fallback).toHaveAttribute('aria-live', 'polite');
      expect(codeBtn).toHaveTextContent(PARTY_INVITE_COPY['host.share.code.copy']);
      expect(window.getSelection().toString()).toBe('KX7P-4MRB');

      const linkBtn = screen.getByRole('button', { name: PARTY_INVITE_COPY['host.share.link.copy_name'] });
      fireEvent.click(linkBtn);
      const linkFallback = await screen.findByTestId('setup-link-copy-failed');
      await waitFor(() => expect(linkFallback).toHaveTextContent(PARTY_INVITE_COPY['host.share.copy_failed']));
      expect(linkBtn).toHaveTextContent(PARTY_INVITE_COPY['host.share.link.copy']);
    } finally {
      document.execCommand = originalExec;
    }
  });
});
