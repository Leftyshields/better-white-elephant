/**
 * Host share box (party-code spec section 4, Rev 4): code XXXX-XXXX and link, each with Copy;
 * server-backed rotate replaces both together with confirm, Cancel, Escape, failure and retry.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PartyShareModal } from '../../components/PartyShareModal.jsx';
import { buildPartyShareLink } from '../../utils/partyInvite.js';
import {
  HOST_INVITE_ROTATE_CONFIRM,
  HOST_INVITE_ROTATE_CTA,
  HOST_INVITE_ROTATE_DONE,
  HOST_INVITE_ROTATE_FAILED,
  HOST_INVITE_ROTATE_HELPER,
  HOST_INVITE_ROTATE_RETRY,
  HOST_SHARE_LOAD_FAILED,
  PARTY_INVITE_COPY,
} from '../../utils/partyInviteCopy.js';

const PARTY_ID = 'party-share-test';
const OLD = { code: 'KX7P4MRB', token: 'a'.repeat(32) };
const NEW = { code: 'ABCDEFGH', token: 'b'.repeat(32) };

const postPartyCodeMock = vi.fn();
vi.mock('../../utils/api.js', () => ({
  postPartyCode: (...args) => postPartyCodeMock(...args),
}));

function ok(body) {
  return { ok: true, status: 200, body };
}

function renderModal(props = {}) {
  return render(<PartyShareModal isOpen onClose={vi.fn()} partyId={PARTY_ID} isGoogleHost {...props} />);
}

describe('PartyShareModal', () => {
  beforeEach(() => {
    postPartyCodeMock.mockReset();
    postPartyCodeMock.mockImplementation(async (route) => (route === 'share' ? ok(OLD) : ok(NEW)));
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  it('shows the code as XXXX-XXXX on one line in 32px monospace, and the full link', async () => {
    renderModal();
    const code = await screen.findByTestId('share-party-code');
    await waitFor(() => expect(code).toHaveTextContent('KX7P-4MRB'));
    expect(code.className).toMatch(/font-mono/);
    expect(code.className).toMatch(/text-\[32px\]/);
    expect(code.className).toMatch(/whitespace-nowrap/);
    expect(code.className).toMatch(/tracking-\[0\.1em\]/);
    const link = screen.getByRole('textbox', { name: PARTY_INVITE_COPY['host.share.title'] });
    expect(link).toHaveValue(buildPartyShareLink(window.location.origin, PARTY_ID, OLD.token));
    expect(postPartyCodeMock).toHaveBeenCalledWith('share', { partyId: PARTY_ID });
  });

  it('copies the code and the link separately, announcing the code copy', async () => {
    renderModal();
    await screen.findByText('KX7P-4MRB');
    fireEvent.click(screen.getByRole('button', { name: PARTY_INVITE_COPY['host.share.code.copy_name'] }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('KX7P-4MRB'));
    expect(await screen.findByText(PARTY_INVITE_COPY['host.share.code.copy_status'])).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: PARTY_INVITE_COPY['host.share.link.copy_name'] }));
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith(
        buildPartyShareLink(window.location.origin, PARTY_ID, OLD.token),
      ),
    );
  });

  it('shows the load_failed alert when the share route fails', async () => {
    postPartyCodeMock.mockResolvedValue({ ok: false, status: 500, body: {} });
    renderModal();
    expect(await screen.findByRole('alert')).toHaveTextContent(HOST_SHARE_LOAD_FAILED);
    expect(screen.getByRole('button', { name: HOST_INVITE_ROTATE_CTA })).toBeDisabled();
  });

  it('shows rotate only for Google hosts', async () => {
    const { unmount } = renderModal({ isGoogleHost: false });
    await screen.findByText('KX7P-4MRB');
    expect(screen.queryByRole('button', { name: HOST_INVITE_ROTATE_CTA })).toBeNull();
    unmount();
    renderModal();
    expect(await screen.findByRole('button', { name: HOST_INVITE_ROTATE_CTA })).toBeInTheDocument();
    expect(screen.getByText(HOST_INVITE_ROTATE_HELPER)).toBeInTheDocument();
  });

  it('first tap confirms; Cancel and Escape restore the CTA without rotating', async () => {
    renderModal();
    await screen.findByText('KX7P-4MRB');
    fireEvent.click(screen.getByRole('button', { name: HOST_INVITE_ROTATE_CTA }));
    expect(screen.getByRole('button', { name: HOST_INVITE_ROTATE_CONFIRM })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.getByRole('button', { name: HOST_INVITE_ROTATE_CTA })).toHaveFocus());
    fireEvent.click(screen.getByRole('button', { name: HOST_INVITE_ROTATE_CTA }));
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.getByRole('button', { name: HOST_INVITE_ROTATE_CTA })).toHaveFocus());
    expect(postPartyCodeMock).not.toHaveBeenCalledWith('rotate', expect.anything());
  });

  it('confirm replaces code and link together, shows done, and focuses Copy code', async () => {
    renderModal();
    await screen.findByText('KX7P-4MRB');
    fireEvent.click(screen.getByRole('button', { name: HOST_INVITE_ROTATE_CTA }));
    fireEvent.click(screen.getByRole('button', { name: HOST_INVITE_ROTATE_CONFIRM }));
    expect(await screen.findByText(HOST_INVITE_ROTATE_DONE)).toBeInTheDocument();
    expect(screen.getByTestId('share-party-code')).toHaveTextContent('ABCD-EFGH');
    expect(screen.getByRole('textbox')).toHaveValue(buildPartyShareLink(window.location.origin, PARTY_ID, NEW.token));
    expect(screen.getByRole('button', { name: PARTY_INVITE_COPY['host.share.code.copy_name'] })).toHaveFocus();
    expect(postPartyCodeMock.mock.calls.filter(([r]) => r === 'rotate')).toHaveLength(1);
  });

  it('failure keeps the old code and link and Try again rotates again', async () => {
    postPartyCodeMock.mockImplementation(async (route) =>
      route === 'share' ? ok(OLD) : { ok: false, status: 500, body: {} },
    );
    renderModal();
    await screen.findByText('KX7P-4MRB');
    fireEvent.click(screen.getByRole('button', { name: HOST_INVITE_ROTATE_CTA }));
    fireEvent.click(screen.getByRole('button', { name: HOST_INVITE_ROTATE_CONFIRM }));
    expect(await screen.findByText(HOST_INVITE_ROTATE_FAILED)).toBeInTheDocument();
    expect(screen.getByTestId('share-party-code')).toHaveTextContent('KX7P-4MRB');
    postPartyCodeMock.mockImplementation(async (route) => (route === 'share' ? ok(OLD) : ok(NEW)));
    fireEvent.click(screen.getByRole('button', { name: HOST_INVITE_ROTATE_RETRY }));
    expect(await screen.findByText(HOST_INVITE_ROTATE_DONE)).toBeInTheDocument();
    expect(screen.getByTestId('share-party-code')).toHaveTextContent('ABCD-EFGH');
  });
});
