/**
 * A0 per-game shipping address: owner save/read/clear route (server/routes/party-shipping.js).
 * Real Express router over HTTP, in-memory Firestore, in-memory rate-limit counter.
 */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFakeFirestore } from './helpers/fake-firestore.mjs';
import {
  SHIPPING_RATE_LIMITS,
  parseShippingBody,
  partyInShippingWindow,
} from '../lib/party-shipping.js';

const serverRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
mock.module(path.join(serverRoot, 'config/firebase-admin.js'), { namedExports: { db: {}, auth: {} } });
const { createPartyShippingRouter } = await import(path.join(serverRoot, 'routes/party-shipping.js'));

const PARTY = 'party-a0';
const WINNER = 'winner-1';
const OTHER = 'player-2';
const HOST = 'host-1';
const ADDRESS = { name: 'Win Ner', street: '1 Main St', city: 'Town', state: 'OR', zip: '97201', country: 'US' };
const DAY = 24 * 60 * 60 * 1000;

function seed({ status = 'ENDED', endedAt = new Date(Date.now() - DAY), seats } = {}) {
  const rows = {
    [`parties/${PARTY}`]: { adminId: HOST, status, endedAt },
  };
  for (const [uid, seatStatus] of Object.entries(seats ?? { [WINNER]: 'GOING', [OTHER]: 'GOING', [HOST]: 'GOING' })) {
    rows[`parties/${PARTY}/participants/${uid}`] = { status: seatStatus };
  }
  return rows;
}

function fakeRedis({ fail = false } = {}) {
  const counts = new Map();
  return {
    counts,
    async incr(key) {
      if (fail) throw new Error('redis down');
      counts.set(key, (counts.get(key) ?? 0) + 1);
      return counts.get(key);
    },
    async expire() {},
  };
}

async function call({ db, redis = fakeRedis(), uid, method = 'GET', partyId = PARTY, body }) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = uid ? { uid } : undefined;
    next();
  });
  app.use('/api/party-shipping', createPartyShippingRouter({ db, redis }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/party-shipping/${partyId}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { status: res.status, body: await res.json(), cache: res.headers.get('cache-control') };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const shippingPath = (uid) => `parties/${PARTY}/shipping/${uid}`;

test('save: seated winner saves; doc holds the six fields plus server savedAt; no-store', async () => {
  const db = createFakeFirestore(seed());
  const res = await call({ db, uid: WINNER, method: 'POST', body: { address: { ...ADDRESS, street: '  1 Main St  ' } } });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { shippingAddress: ADDRESS });
  assert.equal(res.cache, 'no-store');
  const stored = db.docs.get(shippingPath(WINNER));
  assert.deepEqual(Object.keys(stored).sort(), ['city', 'country', 'name', 'savedAt', 'state', 'street', 'zip']);
  assert.equal(stored.street, '1 Main St');
  assert.notEqual(stored.savedAt, undefined);
});

test('read: owner gets only their own doc; null when none', async () => {
  const db = createFakeFirestore({ ...seed(), [shippingPath(OTHER)]: { ...ADDRESS, name: 'Other', savedAt: new Date() } });
  const mine = await call({ db, uid: WINNER });
  assert.deepEqual(mine, { status: 200, body: { shippingAddress: null }, cache: 'no-store' });
  const theirs = await call({ db, uid: OTHER });
  assert.equal(theirs.status, 200);
  assert.equal(theirs.body.shippingAddress.name, 'Other');
  assert.equal(theirs.body.shippingAddress.savedAt, undefined);
});

test('clear: all six empty deletes the doc', async () => {
  const db = createFakeFirestore({ ...seed(), [shippingPath(WINNER)]: { ...ADDRESS, savedAt: new Date() } });
  const empty = Object.fromEntries(Object.keys(ADDRESS).map((k) => [k, '']));
  const res = await call({ db, uid: WINNER, method: 'POST', body: { address: empty } });
  assert.deepEqual(res.body, { shippingAddress: null });
  assert.equal(db.docs.has(shippingPath(WINNER)), false);
});

test('auth: no verified token is 401 and writes nothing', async () => {
  const db = createFakeFirestore(seed());
  assert.equal((await call({ db })).status, 401);
  assert.equal((await call({ db, method: 'POST', body: { address: ADDRESS } })).status, 401);
  assert.equal([...db.docs.keys()].some((k) => k.includes('/shipping/')), false);
});

test('auth: a uid in the body is ignored; the doc is keyed by the token uid', async () => {
  const db = createFakeFirestore(seed());
  const res = await call({ db, uid: OTHER, method: 'POST', body: { address: ADDRESS, uid: WINNER } });
  assert.equal(res.status, 400, 'unknown top-level key rejected');
  assert.equal(db.docs.has(shippingPath(WINNER)), false);
});

test('membership: outsider, removed seat and unknown party are refused', async () => {
  const db = createFakeFirestore(seed({ seats: { [WINNER]: 'GOING', [OTHER]: 'REMOVED' } }));
  assert.equal((await call({ db, uid: 'outsider', method: 'POST', body: { address: ADDRESS } })).status, 403);
  assert.equal((await call({ db, uid: OTHER, method: 'POST', body: { address: ADDRESS } })).status, 403);
  assert.equal((await call({ db, uid: 'outsider' })).status, 403);
  assert.equal((await call({ db, uid: WINNER, partyId: 'nope' })).status, 404);
  assert.equal((await call({ db, uid: WINNER, partyId: 'bad.id' })).status, 400);
  assert.equal(db.docs.has(shippingPath('outsider')), false);
  assert.equal(db.docs.has(shippingPath(OTHER)), false);
});

test('status window: LOBBY and ACTIVE ok; CANCELLED and ENDED over 30 days refused', async () => {
  for (const status of ['LOBBY', 'ACTIVE']) {
    const db = createFakeFirestore(seed({ status }));
    assert.equal((await call({ db, uid: WINNER, method: 'POST', body: { address: ADDRESS } })).status, 200, status);
  }
  const cancelled = createFakeFirestore(seed({ status: 'CANCELLED' }));
  assert.equal((await call({ db: cancelled, uid: WINNER, method: 'POST', body: { address: ADDRESS } })).status, 403);
  const old = createFakeFirestore(seed({ endedAt: new Date(Date.now() - 31 * DAY) }));
  assert.equal((await call({ db: old, uid: WINNER, method: 'POST', body: { address: ADDRESS } })).status, 403);
  assert.equal(old.docs.has(shippingPath(WINNER)), false);
});

test('status window boundary: 30 days exactly ok, just past refused, no end time refused', () => {
  const now = Date.now();
  assert.equal(partyInShippingWindow({ status: 'ENDED', endedAt: new Date(now - 30 * DAY) }, now), true);
  assert.equal(partyInShippingWindow({ status: 'ENDED', endedAt: new Date(now - 30 * DAY - 1) }, now), false);
  assert.equal(partyInShippingWindow({ status: 'ENDED' }, now), false);
  assert.equal(partyInShippingWindow({ status: 'ENDED', updatedAt: new Date(now) }, now), true);
});

test('allowlist: unknown field, nested object, number, partial address all 400 and write nothing', async () => {
  const db = createFakeFirestore(seed());
  const bad = [
    { address: { ...ADDRESS, phone: '555' } },
    { address: { ...ADDRESS, street: { line1: 'x' } } },
    { address: { ...ADDRESS, zip: 97201 } },
    { address: { ...ADDRESS, city: '' } },
    { address: [ADDRESS] },
    { address: ADDRESS, savedAt: '2020-01-01' },
    {},
  ];
  for (const body of bad) {
    const res = await call({ db, uid: WINNER, method: 'POST', body });
    assert.equal(res.status, 400, JSON.stringify(body));
  }
  assert.equal(db.docs.has(shippingPath(WINNER)), false);
});

test('caps: each field at its cap passes, one over fails', () => {
  const caps = { name: 100, street: 200, city: 100, state: 50, zip: 20, country: 60 };
  for (const [key, cap] of Object.entries(caps)) {
    assert.equal(parseShippingBody({ address: { ...ADDRESS, [key]: 'x'.repeat(cap) } }).ok, true, key);
    assert.equal(parseShippingBody({ address: { ...ADDRESS, [key]: 'x'.repeat(cap + 1) } }).ok, false, key);
  }
});

test('rate limit: writes over the per-minute cap get 429 and stop writing', async () => {
  const db = createFakeFirestore(seed());
  const redis = fakeRedis();
  for (let i = 0; i < SHIPPING_RATE_LIMITS.write; i += 1) {
    assert.equal((await call({ db, redis, uid: WINNER, method: 'POST', body: { address: ADDRESS } })).status, 200);
  }
  await db.collection('parties').doc(PARTY).collection('shipping').doc(WINNER).delete();
  const over = await call({ db, redis, uid: WINNER, method: 'POST', body: { address: ADDRESS } });
  assert.equal(over.status, 429);
  assert.equal(db.docs.has(shippingPath(WINNER)), false);
  // Reads have their own bucket, and another player is unaffected.
  assert.equal((await call({ db, redis, uid: WINNER })).status, 200);
  assert.equal((await call({ db, redis, uid: OTHER, method: 'POST', body: { address: ADDRESS } })).status, 200);
});

test('rate limit fails closed: Redis error is 503 and nothing is written', async () => {
  const db = createFakeFirestore(seed());
  const res = await call({ db, redis: fakeRedis({ fail: true }), uid: WINNER, method: 'POST', body: { address: ADDRESS } });
  assert.equal(res.status, 503);
  assert.equal(db.docs.has(shippingPath(WINNER)), false);
});

test('logs carry ids and status only, never address fields', async () => {
  const db = createFakeFirestore(seed());
  const lines = [];
  const info = mock.method(console, 'info', (...args) => lines.push(JSON.stringify(args)));
  const error = mock.method(console, 'error', (...args) => lines.push(JSON.stringify(args)));
  try {
    await call({ db, uid: WINNER, method: 'POST', body: { address: ADDRESS } });
    const broken = { ...db, collection: () => { throw Object.assign(new Error(ADDRESS.street), { code: 'boom' }); } };
    await call({ db: broken, uid: WINNER, method: 'POST', body: { address: ADDRESS } });
  } finally {
    info.mock.restore();
    error.mock.restore();
  }
  assert.ok(lines.length >= 2);
  for (const value of Object.values(ADDRESS)) {
    assert.equal(lines.join('\n').includes(value), false, `log leaked ${value}`);
  }
});
