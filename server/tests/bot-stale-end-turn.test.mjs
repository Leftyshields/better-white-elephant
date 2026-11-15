/**
 * Stale bot end-turn timers must not end a human's turn.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStandardState, createTestStore } from './helpers/test-store.mjs';
import { createAtomicRedis, seedRedisGameState } from './helpers/atomic-test-redis.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..');

const store = createTestStore();
const sharedRedis = createAtomicRedis(store);

mock.module('firebase-admin', {
  defaultExport: { firestore: { Timestamp: { now: () => ({}) } } },
});

const firebaseAdminPath = path.join(serverRoot, 'config/firebase-admin.js');
const persistencePath = path.join(serverRoot, 'utils/game-state-persistence.js');
const redisPath = path.join(serverRoot, 'utils/redis.js');

mock.module(firebaseAdminPath, {
  namedExports: {
    db: {
      collection() {
        return {
          doc: () => ({
            update: async () => {},
            get: async () => ({ exists: false, data: () => ({}) }),
          }),
        };
      },
    },
  },
});

mock.module(redisPath, { defaultExport: sharedRedis });

const persistence = await import(persistencePath);
mock.module(persistencePath, {
  namedExports: {
    ...persistence,
    saveGameStateToFirestore: async () => true,
    resolvePartyTtlForGameState: async () => 86400,
    loadGameState: (partyId) => persistence.loadGameState(partyId),
  },
});

const {
  executeEndActiveTurn,
  isBotTurnStaleError,
} = await import('../utils/game-turn-handler.mjs');
const { endBotTurn } = await import('../utils/bot-utils.js');

const io = { to() { return { emit() {} }; } };

test('executeEndActiveTurn rejects stale bot when human is active', async () => {
  const partyId = 'party-stale-bot-end';
  store.reset();
  const initialIndex = 1;
  seedRedisGameState(
    store,
    partyId,
    buildStandardState({
      partyId,
      turnOrder: ['bot_p1', 'human_p2'],
      currentTurnIndex: initialIndex,
      wrappedGifts: ['g1', 'g2'],
      unwrappedGifts: [['g-open', { ownerId: 'bot_p1', stealCount: 0, isFrozen: false, lastOwnerId: null }]],
    }),
  );

  await assert.rejects(
    () => executeEndActiveTurn(partyId, 'bot_p1'),
  );

  try {
    await executeEndActiveTurn(partyId, 'bot_p1');
  } catch (error) {
    assert.ok(isBotTurnStaleError(error));
  }

  const raw = JSON.parse(await sharedRedis.get(`game:${partyId}`));
  assert.equal(raw.currentTurnIndex, initialIndex);
});

test('endBotTurn quietly ignores stale bot end-turn', async () => {
  const partyId = 'party-stale-bot-handler';
  store.reset();
  seedRedisGameState(
    store,
    partyId,
    buildStandardState({
      partyId,
      turnOrder: ['bot_p1', 'human_p2'],
      currentTurnIndex: 1,
      wrappedGifts: ['g1', 'g2'],
    }),
  );

  await endBotTurn(partyId, io, 'bot_p1');

  const raw = JSON.parse(await sharedRedis.get(`game:${partyId}`));
  assert.equal(raw.currentTurnIndex, 1);
});