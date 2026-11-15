import test from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  claimPartyLobbyForStart,
  revertOrphanedActivePartyToLobby,
} from '../utils/game-start-lock.js';
import { GAME_START_FAILED_BODY } from '../utils/game-start-http.js';
import { createTestStore } from './helpers/test-store.mjs';
import { createAtomicRedis } from './helpers/atomic-test-redis.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..');

mock.module('firebase-admin', {
  defaultExport: { firestore: { Timestamp: { now: () => ({}) } } },
});

const store = createTestStore();
const sharedRedis = createAtomicRedis(store);

mock.module(path.join(serverRoot, 'config/firebase-admin.js'), {
  namedExports: {
    db: {
      collection() {
        return {
          doc: () => ({
            get: async () => ({ exists: true, data: () => ({ status: 'ACTIVE' }) }),
            update: async () => {},
          }),
        };
      },
    },
  },
});

mock.module(path.join(serverRoot, 'utils/redis.js'), { defaultExport: sharedRedis });

const persistencePath = path.join(serverRoot, 'utils/game-state-persistence.js');
const persistence = await import(persistencePath);

mock.module(persistencePath, {
  namedExports: {
    prepareGameStateForSave: persistence.prepareGameStateForSave,
    resolvePartyTtlForGameState: async () => 86400,
    saveGameStateToFirestore: async () => true,
    loadGameState: (partyId) => store.loadGameState(partyId),
    saveGameStateIfAbsent: persistence.saveGameStateIfAbsent,
  },
});

const { saveGameStateIfAbsent } = await import(persistencePath);
const { saveInitialGameStateOrRevertParty } = await import('../utils/game-start-commit.js');

test.beforeEach(() => {
  store.reset();
});

test('claimPartyLobbyForStart: second concurrent claim is already_active', async () => {
  const statuses = { partyA: 'LOBBY' };
  const mockDb = {
    runTransaction(fn) {
      return fn({
        async get(ref) {
          const id = ref.id;
          return {
            exists: true,
            data: () => ({ status: statuses[id] }),
          };
        },
        update(ref, patch) {
          statuses[ref.id] = patch.status;
        },
      });
    },
    collection() {
      return {
        doc(id) {
          return { id };
        },
      };
    },
  };

  const first = await claimPartyLobbyForStart(mockDb, 'partyA');
  const second = await claimPartyLobbyForStart(mockDb, 'partyA');

  assert.equal(first, 'claimed');
  assert.equal(second, 'already_active');
  assert.equal(statuses.partyA, 'ACTIVE');
});

test('GAME_START_FAILED_BODY does not leak internal error.message', () => {
  assert.deepEqual(GAME_START_FAILED_BODY, { error: 'Failed to start game' });
  assert.equal(GAME_START_FAILED_BODY.message, undefined);
});

test('saveGameStateIfAbsent: second writer is a no-op', async () => {
  const partyId = 'party-start-race';
  const firstState = {
    partyId,
    phase: 'ACTIVE',
    currentTurnIndex: 0,
    turnOrder: ['a'],
    turnQueue: ['a', 'a'],
    wrappedGifts: ['g1'],
    unwrappedGifts: [],
    turnAction: [['a', null]],
    config: { maxSteals: 3, returnToStart: false },
  };
  const secondState = { ...firstState, stateVersion: 9999 };

  const first = await saveGameStateIfAbsent(partyId, firstState);
  const second = await saveGameStateIfAbsent(partyId, secondState);

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.notEqual(second.gameState.stateVersion, 9999);
  assert.equal(second.gameState.partyId, partyId);
});

test('revertOrphanedActivePartyToLobby only rolls back ACTIVE parties', async () => {
  const statuses = { partyB: 'ACTIVE', partyC: 'LOBBY' };
  const mockDb = {
    runTransaction(fn) {
      return fn({
        async get(ref) {
          return { exists: true, data: () => ({ status: statuses[ref.id] }) };
        },
        update(ref, patch) {
          statuses[ref.id] = patch.status;
        },
      });
    },
    collection() {
      return { doc: (id) => ({ id }) };
    },
  };

  assert.equal(await revertOrphanedActivePartyToLobby(mockDb, 'partyB'), 'reverted');
  assert.equal(statuses.partyB, 'LOBBY');
  assert.equal(await revertOrphanedActivePartyToLobby(mockDb, 'partyB'), 'not_active');
  assert.equal(await revertOrphanedActivePartyToLobby(mockDb, 'partyC'), 'not_active');
});

test('failed save reverts orphaned ACTIVE; retry persists game state', async () => {
  const statuses = { partyRetry: 'ACTIVE' };
  let saveAttempts = 0;
  const stored = { game: null };

  const mockDb = {
    runTransaction(fn) {
      return fn({
        async get(ref) {
          return { exists: true, data: () => ({ status: statuses[ref.id] }) };
        },
        update(ref, patch) {
          statuses[ref.id] = patch.status;
        },
      });
    },
    collection() {
      return { doc: (id) => ({ id }) };
    },
  };

  const gameState = {
    partyId: 'partyRetry',
    phase: 'ACTIVE',
    currentTurnIndex: 0,
    turnOrder: ['a'],
    turnQueue: ['a', 'a'],
    wrappedGifts: ['g1'],
    unwrappedGifts: [],
    turnAction: [['a', null]],
    config: { maxSteals: 3, returnToStart: false },
  };

  await assert.rejects(
    () =>
      saveInitialGameStateOrRevertParty(mockDb, 'partyRetry', gameState, {
        loadGameState: async () => stored.game,
        saveGameStateIfAbsent: async () => {
          saveAttempts += 1;
          if (saveAttempts === 1) {
            throw new Error('redis down');
          }
          stored.game = { ...gameState, stateVersion: 1 };
          return { created: true, gameState: stored.game };
        },
        revertOrphanedActivePartyToLobby,
      }),
    /redis down/,
  );

  assert.equal(statuses.partyRetry, 'LOBBY');

  const retry = await saveInitialGameStateOrRevertParty(mockDb, 'partyRetry', gameState, {
    loadGameState: async () => stored.game,
    saveGameStateIfAbsent: async () => {
      saveAttempts += 1;
      stored.game = { ...gameState, stateVersion: 2 };
      return { created: true, gameState: stored.game };
    },
    revertOrphanedActivePartyToLobby,
  });

  assert.equal(retry.created, true);
  assert.equal(saveAttempts, 2);
  assert.ok(stored.game);
});

test('two concurrent initial saves produce exactly one game state', async () => {
  const partyId = 'party-concurrent-start';
  const mkState = (tag) => ({
    partyId,
    phase: 'ACTIVE',
    currentTurnIndex: 0,
    turnOrder: ['a'],
    turnQueue: ['a', 'a'],
    wrappedGifts: ['g1'],
    unwrappedGifts: [],
    turnAction: [['a', null]],
    config: { maxSteals: 3, returnToStart: false },
    stateVersion: tag,
  });

  const [a, b] = await Promise.all([
    saveGameStateIfAbsent(partyId, mkState(111)),
    saveGameStateIfAbsent(partyId, mkState(222)),
  ]);

  const createdCount = [a, b].filter((r) => r.created).length;
  assert.equal(createdCount, 1);
  assert.equal(a.gameState.stateVersion, b.gameState.stateVersion);
  const loaded = await store.loadGameState(partyId);
  assert.equal(loaded.stateVersion, a.gameState.stateVersion);
});