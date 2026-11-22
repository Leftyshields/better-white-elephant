/**
 * G5: the sender's "What You Need to Send" address card tells the truth in every state.
 * Real api.js against a stubbed fetch, fake timers for the 8s timeout and the 30s recheck.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

vi.mock('../../utils/firebase.js', () => ({
  auth: { currentUser: { getIdToken: async () => 'test-token' } },
}));

import {
  GiftToSendCard,
  ADDRESS_TIMEOUT_MS,
  ADDRESS_POLL_MS,
  ADDRESS_POLL_WINDOW_MS,
} from '../../components/GiftToSendCard.jsx';
import { apiRequest } from '../../utils/api.js';
import { GIFT_TO_SEND_COPY } from '../../utils/giftToSendCopy.js';
import { SHIPPING_ADDRESS_WINNER_NOT_SHARED_GIFT_TO_SEND } from '../../utils/shippingAddressCopy.js';

const gift = { id: 'gift-1', partyId: 'party-1', title: 'Board game' };
// Made-up test address, never real data.
const ADDRESS = { name: 'Test Winner', street: '1 Example St', city: 'Testville', state: 'CA', zip: '00000', country: 'US' };

const json = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});
const html502 = () => ({ ok: false, status: 502, json: async () => { throw new SyntaxError('Unexpected token <'); }, text: async () => '<html>Bad Gateway</html>' });
const never = () => new Promise(() => {});

let fetchMock;
const flush = async (ms = 0) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
const renderCard = (props = {}) =>
  render(<GiftToSendCard gift={gift} winnerId="winner-1" winnerName="Alex" winnerKnown {...props} />);

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});

const notSharedLine = () => screen.queryByText(SHIPPING_ADDRESS_WINNER_NOT_SHARED_GIFT_TO_SEND);

describe('GiftToSendCard address states (G5)', () => {
  it('shows the skeleton with a hidden loading label, then the address', async () => {
    let resolve;
    fetchMock.mockReturnValue(new Promise((r) => { resolve = r; }));
    renderCard();
    expect(screen.getByTestId('gift-to-send-address-loading')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText(GIFT_TO_SEND_COPY.addressLoading)).toHaveClass('sr-only');
    expect(screen.queryByText('Loading address...')).toBeNull();
    resolve(json(200, { shippingAddress: ADDRESS }));
    await flush();
    expect(screen.getByText('1 Example St')).toBeInTheDocument();
    expect(screen.getByText('Winner:')).toBeInTheDocument();
  });

  it.each([
    ['a server error (500)', () => json(500, { error: 'Failed to fetch shipping address' })],
    ['a denial (403)', () => json(403, { error: 'Only the assigned sender can view this address' })],
    ['a proxy HTML page (502)', html502],
    ['a network failure', () => Promise.reject(new TypeError('Failed to fetch'))],
  ])('shows the load error with Try again on %s, never "hasn\'t shared"', async (_label, reply) => {
    fetchMock.mockImplementation(reply);
    renderCard();
    await flush();
    expect(screen.getByText(GIFT_TO_SEND_COPY.addressLoadFailed)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: GIFT_TO_SEND_COPY.addressRetryAria })).toHaveTextContent(GIFT_TO_SEND_COPY.addressRetry);
    expect(notSharedLine()).toBeNull();
  });

  it('a hung request shows the skeleton, then the error at 8s (not before)', async () => {
    fetchMock.mockImplementation(never);
    renderCard();
    await flush(ADDRESS_TIMEOUT_MS - 1);
    expect(screen.getByTestId('gift-to-send-address-loading')).toBeInTheDocument();
    await flush(1);
    expect(screen.getByText(GIFT_TO_SEND_COPY.addressLoadFailed)).toBeInTheDocument();
    // The request was really aborted, not just ignored.
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it('Try again reloads: skeleton, then the address', async () => {
    fetchMock.mockImplementationOnce(() => json(500, {})).mockImplementationOnce(() => json(200, { shippingAddress: ADDRESS }));
    renderCard();
    await flush();
    fireEvent.click(screen.getByRole('button', { name: GIFT_TO_SEND_COPY.addressRetryAria }));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText('1 Example St')).toBeInTheDocument();
    expect(screen.queryByText(GIFT_TO_SEND_COPY.addressLoadFailed)).toBeNull();
  });

  it('not shared yet: says so, then shows the address within 30s with no reload and no skeleton', async () => {
    fetchMock.mockImplementationOnce(() => json(200, { shippingAddress: null }));
    renderCard();
    await flush();
    expect(notSharedLine()).toBeInTheDocument();
    expect(screen.getByText(GIFT_TO_SEND_COPY.addressWillUpdate)).toBeInTheDocument();

    let resolve;
    fetchMock.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    await flush(ADDRESS_POLL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Background recheck in flight: the honest last answer stays, no skeleton.
    expect(screen.queryByTestId('gift-to-send-address-loading')).toBeNull();
    expect(notSharedLine()).toBeInTheDocument();
    resolve(json(200, { shippingAddress: ADDRESS }));
    await flush();
    expect(screen.getByText('1 Example St')).toBeInTheDocument();
    // Address arrived: polling stops.
    await flush(ADDRESS_POLL_MS * 3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('a failed background recheck keeps "not shared yet" and keeps checking', async () => {
    fetchMock
      .mockImplementationOnce(() => json(200, { shippingAddress: null }))
      .mockImplementationOnce(() => json(500, {}))
      .mockImplementationOnce(() => json(200, { shippingAddress: ADDRESS }));
    renderCard();
    await flush();
    await flush(ADDRESS_POLL_MS);
    expect(notSharedLine()).toBeInTheDocument();
    expect(screen.queryByText(GIFT_TO_SEND_COPY.addressLoadFailed)).toBeNull();
    await flush(ADDRESS_POLL_MS);
    expect(screen.getByText('1 Example St')).toBeInTheDocument();
  });

  it('stops the 30s rechecks after 10 minutes, but coming back to the tab still checks', async () => {
    fetchMock.mockImplementation(() => json(200, { shippingAddress: null }));
    renderCard();
    await flush();
    await flush(ADDRESS_POLL_WINDOW_MS + ADDRESS_POLL_MS * 4);
    const callsAtWindowEnd = fetchMock.mock.calls.length;
    expect(callsAtWindowEnd).toBe(1 + ADDRESS_POLL_WINDOW_MS / ADDRESS_POLL_MS);
    await flush(ADDRESS_POLL_MS * 4);
    expect(fetchMock).toHaveBeenCalledTimes(callsAtWindowEnd);

    fetchMock.mockImplementation(() => json(200, { shippingAddress: ADDRESS }));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(callsAtWindowEnd + 1);
    expect(screen.getByText('1 Example St')).toBeInTheDocument();
  });

  it('does not recheck on tab focus while the error shows (Try again is the way out)', async () => {
    fetchMock.mockImplementation(() => json(500, {}));
    renderCard();
    await flush();
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await flush(ADDRESS_POLL_MS * 2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('no winner: one honest line, no "Winner" row, no address block, no request', async () => {
    renderCard({ winnerId: null, winnerName: null });
    await flush(ADDRESS_TIMEOUT_MS);
    expect(screen.getByTestId('gift-to-send-no-winner')).toHaveTextContent(GIFT_TO_SEND_COPY.noWinnerForYourGift);
    expect(screen.queryByText('Winner:')).toBeNull();
    expect(screen.queryByText(/No Winner/)).toBeNull();
    expect(screen.queryByText(/Shipping Address/)).toBeNull();
    expect(notSharedLine()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('winner not known yet (game state loading): waits, never says "no winner", errors at 8s', async () => {
    renderCard({ winnerId: null, winnerName: null, winnerKnown: false });
    expect(screen.getByTestId('gift-to-send-address-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('gift-to-send-no-winner')).toBeNull();
    await flush(ADDRESS_TIMEOUT_MS);
    expect(screen.getByText(GIFT_TO_SEND_COPY.addressLoadFailed)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('when the winner becomes known, it loads the address', async () => {
    fetchMock.mockImplementation(() => json(200, { shippingAddress: ADDRESS }));
    const { rerender } = renderCard({ winnerId: null, winnerName: null, winnerKnown: false });
    rerender(<GiftToSendCard gift={gift} winnerId="winner-1" winnerName="Alex" winnerKnown />);
    await flush();
    expect(screen.getByText('1 Example St')).toBeInTheDocument();
  });

  it('self-win is unchanged: no request, no address block', async () => {
    renderCard({ winnerId: 'me', isSelfWin: true });
    await flush();
    expect(screen.getByText('You won your own gift.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('logs only a status on failure, never the response body or an address', async () => {
    fetchMock.mockImplementation(() => json(500, { error: 'x', message: '1 Example St' }));
    renderCard();
    await flush();
    const logged = JSON.stringify([...console.warn.mock.calls, ...console.error.mock.calls]);
    expect(logged).not.toContain('Example St');
    expect(logged).toContain('500');
  });
});

describe('apiRequest errors and timeout (G5)', () => {
  it('a non-JSON error body becomes an Error with the status (no parse crash)', async () => {
    fetchMock.mockImplementation(html502);
    await expect(apiRequest('/x')).rejects.toMatchObject({ status: 502, message: 'API request failed' });
  });

  it('keeps the server message and status for JSON errors', async () => {
    fetchMock.mockImplementation(() => json(400, { error: 'Bad', message: 'Valid URL is required' }));
    await expect(apiRequest('/x')).rejects.toMatchObject({ status: 400, message: 'Valid URL is required' });
  });

  it('times out only when asked to', async () => {
    fetchMock.mockImplementation(never);
    const timed = apiRequest('/x', { timeoutMs: 100 });
    const assertion = expect(timed).rejects.toMatchObject({ timedOut: true, status: 0 });
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty('timeoutMs');
  });
});

describe('G5 copy', () => {
  it('uses the signed strings verbatim', () => {
    expect(GIFT_TO_SEND_COPY).toEqual({
      addressLoading: "Loading the winner's address",
      addressWillUpdate: 'It will show up here when they add it.',
      addressLoadFailed: "We couldn't load the winner's address.",
      addressRetry: 'Try again',
      addressRetryAria: 'Try loading the address again',
      noWinnerForYourGift: "No one won your gift, so there's nothing to mail.",
    });
  });

  it('the card and end screen no longer carry the false "No Winner" or unsigned fallbacks', () => {
    const src = join(dirname(fileURLToPath(import.meta.url)), '../..');
    const card = readFileSync(join(src, 'components/GiftToSendCard.jsx'), 'utf8');
    const room = readFileSync(join(src, 'pages/GameRoom.jsx'), 'utf8');
    expect(card).not.toContain("hasn't added a shipping address yet");
    expect(card).not.toContain('Loading address...');
    expect(room).not.toContain("'No Winner'");
  });
});
