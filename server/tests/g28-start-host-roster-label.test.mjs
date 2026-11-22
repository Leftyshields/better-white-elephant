/**
 * G28: POST /api/game/start writes the host's roster label on the party doc, so the late-invite
 * card (whose visitors can't read seats) says "hosted by Brian S." when the players saw "Brian S.".
 * The host is numbered first, so the label never carries " (N)". Unknown labels are cleared.
 */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostRosterLabel, rosterDisplayNames } from '../shared/roster-names.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..');
const HOST_ID = 'zz-host';
const DELETE = Symbol('FieldValue.delete');

let seats = [];
let updates = [];
const at = (iso) => ({ toDate: () => new Date(iso), toMillis: () => Date.parse(iso) });
const snap = (id, data) => ({ id, exists: true, data: () => data, get: (k) => data[k] });

const fakeDb = {
  collection(name) {
    if (name === 'gifts') {
      return {
        where: () => ({
          get: async () => ({ docs: seats.map((s, i) => snap(`gift-${i}`, { partyId: 'p1', submitterId: s.id })) }),
        }),
      };
    }
    return {
      doc() {
        return {
          get: async () => snap('p1', { adminId: HOST_ID, status: 'LOBBY' }),
          update: async (data) => {
            updates.push(data);
          },
          collection() {
            const all = { docs: seats.map((s) => snap(s.id, s.data)) };
            return { where: () => ({ get: async () => all }), get: async () => all };
          },
        };
      },
    };
  },
};

mock.module('firebase-admin', {
  defaultExport: { firestore: { Timestamp: { now: () => ({}) }, FieldValue: { delete: () => DELETE } } },
});
mock.module(path.join(serverRoot, 'config/firebase-admin.js'), { namedExports: { db: fakeDb, auth: {} } });
mock.module(path.join(serverRoot, 'utils/redis.js'), {
  defaultExport: { get: async () => null, set: async () => null, del: async () => null },
});
mock.module(path.join(serverRoot, 'utils/game-state-persistence.js'), {
  namedExports: { saveGameState: async () => true, loadGameState: async () => null, deleteGameState: async () => true },
});

// The start route schedules bot follow-ups on timers; they don't matter here.
mock.module(path.join(serverRoot, 'utils/bot-utils.js'), {
  namedExports: { scheduleBotRefreshSimulation: () => {}, checkAndMakeBotMove: async () => {} },
});

const { default: gameRoutes } = await import(path.join(serverRoot, 'routes/game.js'));

async function start() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { uid: HOST_ID, firebase: { sign_in_provider: 'google.com' } };
    next();
  });
  app.use('/api/game', gameRoutes);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/game/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partyId: 'p1' }),
    });
    return res.status;
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const seat = (id, displayName, lastInitial, joinedAt) => ({
  id,
  data: { status: 'GOING', displayName, lastInitial, joinedAt: at(joinedAt) },
});

test('start writes "Brian S." for the host when a later guest is also Brian S. (never "(2)")', async () => {
  updates = [];
  seats = [
    seat('aa-guest', 'Brian', 'S', '2026-11-21T18:05:00Z'),
    seat(HOST_ID, 'Brian', 'S', '2026-11-21T18:00:00Z'),
  ];
  assert.equal(await start(), 200);
  const partyUpdate = updates.find((u) => u.status === 'ACTIVE');
  assert.equal(partyUpdate.hostRosterLabel, 'Brian S.');
});

test('start writes the plain first name when no one shares it', async () => {
  updates = [];
  seats = [seat(HOST_ID, 'Brian', 'S', '2026-11-21T18:00:00Z'), seat('aa-guest', 'Dana', 'R', '2026-11-21T18:05:00Z')];
  assert.equal(await start(), 200);
  assert.equal(updates.find((u) => u.status === 'ACTIVE').hostRosterLabel, 'Brian');
});

test('start clears the label when a seat has no seat name (the card falls back to the first name)', async () => {
  updates = [];
  seats = [seat(HOST_ID, 'Brian', 'S', '2026-11-21T18:00:00Z'), { id: 'bot_1', data: { status: 'GOING' } }];
  assert.equal(await start(), 200);
  assert.equal(updates.find((u) => u.status === 'ACTIVE').hostRosterLabel, DELETE);
});

test('the written label matches what players see for the host in the game room', () => {
  const players = [
    { id: 'aa-guest', displayName: 'Brian', lastInitial: 'S', joinedAt: 2 },
    { id: HOST_ID, displayName: 'Brian', lastInitial: 'S', joinedAt: 1 },
  ];
  assert.equal(hostRosterLabel(players, HOST_ID), rosterDisplayNames(players, {}, { hostId: HOST_ID })[HOST_ID]);
});
