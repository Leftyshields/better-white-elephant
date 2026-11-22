/**
 * API Client Utilities
 */
import { auth } from './firebase.js';
import { SERVER_URL } from './config.js';

/**
 * Make authenticated API request.
 * A failed response throws an Error with `status` (the HTTP code). A non-JSON error body (for
 * example a proxy's HTML 502 page) is still a normal error, not a parse crash.
 * Pass `timeoutMs` to give up after that long: the request is aborted and the Error has
 * `timedOut: true` and `status: 0`.
 */
export async function apiRequest(endpoint, options = {}) {
  const { timeoutMs, ...fetchOptions } = options;
  const controller = timeoutMs ? new AbortController() : null;

  const run = async () => {
    const token = await auth.currentUser?.getIdToken();

    const response = await fetch(`${SERVER_URL}${endpoint}`, {
      ...fetchOptions,
      ...(controller && { signal: controller.signal }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...fetchOptions.headers,
      },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      let body = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = null;
      }
      const error = new Error(body?.message || body?.error || 'API request failed');
      error.status = response.status;
      if (body?.code) error.code = body.code;
      throw error;
    }

    return response.json();
  };

  if (!controller) return run();

  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(Object.assign(new Error('API request timed out'), { status: 0, timedOut: true }));
    }, timeoutMs);
  });
  try {
    return await Promise.race([run(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Scrape gift URL
 */
export async function scrapeGiftUrl(url) {
  return apiRequest('/api/game/scrape', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
}

/**
 * Fetch winner shipping address for the assigned sender (gift submitter) after game end.
 */
export async function fetchWinnerShippingAddress(partyId, giftId, { timeoutMs } = {}) {
  if (!partyId || !giftId) {
    throw new Error('partyId and giftId are required');
  }
  return apiRequest(`/api/game/winner-shipping-address/${encodeURIComponent(partyId)}/${encodeURIComponent(giftId)}`, {
    method: 'GET',
    timeoutMs,
  });
}



/**
 * Per-game shipping address (A0): the signed-in player's own address for this party.
 * Resolves { shippingAddress } (null when none).
 */
export async function fetchMyPartyShipping(partyId) {
  return apiRequest(`/api/party-shipping/${encodeURIComponent(partyId)}`, { method: 'GET' });
}

/**
 * Save all six fields, or pass all six empty to delete. Resolves { shippingAddress } (null after delete).
 */
export async function saveMyPartyShipping(partyId, address) {
  return apiRequest(`/api/party-shipping/${encodeURIComponent(partyId)}`, {
    method: 'POST',
    body: JSON.stringify({ address }),
  });
}

/**
 * Party code routes (item 10). Returns { ok, status, body } instead of throwing, so the caller
 * can tell "full" (409 after a valid match) from the one generic failure.
 */
export async function postPartyCode(route, body) {
  try {
    const token = await auth.currentUser?.getIdToken();
    const response = await fetch(`${SERVER_URL}/api/party-code/${route}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const json = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body: json };
  } catch {
    return { ok: false, status: 0, body: {} };
  }
}
