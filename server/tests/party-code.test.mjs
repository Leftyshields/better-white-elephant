/**
 * Item 10: typed party codes. Generation (entropy, no modulo bias), normalization, the unique
 * code index, and resolve + seat with every abuse limit (5 per uid, 10 per IP, global breaker),
 * one generic error, LOBBY only, and the 30-seat cap. Route tests cover the HTTP contract.
 */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createFakeFirestore } from './helpers/fake-firestore.mjs';
import {
  PARTY_CODE_ALPHABET,
  PARTY_CODE_LENGTH,
  PARTY_CODE_LIMITS,
  PARTY_CODE_TTL_MS,
  clientIpFromRequest,
  generatePartyCode,
  hashIpForRateLimit,
  isValidPartyCode,
  issuePartyCode,
  normalizePartyCode,
  resolvePartyCodeAndSeat,
} from '../lib/party-code.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..');

const NOW = Date.UTC(2026, 10, 21, 18, 0, 0);
const PARTY = 'party-1';
const CODE = 'KX7P4MRB';
const TOKEN = 'a'.repeat(32);

function seedParty({ status = 'LOBBY', participantCount = 1, code = CODE, codeAgeMs = 0 } = {}) {
  return {
    [`parties/${PARTY}`]: { adminId: 'host', status, participantCount },
    [`parties/${PARTY}/private/invite`]: { token: TOKEN, code },
    [`partyCodes/${code}`]: { partyId: PARTY, createdAt: NOW - codeAgeMs },
  };
}

const join = (db, overrides = {}) =>
  resolvePartyCodeAndSeat(db, { uid: 'guest-1', ipHash: 'ip-a', rawCode: CODE, nowMs: NOW, ...overrides });

// ---- Generation and parsing ----

test('alphabet is the signed 30 symbols with no 0, O, 1, I, L, or U; codes are 8 long (~39.3 bits)', () => {
  assert.equal(PARTY_CODE_ALPHABET, '23456789ABCDEFGHJKMNPQRSTVWXYZ');
  assert.equal(PARTY_CODE_ALPHABET.length, 30);
  for (const ch of '0O1ILU') assert.equal(PARTY_CODE_ALPHABET.includes(ch), false, ch);
  assert.equal(PARTY_CODE_LENGTH, 8);
  assert.ok(Math.log2(30 ** 8) > 39.2);
});

test('generatePartyCode picks each character with randomInt(30) (no randomBytes % 30)', () => {
  const calls = [];
  const code = generatePartyCode((max) => {
    calls.push(max);
    return calls.length - 1;
  });
  assert.deepEqual(calls, [30, 30, 30, 30, 30, 30, 30, 30]);
  assert.equal(code, PARTY_CODE_ALPHABET.slice(0, 8));
  const source = readFileSync(path.join(serverRoot, 'lib/party-code.js'), 'utf8');
  assert.doesNotMatch(source, /%\s*(30|PARTY_CODE_ALPHABET\.length)/);
  assert.match(source, /import \{[^}]*randomInt[^}]*\} from 'node:crypto'/);
});

test('real generator yields valid codes and uses every symbol', () => {
  const seen = new Set();
  for (let i = 0; i < 400; i += 1) {
    const code = generatePartyCode();
    assert.ok(isValidPartyCode(code), code);
    for (const ch of code) seen.add(ch);
  }
  assert.equal(seen.size, 30);
});

test('normalizePartyCode: uppercase, strip dash and spaces, drop invalid characters, keep first 8', () => {
  assert.equal(normalizePartyCode('abcd efgh'), 'ABCDEFGH');
  assert.equal(normalizePartyCode('abcd-efgh'), 'ABCDEFGH');
  assert.equal(normalizePartyCode('  ABCD-EFGH  '), 'ABCDEFGH');
  assert.equal(normalizePartyCode('kx7p-4mrb'), 'KX7P4MRB');
  assert.equal(normalizePartyCode('KX7P-4MRB-ZZ'), 'KX7P4MRB', '9th+ characters ignored');
  assert.equal(normalizePartyCode('K0X7P1M4R'), 'KX7PM4R', '0 and 1 dropped, never mapped');
  assert.equal(normalizePartyCode('OIL UKX7'), 'KX7');
  assert.equal(normalizePartyCode(null), '');
  assert.equal(isValidPartyCode('KX7P4MR'), false);
  assert.equal(isValidPartyCode('KX7P4MRO'), false);
});

test('clientIpFromRequest uses the last X-Forwarded-For hop (forged leading hops ignored)', () => {
  assert.equal(clientIpFromRequest({ headers: { 'x-forwarded-for': '6.6.6.6, 203.0.113.9' } }), '203.0.113.9');
  assert.equal(clientIpFromRequest({ headers: {}, socket: { remoteAddress: '10.0.0.1' } }), '10.0.0.1');
  const hashed = hashIpForRateLimit('203.0.113.9');
  assert.match(hashed, /^[0-9a-f]{40}$/);
  assert.equal(hashed.includes('203'), false);
});

// ---- Issue / rotate ----

test('issue: creates a unique index doc and stores the code on the host-only invite record', async () => {
  const db = createFakeFirestore({
    [`parties/${PARTY}`]: { adminId: 'host', status: 'LOBBY', participantCount: 1 },
    [`parties/${PARTY}/private/invite`]: { token: TOKEN },
  });
  const out = await issuePartyCode(db, PARTY, { nowMs: NOW });
  assert.equal(out.ok, true);
  assert.ok(isValidPartyCode(out.code));
  assert.equal(out.token, TOKEN, 'existing link keeps working');
  assert.deepEqual(db.docs.get(`partyCodes/${out.code}`), { partyId: PARTY, createdAt: NOW });
  assert.equal(db.docs.get(`parties/${PARTY}/private/invite`).code, out.code);
  const again = await issuePartyCode(db, PARTY, { nowMs: NOW + 1000 });
  assert.equal(again.code, out.code, 'share box reuses the live code');
});

test('issue: retries when a candidate collides with an existing code (never reuses a live code)', async () => {
  const taken = 'AAAAAAAA';
  const db = createFakeFirestore({
    [`parties/${PARTY}`]: { adminId: 'host', status: 'LOBBY', participantCount: 1 },
    [`parties/${PARTY}/private/invite`]: { token: TOKEN },
    'parties/other': { adminId: 'h2', status: 'LOBBY', participantCount: 3 },
    'parties/other/private/invite': { token: 'b'.repeat(32), code: taken },
    [`partyCodes/${taken}`]: { partyId: 'other', createdAt: NOW },
  });
  const seq = [...Array(8).fill(8), ...Array(8).fill(9)]; // 'AAAAAAAA' then 'BBBBBBBB'
  const out = await issuePartyCode(db, PARTY, { nowMs: NOW, pick: () => seq.shift() });
  assert.equal(out.code, 'BBBBBBBB');
  assert.deepEqual(db.docs.get(`partyCodes/${taken}`), { partyId: 'other', createdAt: NOW }, 'other party untouched');
});

test('issue: gives up (no write) when every attempt collides', async () => {
  const db = createFakeFirestore({
    [`parties/${PARTY}`]: { adminId: 'host', status: 'LOBBY', participantCount: 1 },
    'partyCodes/AAAAAAAA': { partyId: 'other', createdAt: NOW },
  });
  const err = mock.method(console, 'error', () => {});
  const out = await issuePartyCode(db, PARTY, { nowMs: NOW, pick: () => 8 });
  err.mock.restore();
  assert.equal(out.ok, false);
  assert.equal(JSON.stringify(err.mock.calls[0].arguments).includes('AAAAAAAA'), false, 'codes never logged');
  assert.equal(db.docs.has(`parties/${PARTY}/private/invite`), false);
});

test('rotate: replaces token and code together; the old code stops resolving', async () => {
  const db = createFakeFirestore(seedParty());
  const out = await issuePartyCode(db, PARTY, { rotate: true, nowMs: NOW });
  assert.notEqual(out.code, CODE);
  assert.notEqual(out.token, TOKEN);
  assert.equal(db.docs.has(`partyCodes/${CODE}`), false);
  assert.deepEqual(await join(db), { result: 'failed' });
  assert.deepEqual(await join(db, { rawCode: out.code, uid: 'guest-2' }), { result: 'seated', partyId: PARTY });
});

test('issue: refuses non-LOBBY parties', async () => {
  const db = createFakeFirestore(seedParty({ status: 'ACTIVE' }));
  assert.equal((await issuePartyCode(db, PARTY, { nowMs: NOW })).ok, false);
});

// ---- Resolve + seat ----

test('join: valid code seats the caller (count +1) and returns only the party id', async () => {
  const db = createFakeFirestore(seedParty());
  const out = await join(db, { rawCode: 'kx7p-4mrb' });
  assert.deepEqual(out, { result: 'seated', partyId: PARTY });
  assert.equal(JSON.stringify(out).includes(TOKEN), false);
  const seat = db.docs.get(`parties/${PARTY}/participants/guest-1`);
  assert.equal(seat.status, 'GOING');
  assert.equal(seat.ready, false);
  assert.equal(db.docs.get(`parties/${PARTY}`).participantCount, 2);
});

test('join: already seated caller succeeds without a second count bump', async () => {
  const db = createFakeFirestore({ ...seedParty(), [`parties/${PARTY}/participants/guest-1`]: { status: 'GOING' } });
  assert.deepEqual(await join(db), { result: 'seated', partyId: PARTY });
  assert.equal(db.docs.get(`parties/${PARTY}`).participantCount, 1);
});

test('join: non-LOBBY parties (ACTIVE, ENDED, CANCELLED) give the generic failure and no seat', async () => {
  for (const status of ['ACTIVE', 'ENDED', 'CANCELLED']) {
    const db = createFakeFirestore(seedParty({ status }));
    assert.deepEqual(await join(db), { result: 'failed' }, status);
    assert.equal(db.docs.has(`parties/${PARTY}/participants/guest-1`), false);
  }
});

test('join: 30-seat cap returns full only after a valid match; 29 still seats', async () => {
  const full = createFakeFirestore(seedParty({ participantCount: 30 }));
  assert.deepEqual(await join(full), { result: 'full' });
  assert.equal(full.docs.has(`parties/${PARTY}/participants/guest-1`), false);
  const almost = createFakeFirestore(seedParty({ participantCount: 29 }));
  assert.equal((await join(almost)).result, 'seated');
  assert.equal(almost.docs.get(`parties/${PARTY}`).participantCount, 30);
  // A wrong code on a full party is still the generic failure (no hint the party exists).
  assert.deepEqual(await join(full, { rawCode: 'ZZZZZZZZ' }), { result: 'failed' });
});

test('join: a legacy party with no seat counter is refused (cap cannot be proven) without counting a guess', async () => {
  const seed = seedParty();
  delete seed[`parties/${PARTY}`].participantCount;
  const db = createFakeFirestore(seed);
  assert.deepEqual(await join(db), { result: 'failed' });
  assert.equal(db.docs.has(`parties/${PARTY}/participants/guest-1`), false);
  assert.equal(db.docs.has('_rateLimits/partyCodeUids/records/guest-1'), false);
});

test('join: not found, expired (30 days), stale index, bad format all give the same generic failure', async () => {
  const cases = [
    [createFakeFirestore(seedParty()), 'ZZZZZZZZ'],
    [createFakeFirestore(seedParty({ codeAgeMs: PARTY_CODE_TTL_MS })), CODE],
    [createFakeFirestore({ ...seedParty(), [`parties/${PARTY}/private/invite`]: { token: TOKEN, code: 'ZZZZZZZZ' } }), CODE],
    [createFakeFirestore(seedParty()), 'KX7'],
    [createFakeFirestore(seedParty()), { code: CODE }],
  ];
  for (const [db, rawCode] of cases) {
    assert.deepEqual(await join(db, { rawCode }), { result: 'failed' });
  }
});

test('limit: 5 bad codes per uid in 15 minutes locks that uid out, even for the right code', async () => {
  const db = createFakeFirestore(seedParty());
  for (let i = 0; i < PARTY_CODE_LIMITS.perUid; i += 1) {
    await join(db, { rawCode: 'ZZZZZZZZ', ipHash: `ip-${i}` });
  }
  assert.deepEqual(await join(db, { ipHash: 'ip-fresh' }), { result: 'failed' });
  assert.equal(db.docs.has(`parties/${PARTY}/participants/guest-1`), false);
  // Another uid is unaffected; the locked uid works again after the window.
  assert.equal((await join(db, { uid: 'guest-2', ipHash: 'ip-other' })).result, 'seated');
  const later = await join(db, { ipHash: 'ip-fresh', nowMs: NOW + PARTY_CODE_LIMITS.windowMs });
  assert.equal(later.result, 'seated');
});

test('limit: 4 bad codes per uid still allows the right code', async () => {
  const db = createFakeFirestore(seedParty());
  for (let i = 0; i < PARTY_CODE_LIMITS.perUid - 1; i += 1) await join(db, { rawCode: 'ZZZZZZZZ' });
  assert.equal((await join(db)).result, 'seated');
});

test('limit: 10 bad codes per IP in 15 minutes locks the IP across uids', async () => {
  const db = createFakeFirestore(seedParty());
  for (let i = 0; i < PARTY_CODE_LIMITS.perIp; i += 1) {
    await join(db, { rawCode: 'ZZZZZZZZ', uid: `anon-${i}` });
  }
  assert.deepEqual(await join(db, { uid: 'new-anon' }), { result: 'failed' });
  assert.equal((await join(db, { uid: 'new-anon', ipHash: 'ip-b' })).result, 'seated');
});

test('limit: global breaker trips after the breaker count and blocks every caller for the window', async () => {
  const db = createFakeFirestore({
    ...seedParty(),
    '_rateLimits/partyCodeBreaker': { windowStart: NOW, failures: PARTY_CODE_LIMITS.breaker - 1 },
  });
  const warn = mock.method(console, 'warn', () => {});
  await join(db, { rawCode: 'ZZZZZZZZ', uid: 'x', ipHash: 'ip-x' });
  assert.equal(warn.mock.callCount(), 1);
  assert.equal(JSON.stringify(warn.mock.calls[0].arguments).includes('ip-x'), false);
  warn.mock.restore();
  assert.deepEqual(await join(db, { uid: 'fresh', ipHash: 'ip-fresh' }), { result: 'failed' });
  assert.equal((await join(db, { uid: 'fresh', ipHash: 'ip-fresh', nowMs: NOW + PARTY_CODE_LIMITS.windowMs })).result, 'seated');
});

test('limits: a failed attempt writes counters only under _rateLimits and never stores the guess', async () => {
  const db = createFakeFirestore(seedParty());
  await join(db, { rawCode: 'ZZZZZZZZ' });
  const keys = [...db.docs.keys()].filter((k) => k.startsWith('_rateLimits/'));
  assert.deepEqual(keys.sort(), [
    '_rateLimits/partyCodeBreaker',
    '_rateLimits/partyCodeIps/records/ip-a',
    '_rateLimits/partyCodeUids/records/guest-1',
  ]);
  assert.equal(JSON.stringify([...db.docs.values()]).includes('ZZZZZZZZ'), false, 'wrong codes are not stored');
});

// ---- HTTP route ----

let routeDb = createFakeFirestore();
mock.module(path.join(serverRoot, 'config/firebase-admin.js'), {
  namedExports: { db: new Proxy({}, { get: (_t, k) => (typeof routeDb[k] === 'function' ? routeDb[k].bind(routeDb) : routeDb[k]) }), auth: {} },
});
const { createPartyCodeRouter } = await import(path.join(serverRoot, 'routes/party-code.js'));

async function call(route, user, body, headers = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = user;
    next();
  });
  app.use('/api/party-code', createPartyCodeRouter({ db: routeDb }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/party-code/${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json(), cache: res.headers.get('cache-control') };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const anon = (uid) => ({ uid, firebase: { sign_in_provider: 'anonymous' } });
const google = (uid) => ({ uid, firebase: { sign_in_provider: 'google.com' } });

test('POST /join: anonymous guest is seated; body is only { partyId }; never cached', async () => {
  routeDb = createFakeFirestore(seedParty());
  const res = await call('join', anon('anon-1'), { code: 'kx7p-4mrb' });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { partyId: PARTY });
  assert.equal(res.cache, 'no-store');
});

test('POST /join: every failure has the same status and body; full is 409 after a valid match', async () => {
  routeDb = createFakeFirestore(seedParty({ status: 'ACTIVE' }));
  const started = await call('join', anon('a'), { code: CODE });
  routeDb = createFakeFirestore(seedParty());
  const wrong = await call('join', anon('a'), { code: 'ZZZZZZZZ' });
  const signedOut = await call('join', undefined, { code: CODE });
  assert.deepEqual(started, { status: 400, body: { error: 'party_code_failed' }, cache: 'no-store' });
  assert.deepEqual(wrong, started);
  assert.equal(signedOut.status, 401);
  assert.deepEqual(signedOut.body, { error: 'party_code_failed' });
  routeDb = createFakeFirestore(seedParty({ participantCount: 30 }));
  assert.deepEqual((await call('join', anon('a'), { code: CODE })).body, { error: 'full' });
});

test('POST /join: IP limit keys on the last X-Forwarded-For hop, so forged leading hops do not reset it', async () => {
  routeDb = createFakeFirestore(seedParty());
  for (let i = 0; i < PARTY_CODE_LIMITS.perIp; i += 1) {
    await call('join', anon(`u${i}`), { code: 'ZZZZZZZZ' }, { 'x-forwarded-for': `10.9.9.${i}, 198.51.100.7` });
  }
  const res = await call('join', anon('u-new'), { code: CODE }, { 'x-forwarded-for': '1.2.3.4, 198.51.100.7' });
  assert.equal(res.status, 400);
});

test('POST /share and /rotate: Google host only; anonymous or non-owner callers get 403', async () => {
  routeDb = createFakeFirestore(seedParty());
  assert.equal((await call('share', anon('host'), { partyId: PARTY })).status, 403);
  assert.equal((await call('share', google('someone'), { partyId: PARTY })).status, 403);
  assert.equal((await call('rotate', anon('host'), { partyId: PARTY })).status, 403);
  const share = await call('share', google('host'), { partyId: PARTY });
  assert.deepEqual(share.body, { code: CODE, token: TOKEN });
  const rotated = await call('rotate', google('host'), { partyId: PARTY });
  assert.equal(rotated.status, 200);
  assert.notEqual(rotated.body.code, CODE);
  assert.equal((await call('share', google('host'), { partyId: '../x' })).status, 400);
});
