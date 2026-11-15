/**
 * forceBotPick cleared turnAction must use Redis WATCH/MULTI (not saveGameState).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStandardState, createTestStore } from './helpers/test-store.mjs';
import { createAtomicRedis } from './helpers/atomic-test-redis.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..');

const store = createTestStore();
const sharedRedis = createAtomicRedis(store);

mock.module('firebase-admin', {
  defaultExport: {
    firestore: { Timestamp: { now: () => ({}) } },
  },
});

const firebaseAdminPath = path.join(serverRoot, 'config/firebase-admin.js');
const persistencePath = path.join(serverRoot, 'utils/game-state-persistence.js');
const redisPath = path.join(serverRoot, 'utils/redis.js');

let saveGameStateCalls = 0;

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

const persistence = await import(persistencePath);

mock.module(persistencePath, {
  namedExports: {
    prepareGameStateForSave: persistence.prepareGameStateForSave,
    resolvePartyTtlForGameState: async () => 86400,
    saveGameStateToFirestore: async () => true,
    loadGameState: (partyId) => store.loadGameState(partyId),
    saveGameState: async () => {
      saveGameStateCalls += 1;
      throw new Error('saveGameState must not be used for force-bot pick clear');
    },
  },
});

mock.module(redisPath, { defaultExport: sharedRedis });

const { atomicallyClearForcedBotTurnAction } = await import(
  path.join(serverRoot, 'utils/bot-utils.js')
);

const PARTY_ID = 'party-force-bot-pick-atomic';
const BOT_ID = 'bot_alpha';

test.beforeEach(() => {
  store.reset();
  saveGameStateCalls = 0;
});

test('atomicallyClearForcedBotTurnAction persists without saveGameState', async () => {
  await store.saveGameState(
    PARTY_ID,
    buildStandardState({
      partyId: PARTY_ID,
      turnOrder: [BOT_ID, 'p2'],
      currentTurnIndex: 0,
      currentPlayerId: BOT_ID,
      wrappedGifts: [],
      turnAction: [
        [BOT_ID, 'PICKED'],
        ['p2', null],
      ],
    }),
  );

  const { newState } = await atomicallyClearForcedBotTurnAction(PARTY_ID, BOT_ID);

  const turnAction = new Map(newState.turnAction);
  assert.equal(turnAction.get(BOT_ID), null);
  assert.equal(saveGameStateCalls, 0);

  const reloaded = await store.loadGameState(PARTY_ID);
  const reloadedMap = new Map(reloaded.turnAction);
  assert.equal(reloadedMap.get(BOT_ID), null);
});

test('atomicallyClearForcedBotTurnAction rejects when bot is not the active player', async () => {
  await store.saveGameState(
    PARTY_ID,
    buildStandardState({
      partyId: PARTY_ID,
      turnOrder: [BOT_ID, 'p2'],
      currentTurnIndex: 1,
      wrappedGifts: [],
      turnAction: [
        [BOT_ID, 'PICKED'],
        ['p2', null],
      ],
    }),
  );

  await assert.rejects(
    () => atomicallyClearForcedBotTurnAction(PARTY_ID, BOT_ID),
    (err) => err.message === 'Bot is not the active player',
  );
  assert.equal(saveGameStateCalls, 0);
});