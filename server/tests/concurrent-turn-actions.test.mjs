/**
 * Regression: concurrent turn actions must not lose or duplicate gifts.
 * Uses dedicated Redis connections (duplicate()) like production.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStandardState, createTestStore } from './helpers/test-store.mjs';
import { createAtomicRedis, seedRedisGameState } from './helpers/atomic-test-redis.mjs';
import { assertGiftConservation } from '../utils/game-state-invariants.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..');

const store = createTestStore();
const sharedRedis = createAtomicRedis(store);
const redisPath = path.join(serverRoot, 'utils/redis.js');

mock.module('firebase-admin', {
  defaultExport: {
    firestore: {
      Timestamp: { now: () => ({}) },
    },
  },
});

const firebaseAdminPath = path.join(serverRoot, 'config/firebase-admin.js');
const persistencePath = path.join(serverRoot, 'utils/game-state-persistence.js');

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

mock.module(redisPath, {
  defaultExport: sharedRedis,
});

const persistence = await import(path.join(serverRoot, 'utils/game-state-persistence.js'));

let firestoreSaveResult = true;

mock.module(persistencePath, {
  namedExports: {
    prepareGameStateForSave: persistence.prepareGameStateForSave,
    resolvePartyTtlForGameState: async () => 86400,
    saveGameStateToFirestore: async () => firestoreSaveResult,
    loadGameState: (partyId) => store.loadGameState(partyId),
  },
});

const { executePickGift, executeStealGift } = await import(path.join(serverRoot, 'utils/game-turn-handler.mjs'));
const { runAtomicGameMutation } = await import(path.join(serverRoot, 'utils/atomic-game-action.mjs'));
const { GameEngine } = await import(path.join(serverRoot, 'engine.js'));

const turnOrder = ['p1', 'p2', 'p3'];

test.beforeEach(() => {
  store.reset();
  firestoreSaveResult = true;
});

test('concurrent picks by active player apply exactly one successful mutation', async () => {
  const partyId = 'party-concurrent-same';
  const state = buildStandardState({
    partyId,
    turnOrder,
    currentTurnIndex: 0,
    wrappedGifts: ['g1', 'g2', 'g3'],
  });
  seedRedisGameState(store, partyId, state);

  const results = await Promise.allSettled([
    executePickGift(partyId, 'g1', 'p1'),
    executePickGift(partyId, 'g2', 'p1'),
  ]);

  const succeeded = results.filter((r) => r.status === 'fulfilled');
  assert.equal(succeeded.length, 1, 'exactly one concurrent pick should commit');

  const raw = await sharedRedis.get(`game:${partyId}`);
  const final = JSON.parse(raw);
  assertGiftConservation(final);
  assert.equal(final.unwrappedGifts.length, 1);
  assert.equal(final.wrappedGifts.length, 2);
});

test('concurrent pick and steal on same snapshot keep gift conservation', async () => {
  const partyId = 'party-concurrent-pick-steal';
  const state = buildStandardState({
    partyId,
    turnOrder,
    currentTurnIndex: 1,
    wrappedGifts: ['g2', 'g3'],
    unwrappedGifts: [['g1', { ownerId: 'p1', stealCount: 0, isFrozen: false, lastOwnerId: null }]],
  });
  seedRedisGameState(store, partyId, state);

  const results = await Promise.allSettled([
    executePickGift(partyId, 'g2', 'p2'),
    executeStealGift(partyId, 'g1', 'p2'),
  ]);

  const succeeded = results.filter((r) => r.status === 'fulfilled');
  assert.equal(succeeded.length, 1, 'only one of pick or steal should win on the same turn');

  const raw = await sharedRedis.get(`game:${partyId}`);
  const final = JSON.parse(raw);
  assertGiftConservation(final);

  const wrapped = new Set(final.wrappedGifts);
  const unwrappedIds = new Set(final.unwrappedGifts.map(([id]) => id));
  for (const id of ['g1', 'g2', 'g3']) {
    assert.ok(wrapped.has(id) !== unwrappedIds.has(id), `gift ${id} must appear exactly once`);
  }
});

test('concurrent turns on two different parties both commit (isolated Redis connections)', async () => {
  const partyA = 'party-alpha';
  const partyB = 'party-beta';
  seedRedisGameState(
    store,
    partyA,
    buildStandardState({
      partyId: partyA,
      turnOrder: ['a1', 'a2'],
      currentTurnIndex: 0,
      wrappedGifts: ['ga1', 'ga2'],
    }),
  );
  seedRedisGameState(
    store,
    partyB,
    buildStandardState({
      partyId: partyB,
      turnOrder: ['b1', 'b2'],
      currentTurnIndex: 0,
      wrappedGifts: ['gb1', 'gb2'],
    }),
  );

  const [resA, resB] = await Promise.all([
    executePickGift(partyA, 'ga1', 'a1'),
    executePickGift(partyB, 'gb1', 'b1'),
  ]);

  assert.ok(resA.newState);
  assert.ok(resB.newState);

  const finalA = JSON.parse(await sharedRedis.get(`game:${partyA}`));
  const finalB = JSON.parse(await sharedRedis.get(`game:${partyB}`));
  assertGiftConservation(finalA);
  assertGiftConservation(finalB);
  assert.equal(finalA.unwrappedGifts.length, 1);
  assert.equal(finalB.unwrappedGifts.length, 1);
  assert.equal(finalA.wrappedGifts.length, 1);
  assert.equal(finalB.wrappedGifts.length, 1);
});

test('Redis commit succeeds when Firestore persist fails after turn (Redis authoritative)', async () => {
  const partyId = 'party-firestore-fail';
  firestoreSaveResult = false;
  seedRedisGameState(
    store,
    partyId,
    buildStandardState({
      partyId,
      turnOrder,
      currentTurnIndex: 0,
      wrappedGifts: ['g1', 'g2'],
    }),
  );

  const { newState, firestorePersisted } = await runAtomicGameMutation(partyId, (gameState) => {
    const engine = new GameEngine(gameState, gameState.config);
    engine.pickGift('g1', 'p1');
    const next = engine.getState();
    next.config = gameState.config;
    return next;
  });

  assert.equal(firestorePersisted, false);
  assert.equal(newState.unwrappedGifts.length, 1);
  const fromRedis = JSON.parse(await sharedRedis.get(`game:${partyId}`));
  assert.equal(fromRedis.currentTurnIndex, newState.currentTurnIndex);
});