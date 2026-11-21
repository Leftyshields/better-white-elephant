/**
 * forceBotPick guards (Security should-fix 2 on PR 120): no crash or undefined pick when the bot
 * has nothing it may open, and the own-gift exception lets a bot open its own gifts when they are
 * all that remain.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildStandardState,
  createTestStore,
  giftEntry,
  mockIo,
} from './helpers/test-store.mjs';
import { createAtomicRedis } from './helpers/atomic-test-redis.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..');

const store = createTestStore();
const atomicRedis = createAtomicRedis(store);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

mock.module('firebase-admin', {
  defaultExport: {
    firestore: {
      Timestamp: { now: () => ({}) },
    },
  },
});

const firebaseAdminPath = path.join(serverRoot, 'config/firebase-admin.js');
const redisPath = path.join(serverRoot, 'utils/redis.js');
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
          where: () => ({
            get: async () => ({ docs: [], forEach: () => {} }),
          }),
        };
      },
      batch: () => ({
        update: () => {},
        commit: async () => {},
      }),
    },
  },
  defaultExport: {
    firestore: {
      Timestamp: { now: () => ({}) },
    },
  },
});

mock.module(redisPath, {
  defaultExport: atomicRedis,
});

const persistenceModule = await import(persistencePath);

mock.module(persistencePath, {
  namedExports: {
    ...persistenceModule,
    loadGameState: async (partyId) => {
      const raw = await atomicRedis.get(`game:${partyId}`);
      if (raw) {
        return JSON.parse(raw);
      }
      return store.loadGameState(partyId);
    },
    saveGameState: (partyId, state) => store.saveGameState(partyId, state),
    saveGameStateToFirestore: async () => true,
    resolvePartyTtlForGameState: async () => 86400,
  },
});

const { forceBotPick, clearBotState } = await import(path.join(serverRoot, 'utils/bot-utils.js'));

test.beforeEach(() => {
  store.reset();
  clearBotState('party-test');
});

const BOT = 'bot_party_force';

test('forceBotPick with no wrapped gifts fails cleanly and leaves the game unchanged', async () => {
  const partyId = 'party-test';
  const state = buildStandardState({
    partyId,
    turnOrder: ['human_a', BOT],
    currentTurnIndex: 1,
    wrappedGifts: [],
    unwrappedGifts: [giftEntry('gift_a', 'human_a'), giftEntry('gift_b', 'human_b')],
  });
  await store.saveGameState(partyId, state);
  const before = await store.loadGameState(partyId);
  const io = mockIo();

  await assert.rejects(forceBotPick(partyId, io), { message: 'No wrapped gifts available' });

  assert.deepEqual(await store.loadGameState(partyId), before);
  assert.equal(io.emissions.length, 0);
});

test("forceBotPick opens one of the bot's own gifts when they are all that remain (never undefined)", async () => {
  const partyId = 'party-test';
  const state = buildStandardState({
    partyId,
    turnOrder: ['human_a', BOT, 'human_c'],
    currentTurnIndex: 1,
    wrappedGifts: ['gift_bot_1', 'gift_bot_2'],
    unwrappedGifts: [giftEntry('gift_x', 'human_a')],
    turnAction: [
      ['human_a', 'PICKED'],
      [BOT, null],
      ['human_c', null],
    ],
  });
  state.giftSubmitters = { gift_x: BOT, gift_bot_1: BOT, gift_bot_2: BOT };
  await store.saveGameState(partyId, state);

  const result = await forceBotPick(partyId, mockIo());

  assert.equal(result.action, 'pick');
  assert.ok(['gift_bot_1', 'gift_bot_2'].includes(result.giftId), `picked ${result.giftId}`);
  const after = JSON.parse(await atomicRedis.get(`game:${partyId}`));
  const owned = new Map(after.unwrappedGifts);
  assert.equal(owned.get(result.giftId).ownerId, BOT);
});
