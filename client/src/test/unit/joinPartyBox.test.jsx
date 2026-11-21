/**
 * Home "Join a party" box (party-code spec Rev 4): one field, normalization, Join only at
 * exactly 8, full-code paste submits once, typing the 8th does not, inline errors, no alert().
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { JoinPartyBox } from '../../components/JoinPartyBox.jsx';
import { PARTY_INVITE_COPY as COPY } from '../../utils/partyInviteCopy.js';

const postPartyCodeMock = vi.fn();
const ensureGuestSession = vi.fn();

vi.mock('../../utils/api.js', () => ({ postPartyCode: (...args) => postPartyCodeMock(...args) }));
vi.mock('../../hooks/useAuth.js', () => ({ useAuth: () => ({ ensureGuestSession }) }));

function renderBox() {
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<JoinPartyBox />} />
        <Route path="/party/:id" element={<p data-testid="party-page">party</p>} />
      </Routes>
    </MemoryRouter>,
  );
  return screen.getByLabelText(COPY['home.join.label']);
}

function paste(input, text) {
  fireEvent.paste(input, { clipboardData: { getData: () => text } });
}

describe('JoinPartyBox', () => {
  beforeEach(() => {
    postPartyCodeMock.mockReset();
    ensureGuestSession.mockReset().mockResolvedValue({ uid: 'anon-1' });
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  it('renders one field with the signed helper, placeholder, maxlength 9 and code-friendly attributes', () => {
    const input = renderBox();
    expect(screen.getByText(COPY['home.join.helper'])).toBeInTheDocument();
    expect(input).toHaveAttribute('placeholder', 'XXXX-XXXX');
    expect(input).toHaveAttribute('maxLength', '9');
    expect(input).toHaveAttribute('autoCapitalize', 'characters');
    expect(input).toHaveAttribute('autoComplete', 'off');
    expect(input).toHaveAttribute('spellCheck', 'false');
    expect(input).toHaveAttribute('enterKeyHint', 'go');
    expect(input.className).toMatch(/text-base/);
  });

  it("formats typed 'abcd efgh' and 'abcd-efgh' as ABCD-EFGH; Join is enabled only at exactly 8", () => {
    const input = renderBox();
    const join = screen.getByRole('button', { name: COPY['home.join.cta'] });
    fireEvent.change(input, { target: { value: 'abcd efg' } });
    expect(input).toHaveValue('ABCD-EFG');
    expect(join).toBeDisabled();
    fireEvent.change(input, { target: { value: 'abcd efgh' } });
    expect(input).toHaveValue('ABCD-EFGH');
    expect(join).toBeEnabled();
    fireEvent.change(input, { target: { value: 'abcd-efgh' } });
    expect(input).toHaveValue('ABCD-EFGH');
  });

  it('typing the 8th character does not submit', async () => {
    const input = renderBox();
    fireEvent.change(input, { target: { value: 'KX7P-4MRB' } });
    await new Promise((r) => setTimeout(r, 20));
    expect(postPartyCodeMock).not.toHaveBeenCalled();
  });

  it('drops excluded characters with the polite hint, never mapping them', () => {
    const input = renderBox();
    fireEvent.change(input, { target: { value: 'kx0p' } });
    expect(input).toHaveValue('KXP');
    expect(screen.getByText(COPY['home.join.hint.excluded'])).toHaveAttribute('aria-live', 'polite');
  });

  it('Enter before 8 characters shows the format error inline (no alert)', () => {
    const input = renderBox();
    fireEvent.change(input, { target: { value: 'KX7P' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByRole('alert')).toHaveTextContent(COPY['home.join.error.format']);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(window.alert).not.toHaveBeenCalled();
  });

  it('a full-code paste with extra characters submits once and goes to the party', async () => {
    postPartyCodeMock.mockResolvedValue({ ok: true, status: 200, body: { partyId: 'p1' } });
    const input = renderBox();
    paste(input, ' kx7p-4mrb!! ');
    expect(await screen.findByTestId('party-page')).toBeInTheDocument();
    expect(ensureGuestSession).toHaveBeenCalledTimes(1);
    expect(postPartyCodeMock).toHaveBeenCalledTimes(1);
    expect(postPartyCodeMock).toHaveBeenCalledWith('join', { code: 'KX7P4MRB' });
  });

  it('a pasted party link is routed as a link and never sent to the resolver', async () => {
    const input = renderBox();
    paste(input, 'https://stealorreveal.com/party/p2');
    expect(await screen.findByTestId('party-page')).toBeInTheDocument();
    expect(postPartyCodeMock).not.toHaveBeenCalled();
  });

  it('shows Checking... and blocks a second submit while the request is in flight', async () => {
    let resolve;
    postPartyCodeMock.mockReturnValue(new Promise((r) => { resolve = r; }));
    const input = renderBox();
    fireEvent.change(input, { target: { value: 'KX7P4MRB' } });
    fireEvent.click(screen.getByRole('button', { name: COPY['home.join.cta'] }));
    expect(await screen.findByText(COPY['home.join.checking'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: COPY['home.join.cta'] })).toBeDisabled();
    fireEvent.submit(input.closest('form'));
    resolve({ ok: false, status: 400, body: { error: 'party_code_failed' } });
    expect(await screen.findByRole('alert')).toHaveTextContent(COPY['home.join.error.generic']);
    expect(postPartyCodeMock).toHaveBeenCalledTimes(1);
    expect(input).toHaveValue('KX7P-4MRB');
  });

  it('every failure shows the same generic error; a full party shows the full error', async () => {
    const input = renderBox();
    fireEvent.change(input, { target: { value: 'KX7P4MRB' } });
    postPartyCodeMock.mockResolvedValueOnce({ ok: false, status: 429, body: { error: 'party_code_failed' } });
    fireEvent.click(screen.getByRole('button', { name: COPY['home.join.cta'] }));
    expect(await screen.findByRole('alert')).toHaveTextContent(COPY['home.join.error.generic']);
    postPartyCodeMock.mockResolvedValueOnce({ ok: false, status: 409, body: { error: 'full' } });
    fireEvent.click(screen.getByRole('button', { name: COPY['home.join.cta'] }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(COPY['home.join.error.full']));
  });
});
