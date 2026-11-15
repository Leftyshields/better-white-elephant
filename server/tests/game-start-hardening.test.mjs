import test from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { claimPartyLobbyForStart } from '../utils/game-start-lock.js';
import { GAME_START_FAILED_BODY } from '../utils/game-start-http.js';
import { createTestStore } from './helpers/test-store.mjs';
import { createAtomicRedis } from './helpers/atomic-test-redis.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..');

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
  const store = createTestStore();
  const sharedRedis = createAtomicRedis(store);

  mock.module('firebase-admin', {
    defaultExport: { firestore: { Timestamp: { now: () => ({}) } } },
  });

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

  const { saveGameStateIfAbsent } = await import('../utils/game-state-persistence.js');

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