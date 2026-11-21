/**
 * Typed party codes (item 10). Server only.
 *
 * Design (Security-signed rules, A2 waiver until App Check ships):
 * - 8 characters from a 30-symbol alphabet (no 0, O, 1, I, L, U): 30^8 ~= 6.56e11 values, ~39.3 bits.
 *   Each character comes from crypto.randomInt(30), which rejection-samples internally (no modulo bias).
 * - partyCodes/{CODE} -> { partyId, createdAt } is a unique index doc. Admin SDK only: firestore.rules
 *   deny every client read and write. A new code is never issued if its index doc already exists
 *   (checked inside the same transaction that writes it), so two live parties can never share a code.
 * - parties/{id}/private/invite.code holds the party's current code next to the invite token.
 *   A code resolves only while the index doc and the invite record agree, the code is under 30 days
 *   old, and the party is LOBBY. Rotate replaces token and code in one transaction.
 * - Resolve + seat is one transaction: lockout and breaker checks, lookup, LOBBY and 30-seat recheck,
 *   then the seat write. The client never receives the invite token on this path.
 * - Limits live in _rateLimits (Admin SDK only): 5 bad codes per uid and 10 per IP per 15 minutes
 *   (IPv6 counted per /64, IPv4-mapped IPv6 as IPv4),
 *   plus a global breaker. Every failure maps to one generic error; only "full" differs, and only
 *   after a valid match.
 * - Logs carry counts and party ids only. Never the code, the token, a uid, or an IP.
 */
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { isIPv4, isIPv6 } from 'node:net';

export const PARTY_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
export const PARTY_CODE_LENGTH = 8;
export const PARTY_CODE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const PARTY_CODE_MAX_SEATS = 30;
export const PARTY_CODE_ISSUE_ATTEMPTS = 5;

export const PARTY_CODE_LIMITS = Object.freeze({
  windowMs: 15 * 60 * 1000,
  perUid: 5,
  perIp: 10,
  // Wrong codes from everyone combined in one window before every resolve fails for the rest of it.
  breaker: 200,
});

/** Result kinds the route maps to HTTP. Only `full` is shown differently to the guest. */
export const PARTY_CODE_RESULT = Object.freeze({
  seated: 'seated',
  full: 'full',
  failed: 'failed',
});

const CODE_RE = new RegExp(`^[${PARTY_CODE_ALPHABET}]{${PARTY_CODE_LENGTH}}$`);

export function isValidPartyCode(code) {
  return typeof code === 'string' && CODE_RE.test(code);
}

/** Uppercase, strip spaces and dashes, drop characters outside the alphabet, keep the first 8. */
export function normalizePartyCode(raw) {
  if (typeof raw !== 'string') return '';
  let out = '';
  for (const ch of raw.slice(0, 64).toUpperCase()) {
    if (PARTY_CODE_ALPHABET.includes(ch)) {
      out += ch;
      if (out.length === PARTY_CODE_LENGTH) break;
    }
  }
  return out;
}

/** @param {(max: number) => number} pick crypto.randomInt by default (uniform, rejection-sampled). */
export function generatePartyCode(pick = randomInt) {
  let code = '';
  for (let i = 0; i < PARTY_CODE_LENGTH; i += 1) {
    code += PARTY_CODE_ALPHABET[pick(PARTY_CODE_ALPHABET.length)];
  }
  return code;
}

/** 128-bit invite token, same shape as firestore.rules validInviteToken. */
export function generateInviteToken() {
  return randomBytes(16).toString('hex');
}

/**
 * Caller IP for rate limiting. Cloud Run's front end appends the connecting address as the last
 * X-Forwarded-For entry, so earlier entries (which a caller can forge) are ignored. If a proxy ever
 * adds its own hop after that, every caller shares one bucket: stricter, never looser.
 */
export function clientIpFromRequest(req) {
  const xff = req?.headers?.['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    const parts = xff.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return req?.socket?.remoteAddress || 'unknown';
}

/** Eight 16-bit groups for a valid IPv6 string (zone and brackets stripped), else null. */
function ipv6Groups(ip) {
  if (!isIPv6(ip)) return null;
  let text = ip;
  const tail = text.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (tail) {
    const o = tail[1].split('.').map(Number);
    text = `${text.slice(0, -tail[1].length)}${((o[0] << 8) | o[1]).toString(16)}:${((o[2] << 8) | o[3]).toString(16)}`;
  }
  const [head, rest] = text.split('::');
  const left = head ? head.split(':') : [];
  const right = rest !== undefined && rest !== '' ? rest.split(':') : [];
  const fill = rest === undefined ? [] : new Array(8 - left.length - right.length).fill('0');
  const groups = [...left, ...fill, ...right].map((g) => parseInt(g, 16));
  return groups.length === 8 ? groups : null;
}

/**
 * Per-IP limit bucket. IPv4 stays the full address. IPv6 is bucketed by /64 (one customer
 * network usually gets a whole /64, so rotating the low 64 bits must not reset the limit).
 * IPv4-mapped IPv6 (::ffff:a.b.c.d) counts as the plain IPv4 address.
 */
export function rateLimitIpBucket(raw) {
  const ip = String(raw ?? '').trim().replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  if (isIPv4(ip)) return ip;
  const groups = ipv6Groups(ip);
  if (!groups) return ip;
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    return [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff].join('.');
  }
  return `${groups.slice(0, 4).map((g) => g.toString(16)).join(':')}::/64`;
}

/** Rate-limit key for an IP bucket. Stored only in Admin-only docs and never logged. */
export function hashIpForRateLimit(ip) {
  return createHash('sha256').update(`party-code-ip:${rateLimitIpBucket(ip)}`).digest('hex').slice(0, 40);
}

function codeRef(db, code) {
  return db.collection('partyCodes').doc(code);
}

function inviteRef(db, partyId) {
  return db.collection('parties').doc(partyId).collection('private').doc('invite');
}

function uidLimitRef(db, uid) {
  return db.collection('_rateLimits').doc('partyCodeUids').collection('records').doc(uid);
}

function ipLimitRef(db, ipHash) {
  return db.collection('_rateLimits').doc('partyCodeIps').collection('records').doc(ipHash);
}

function breakerRef(db) {
  return db.collection('_rateLimits').doc('partyCodeBreaker');
}

/** Failures counted in the current fixed window ({ windowStart, failures } docs). */
export function failuresInWindow(stored, nowMs, windowMs = PARTY_CODE_LIMITS.windowMs) {
  if (!stored || typeof stored.windowStart !== 'number') return 0;
  if (nowMs - stored.windowStart >= windowMs) return 0;
  return typeof stored.failures === 'number' ? stored.failures : 0;
}

function bumpedWindow(stored, nowMs, windowMs = PARTY_CODE_LIMITS.windowMs) {
  const current = failuresInWindow(stored, nowMs, windowMs);
  const windowStart = current === 0 ? nowMs : stored.windowStart;
  return { windowStart, failures: current + 1, updatedAt: nowMs };
}

function codeIsLive(indexData, nowMs) {
  return (
    !!indexData &&
    typeof indexData.partyId === 'string' &&
    typeof indexData.createdAt === 'number' &&
    nowMs - indexData.createdAt < PARTY_CODE_TTL_MS
  );
}

/**
 * Host only (caller checks the Google host gate first). Returns { token, code } for the share box,
 * issuing a code when the party has none, its code expired, or `rotate` is set. Rotate also replaces
 * the invite token, so the old link and the old code stop working in the same write.
 * @param {import('firebase-admin/firestore').Firestore} db
 */
export async function issuePartyCode(db, partyId, { rotate = false, nowMs = Date.now(), pick = randomInt } = {}) {
  return db.runTransaction(async (tx) => {
    const partySnap = await tx.get(db.collection('parties').doc(partyId));
    if (!partySnap.exists || partySnap.data()?.status !== 'LOBBY') {
      return { ok: false };
    }
    const inviteSnap = await tx.get(inviteRef(db, partyId));
    const invite = inviteSnap.exists ? inviteSnap.data() : {};
    const hasToken = typeof invite.token === 'string' && /^[0-9a-f]{32}$/.test(invite.token);

    let oldIndex = null;
    if (isValidPartyCode(invite.code)) {
      const oldSnap = await tx.get(codeRef(db, invite.code));
      oldIndex = oldSnap.exists ? oldSnap.data() : null;
      const current = oldIndex?.partyId === partyId && codeIsLive(oldIndex, nowMs);
      if (!rotate && hasToken && current) {
        return { ok: true, token: invite.token, code: invite.code };
      }
    }

    let code = null;
    for (let attempt = 0; attempt < PARTY_CODE_ISSUE_ATTEMPTS; attempt += 1) {
      const candidate = generatePartyCode(pick);
      if (candidate === invite.code) continue;
      const taken = await tx.get(codeRef(db, candidate));
      if (!taken.exists) {
        code = candidate;
        break;
      }
    }
    if (!code) {
      console.error('party_code_issue_collisions', { partyId, attempts: PARTY_CODE_ISSUE_ATTEMPTS });
      return { ok: false };
    }

    const token = rotate || !hasToken ? generateInviteToken() : invite.token;
    if (isValidPartyCode(invite.code) && oldIndex?.partyId === partyId) {
      tx.delete(codeRef(db, invite.code));
    }
    tx.set(codeRef(db, code), { partyId, createdAt: nowMs });
    tx.set(inviteRef(db, partyId), { token, code, updatedAt: new Date(nowMs) });
    return { ok: true, token, code };
  });
}

/**
 * Resolve a typed code and seat the caller in one transaction.
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {{ uid: string, ipHash: string, rawCode: unknown, nowMs?: number }} args
 * @returns {Promise<{ result: 'seated', partyId: string } | { result: 'full' | 'failed' }>}
 */
export async function resolvePartyCodeAndSeat(db, { uid, ipHash, rawCode, nowMs = Date.now() }) {
  const code = normalizePartyCode(rawCode);
  const outcome = await db.runTransaction(async (tx) => {
    const uidRef = uidLimitRef(db, uid);
    const ipRef = ipLimitRef(db, ipHash);
    const brkRef = breakerRef(db);
    const [uidSnap, ipSnap, brkSnap] = await Promise.all([tx.get(uidRef), tx.get(ipRef), tx.get(brkRef)]);
    const uidStored = uidSnap.exists ? uidSnap.data() : null;
    const ipStored = ipSnap.exists ? ipSnap.data() : null;
    const brkStored = brkSnap.exists ? brkSnap.data() : null;

    if (
      failuresInWindow(uidStored, nowMs) >= PARTY_CODE_LIMITS.perUid ||
      failuresInWindow(ipStored, nowMs) >= PARTY_CODE_LIMITS.perIp ||
      failuresInWindow(brkStored, nowMs) >= PARTY_CODE_LIMITS.breaker
    ) {
      return { result: PARTY_CODE_RESULT.failed, blocked: true };
    }

    const countFailure = () => {
      const breaker = bumpedWindow(brkStored, nowMs);
      tx.set(uidRef, bumpedWindow(uidStored, nowMs));
      tx.set(ipRef, bumpedWindow(ipStored, nowMs));
      tx.set(brkRef, breaker);
      return {
        result: PARTY_CODE_RESULT.failed,
        breakerTripped: breaker.failures === PARTY_CODE_LIMITS.breaker,
      };
    };

    if (!isValidPartyCode(code)) return countFailure();

    const indexSnap = await tx.get(codeRef(db, code));
    const index = indexSnap.exists ? indexSnap.data() : null;
    if (!codeIsLive(index, nowMs)) return countFailure();

    const partyRef = db.collection('parties').doc(index.partyId);
    const [partySnap, inviteSnap, seatSnap] = await Promise.all([
      tx.get(partyRef),
      tx.get(inviteRef(db, index.partyId)),
      tx.get(partyRef.collection('participants').doc(uid)),
    ]);
    const party = partySnap.exists ? partySnap.data() : null;
    if (!party || party.status !== 'LOBBY' || inviteSnap.data()?.code !== code) {
      return countFailure();
    }
    if (seatSnap.exists) {
      return { result: PARTY_CODE_RESULT.seated, partyId: index.partyId };
    }
    // Parties made before the seat counter existed can't prove the 30-seat cap: refuse (not a guess).
    if (typeof party.participantCount !== 'number') {
      return { result: PARTY_CODE_RESULT.failed };
    }
    const count = party.participantCount;
    if (count >= PARTY_CODE_MAX_SEATS) {
      return { result: PARTY_CODE_RESULT.full };
    }
    const now = new Date(nowMs);
    tx.set(partyRef.collection('participants').doc(uid), {
      status: 'GOING',
      turnNumber: null,
      ready: false,
      joinedAt: now,
      updatedAt: now,
    });
    tx.update(partyRef, { participantCount: count + 1 });
    return { result: PARTY_CODE_RESULT.seated, partyId: index.partyId, joined: true };
  });

  if (outcome.breakerTripped) {
    console.warn('party_code_breaker_tripped', { failures: PARTY_CODE_LIMITS.breaker });
  }
  if (outcome.result === PARTY_CODE_RESULT.seated) {
    return { result: outcome.result, partyId: outcome.partyId };
  }
  return { result: outcome.result };
}
