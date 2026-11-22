/**
 * Per-game shipping address (A0). One doc per seated player: parties/{partyId}/shipping/{uid}.
 *
 * Clients never touch that path (firestore.rules deny all). The owner saves, reads and clears it
 * only through server/routes/party-shipping.js; the assigned giver reads it only through
 * GET /api/game/winner-shipping-address (server/utils/winner-shipping-address.js).
 *
 * The doc existing (with savedAt) means the owner shared it: saving is the consent, there is no
 * separate checkbox or stamp. Clearing every field deletes the doc.
 *
 * Logs carry ids and status only, never address fields.
 */
import { FieldValue } from 'firebase-admin/firestore';

export const SHIPPING_FIELD_LIMITS = Object.freeze({
  name: 100,
  street: 200,
  city: 100,
  state: 50,
  zip: 20,
  country: 60,
});
const SHIPPING_FIELDS = Object.keys(SHIPPING_FIELD_LIMITS);

const PARTY_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** ENDED games accept saves for 30 days, matching retention (dataRetentionCleanup deletes after). */
export const SHIPPING_ENDED_WINDOW_MS = 30 * MS_PER_DAY;
const OPEN_STATUSES = new Set(['LOBBY', 'ACTIVE', 'ENDED']);

/** Per uid, fixed 60s window, kept in Redis (Upstash). */
export const SHIPPING_RATE_LIMITS = Object.freeze({ read: 30, write: 10 });
const RATE_WINDOW_SECONDS = 60;

export function shippingDocRef(db, partyId, uid) {
  return db.collection('parties').doc(partyId).collection('shipping').doc(uid);
}

function toMillis(ts) {
  if (ts == null) return null;
  if (typeof ts === 'number') return ts;
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  return null;
}

/** Address fields only, for responses. Never returns savedAt or anything else on the doc. */
export function pickStoredShipping(data) {
  if (!data || typeof data !== 'object') return null;
  const picked = {};
  for (const key of SHIPPING_FIELDS) {
    if (typeof data[key] === 'string' && data[key].trim()) {
      picked[key] = data[key].trim();
    }
  }
  return picked.street && picked.city ? picked : null;
}

/**
 * Strict body check. Body must be exactly { address: {...} }. Every address key must be one of the
 * six fields and a string under its cap. All six filled = save; all six empty = clear.
 * @returns {{ ok: true, action: 'save', address: object } | { ok: true, action: 'clear' } | { ok: false }}
 */
export function parseShippingBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false };
  const topKeys = Object.keys(body);
  if (topKeys.length !== 1 || topKeys[0] !== 'address') return { ok: false };
  const raw = body.address;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false };
  const address = {};
  for (const key of Object.keys(raw)) {
    if (!Object.hasOwn(SHIPPING_FIELD_LIMITS, key)) return { ok: false };
    const value = raw[key];
    if (typeof value !== 'string') return { ok: false };
    const trimmed = value.trim();
    if (trimmed.length > SHIPPING_FIELD_LIMITS[key]) return { ok: false };
    address[key] = trimmed;
  }
  const filled = SHIPPING_FIELDS.filter((key) => address[key]);
  if (filled.length === 0) return { ok: true, action: 'clear' };
  if (filled.length !== SHIPPING_FIELDS.length) return { ok: false };
  return { ok: true, action: 'save', address };
}

/** LOBBY and ACTIVE always; ENDED only within 30 days of the end time. Fail closed otherwise. */
export function partyInShippingWindow(party, nowMs) {
  if (!party || !OPEN_STATUSES.has(party.status)) return false;
  if (party.status !== 'ENDED') return true;
  const endedMs = toMillis(party.endedAt ?? party.updatedAt);
  if (endedMs == null) return false;
  return nowMs - endedMs <= SHIPPING_ENDED_WINDOW_MS;
}

/**
 * Fixed-window counter per uid and action. Fails closed: if Redis errors, the request is refused.
 * @returns {Promise<boolean>} true if allowed
 */
export async function allowShippingRequest(redis, uid, action) {
  const key = `rl:shipping:${action}:${uid}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, RATE_WINDOW_SECONDS);
  }
  return count <= SHIPPING_RATE_LIMITS[action];
}

/**
 * Shared gate: signed in, valid party id, rate limit, party in window, caller seated (GOING).
 * @returns {Promise<{ status: number, error?: string }|null>} null when the caller may proceed
 */
async function gate(db, redis, { uid, partyId, action, nowMs }) {
  if (!uid) return { status: 401, error: 'Authentication required' };
  if (typeof partyId !== 'string' || !PARTY_ID_RE.test(partyId)) {
    return { status: 400, error: 'Valid partyId is required' };
  }
  let allowed;
  try {
    allowed = await allowShippingRequest(redis, uid, action);
  } catch {
    return { status: 503, error: 'Try again later' };
  }
  if (!allowed) return { status: 429, error: 'Too many requests' };

  const partySnap = await db.collection('parties').doc(partyId).get();
  if (!partySnap.exists) return { status: 404, error: 'Party not found' };
  if (!partyInShippingWindow(partySnap.data(), nowMs)) {
    return { status: 403, error: 'Party is not accepting addresses' };
  }
  const seat = await db.collection('parties').doc(partyId).collection('participants').doc(uid).get();
  if (!seat.exists || seat.data()?.status !== 'GOING') {
    return { status: 403, error: 'You are not a participant in this party' };
  }
  return null;
}

/** Owner reads only their own doc. 200 { shippingAddress: null } when none. */
export async function readOwnShipping(db, redis, { uid, partyId, nowMs = Date.now() }) {
  const denied = await gate(db, redis, { uid, partyId, action: 'read', nowMs });
  if (denied) return denied;
  const snap = await shippingDocRef(db, partyId, uid).get();
  return { status: 200, shippingAddress: snap.exists ? pickStoredShipping(snap.data()) : null };
}

/** Save (all six fields) or clear (all six empty, deletes the doc). savedAt is server time. */
export async function writeOwnShipping(db, redis, { uid, partyId, body, nowMs = Date.now() }) {
  const denied = await gate(db, redis, { uid, partyId, action: 'write', nowMs });
  if (denied) return denied;
  const parsed = parseShippingBody(body);
  if (!parsed.ok) return { status: 400, error: 'Invalid address' };
  const ref = shippingDocRef(db, partyId, uid);
  if (parsed.action === 'clear') {
    await ref.delete();
    return { status: 200, shippingAddress: null };
  }
  await ref.set({ ...parsed.address, savedAt: FieldValue.serverTimestamp() });
  return { status: 200, shippingAddress: parsed.address };
}
