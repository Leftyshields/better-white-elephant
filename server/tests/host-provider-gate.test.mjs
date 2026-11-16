/**
 * Item 1: host actions require a Google sign-in, read from the VERIFIED ID token
 * (decoded.firebase.sign_in_provider), never from email, email_verified or "has a token".
 */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isGoogleSignIn, isPartyHostCaller } from '../lib/host-auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..');

const HOST_ID = 'host-uid';
const NON_GOOGLE = ['anonymous', 'password', 'emailLink', 'custom', 'phone'];

const token = (uid, provider) => ({
  uid,
  email: 'not-used@example.com',
  email_verified: true,
  ...(provider === undefined ? {} : { firebase: { sign_in_provider: provider } }),
});

test('isPartyHostCaller: Google owner passes', () => {
  assert.equal(isPartyHostCaller({ adminId: HOST_ID }, token(HOST_ID, 'google.com')), true);
  assert.equal(isGoogleSignIn(token(HOST_ID, 'google.com')), true);
});

test('isPartyHostCaller: owner on any other provider (even with a verified email) fails', () => {
  for (const provider of [...NON_GOOGLE, undefined]) {
    assert.equal(
      isPartyHostCaller({ adminId: HOST_ID }, token(HOST_ID, provider)),
      false,
      `provider ${provider}`,
    );
  }
});

test('isPartyHostCaller: Google non-owner, missing party, missing token fail', () => {
  assert.equal(isPartyHostCaller({ adminId: HOST_ID }, token('someone-else', 'google.com')), false);
  assert.equal(isPartyHostCaller(null, token(HOST_ID, 'google.com')), false);
  assert.equal(isPartyHostCaller({ adminId: HOST_ID }, null), false);
  assert.equal(isPartyHostCaller({ adminId: '' }, { uid: '', firebase: { sign_in_provider: 'google.com' } }), false);
});

test('every admin socket handler uses the shared gate on the verified socket token', () => {
  const source = readFileSync(path.join(serverRoot, 'server.js'), 'utf8');
  assert.doesNotMatch(source, /party\.adminId\s*!==\s*socket\.userId/);
  const gated = source.match(/!isPartyHostCaller\(party, socket\.user\)/g) ?? [];
  // admin_add_bots, toggle_autoplay, force_bot_move/steal/skip/pick, reset_game
  assert.equal(gated.length, 7);
  // Socket connect stays uid-only (no provider check at connect).
  assert.match(source, /socket\.userId = decodedToken\.uid;\n\s+socket\.user = decodedToken;/);
});

// ---- Route-level: POST /api/game/start and /api/game/end ----

let partyDoc = { adminId: HOST_ID, status: 'LOBBY' };

const emptySnapshot = { docs: [], size: 0, empty: true };
const fakeDb = {
  collection(name) {
    return {
      doc() {
        return {
          get: async () => ({ exists: name === 'parties', id: 'p1', data: () => partyDoc }),
          collection() {
            return { where: () => ({ get: async () => emptySnapshot }), get: async () => emptySnapshot };
          },
        };
      },
      where: () => ({ get: async () => emptySnapshot }),
    };
  },
};

mock.module('firebase-admin', {
  defaultExport: { firestore: { Timestamp: { now: () => ({}) }, FieldValue: {} } },
});
mock.module(path.join(serverRoot, 'config/firebase-admin.js'), {
  namedExports: { db: fakeDb, auth: {} },
});
mock.module(path.join(serverRoot, 'utils/redis.js'), {
  defaultExport: { get: async () => null, set: async () => null, del: async () => null },
});
mock.module(path.join(serverRoot, 'utils/game-state-persistence.js'), {
  namedExports: {
    saveGameState: async () => true,
    loadGameState: async () => ({ phase: 'ACTIVE', config: {} }),
    deleteGameState: async () => true,
  },
});

const { default: gameRoutes } = await import(path.join(serverRoot, 'routes/game.js'));

async function post(route, user) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = user; // stands in for the verifyIdToken middleware in server.js
    next();
  });
  app.use('/api/game', gameRoutes);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/game/${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partyId: 'p1' }),
    });
    return { status: res.status, body: await res.json() };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('POST /start: party owner without Google sign-in gets 403', async () => {
  partyDoc = { adminId: HOST_ID, status: 'LOBBY' };
  for (const provider of ['anonymous', 'password', 'emailLink']) {
    const res = await post('start', token(HOST_ID, provider));
    assert.equal(res.status, 403, provider);
    assert.equal(res.body.error, 'Only party admin can start the game');
  }
});

test('POST /start: Google owner passes the gate (then hits normal start validation)', async () => {
  partyDoc = { adminId: HOST_ID, status: 'LOBBY' };
  const res = await post('start', token(HOST_ID, 'google.com'));
  assert.notEqual(res.status, 403);
  assert.equal(res.status, 400); // no players yet: existing validation, past the host gate
});

test('POST /end: party owner without Google sign-in gets 403', async () => {
  partyDoc = { adminId: HOST_ID, status: 'ACTIVE' };
  const res = await post('end', token(HOST_ID, 'anonymous'));
  assert.equal(res.status, 403);
  assert.equal(res.body.error, 'Only party admin can end the game');
});

test('POST /end: Google non-owner gets 403', async () => {
  partyDoc = { adminId: HOST_ID, status: 'ACTIVE' };
  const res = await post('end', token('someone-else', 'google.com'));
  assert.equal(res.status, 403);
});
