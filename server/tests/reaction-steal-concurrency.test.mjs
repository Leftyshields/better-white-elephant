/**
 * Reactions must not rewrite game state while a steal commits.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStandardState, createTestStore } from './helpers/test-store.mjs';
import { createAtomicRedis, seedRedisGameState } from './helpers/atomic-test-redis.mjs';
import { partyReactionRedisKey } from '../utils/party-reaction-count.mjs';

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

const reactionPath = path.join(serverRoot, 'utils/party-reaction-count.mjs');
mock.module(reactionPath, {
  namedExports: {
    partyReactionRedisKey: (partyId) => `game:${partyId}:reactions`,
    incrementPartyReactionCount: async (partyId) => {
      const key = `game:${partyId}:reactions`;
      await sharedRedis.incr(key);
      await sharedRedis.expire(key, 3600);
      return Number(await sharedRedis.get(key));
    },
    getPartyReactionCount: async (partyId) => {
      const raw = await sharedRedis.get(`game:${partyId}:reactions`);
      return raw == null ? 0 : Number.parseInt(raw, 10);
    },
    attachReactionCount: async (partyId, gameState) => {
      if (gameState) {
        const raw = await sharedRedis.get(`game:${partyId}:reactions`);
        gameState.reactionCount = raw == null ? 0 : Number.parseInt(raw, 10);
      }
      return gameState;
    },
    deletePartyReactionCount: async (partyId) => {
      await sharedRedis.del(`game:${partyId}:reactions`);
    },
  },
});

const persistence = await import(persistencePath);
mock.module(persistencePath, {
  namedExports: {
    ...persistence,
    saveGameStateToFirestore: async () => true,
    resolvePartyTtlForGameState: async () => 86400,
    loadGameState: (partyId) => persistence.loadGameState(partyId),
  },
});

const { incrementPartyReactionCount } = await import(reactionPath);
const { executeStealGift } = await import('../utils/game-turn-handler.mjs');

test('concurrent reactions and steal keep steal outcome', async () => {
  const partyId = 'party-reaction-steal';
  store.reset();
  seedRedisGameState(
    store,
    partyId,
    buildStandardState({
      partyId,
      turnOrder: ['p1', 'p2', 'p3'],
      currentTurnIndex: 1,
      wrappedGifts: ['g2', 'g3'],
      unwrappedGifts: [['g1', { ownerId: 'p1', stealCount: 0, isFrozen: false, lastOwnerId: null }]],
    }),
  );

  await Promise.all([
    incrementPartyReactionCount(partyId),
    incrementPartyReactionCount(partyId),
    incrementPartyReactionCount(partyId),
    executeStealGift(partyId, 'g1', 'p2'),
  ]);

  const after = JSON.parse(await sharedRedis.get(`game:${partyId}`));
  const reactionCount = await sharedRedis.get(partyReactionRedisKey(partyId));

  const owner = new Map(after.unwrappedGifts).get('g1')?.ownerId;
  assert.equal(owner, 'p2', 'steal should commit new gift owner');
  assert.equal(Number(reactionCount), 3);
});