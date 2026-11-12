/**
 * Regression tests for stray endBotTurn after bot PICK and missing victim/autoplay scheduling.
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..');

const store = createTestStore();

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
  defaultExport: {
    get: async (key) => store.redis.get(key) ?? null,
    set: async (key, value) => {
      store.redis.set(key, value);
    },
  },
});

mock.module(persistencePath, {
  namedExports: {
    loadGameState: (partyId) => store.loadGameState(partyId),
    saveGameState: (partyId, state) => store.saveGameState(partyId, state),
  },
});

const { forceBotMove, forceBotSteal, checkAndMakeBotMove, clearBotState } = await import(
  path.join(serverRoot, 'utils/bot-utils.js')
);

test.beforeEach(() => {
  store.reset();
  clearBotState('party-test');
});

function installAutoplay(partyId) {
  store.redis.set(`autoplay:${partyId}`, 'true');
}

test('bot PICK before human P1 bookend does not END_TURN for P1', async () => {
  const humanP1 = 'human_p1';
  const bot2 = 'bot_party_bot2';
  const bot3 = 'bot_party_bot3';
  const partyId = 'party-test';
  const turnOrder = [humanP1, bot2, bot3];

  const state = buildStandardState({
    partyId,
    turnOrder,
    currentTurnIndex: 2,
    wrappedGifts: ['gift_c'],
    unwrappedGifts: [
      giftEntry('gift_a', humanP1),
      giftEntry('gift_b', bot2),
    ],
    turnAction: [
      [humanP1, 'PICKED'],
      [bot2, 'PICKED'],
      [bot3, null],
    ],
  });
  state.currentPlayerId = bot3;
  await store.saveGameState(partyId, state);

  const io = mockIo();
  await forceBotMove(partyId, io);
  await wait(2000);

  const after = await store.loadGameState(partyId);
  const p1Skips = after.history.filter(
    (h) => h.type === 'END_TURN' && h.playerId === humanP1,
  );
  assert.equal(p1Skips.length, 0, `P1 bookend was auto-skipped: ${JSON.stringify(after.history)}`);
  assert.equal(after.phase, 'ACTIVE');
  assert.equal(after.currentPlayerId, humanP1);
  assert.equal(after.currentTurnIndex, 3);
});

test('bot PICK before bot P1 bookend leaves bot P1 active', async () => {
  const botP1 = 'bot_party_p1';
  const human2 = 'human_p2';
  const bot3 = 'bot_party_bot3';
  const partyId = 'party-test';
  const turnOrder = [botP1, human2, bot3];

  const state = buildStandardState({
    partyId,
    turnOrder,
    currentTurnIndex: 2,
    wrappedGifts: ['gift_c'],
    unwrappedGifts: [
      giftEntry('gift_a', botP1),
      giftEntry('gift_b', human2),
    ],
    turnAction: [
      [botP1, 'PICKED'],
      [human2, 'PICKED'],
      [bot3, null],
    ],
  });
  state.currentPlayerId = bot3;
  await store.saveGameState(partyId, state);

  const io = mockIo();
  await forceBotMove(partyId, io);
  await wait(2000);

  const after = await store.loadGameState(partyId);
  const p1Skips = after.history.filter(
    (h) => h.type === 'END_TURN' && h.playerId === botP1,
  );
  assert.equal(p1Skips.length, 0);
  assert.equal(after.phase, 'ACTIVE');
  assert.equal(after.currentPlayerId, botP1);
  assert.equal(after.currentTurnIndex, 3);
});

test('autoplay schedules the next bot after a bot PICK when next player is a bot', async () => {
  const human = 'human_host';
  const bot1 = 'bot_party_bot1';
  const bot2 = 'bot_party_bot2';
  const partyId = 'party-test';
  const turnOrder = [human, bot1, bot2];

  const state = buildStandardState({
    partyId,
    turnOrder,
    currentTurnIndex: 1,
    wrappedGifts: ['gift_b', 'gift_c'],
    unwrappedGifts: [giftEntry('gift_a', human)],
    turnAction: [
      [human, 'PICKED'],
      [bot1, null],
      [bot2, null],
    ],
  });
  state.currentPlayerId = bot1;
  await store.saveGameState(partyId, state);
  installAutoplay(partyId);

  const randomOriginal = Math.random;
  Math.random = () => 0;

  const io = mockIo();
  try {
    await forceBotMove(partyId, io);
    await wait(6500);

    const after = await store.loadGameState(partyId);
    const bot2Picks = after.history.filter(
      (h) => h.type === 'PICK' && h.playerId === bot2,
    );
    assert.equal(
      bot2Picks.length,
      1,
      `bot2 never picked; history tail: ${JSON.stringify(after.history.slice(-4))}`,
    );
  } finally {
    Math.random = randomOriginal;
  }
});

test('bot STEAL schedules the victim turn (bot victim picks)', async () => {
  const victim = 'bot_party_victim';
  const stealer = 'bot_party_stealer';
  const partyId = 'party-test';
  const turnOrder = [victim, stealer, 'human_extra'];

  const state = buildStandardState({
    partyId,
    turnOrder,
    currentTurnIndex: 1,
    wrappedGifts: ['gift_wrapped'],
    unwrappedGifts: [giftEntry('gift_open', victim)],
    turnAction: [
      [victim, 'PICKED'],
      [stealer, null],
      ['human_extra', null],
    ],
  });
  state.currentPlayerId = stealer;
  await store.saveGameState(partyId, state);
  installAutoplay(partyId);

  const io = mockIo();
  await forceBotSteal(partyId, io);
  await wait(6500);

  const after = await store.loadGameState(partyId);
  const victimPicks = after.history.filter(
    (h) => h.type === 'PICK' && h.playerId === victim,
  );
  assert.equal(
    victimPicks.length,
    1,
    `victim bot was not scheduled to pick; history: ${JSON.stringify(after.history)}`,
  );
});

test('checkAndMakeBotMove autoplay path continues after bot pick (no stray endBotTurn)', async () => {
  const bot1 = 'bot_party_one';
  const bot2 = 'bot_party_two';
  const partyId = 'party-test';
  const turnOrder = [bot1, bot2];

  const state = buildStandardState({
    partyId,
    turnOrder: [...turnOrder, 'human_pad'],
    currentTurnIndex: 0,
    wrappedGifts: ['g1', 'g2', 'g3'],
    turnAction: [
      [bot1, null],
      [bot2, null],
      ['human_pad', null],
    ],
  });
  // Standard queue with 3 distinct players + bookend
  state.turnOrder = [bot1, bot2, 'human_pad'];
  state.turnQueue = [bot1, bot2, 'human_pad', bot1];
  state.currentPlayerId = bot1;
  await store.saveGameState(partyId, state);
  installAutoplay(partyId);

  const randomOriginal = Math.random;
  Math.random = () => 0;

  const io = mockIo();
  try {
    await checkAndMakeBotMove(partyId, state, io);
    await wait(11000);

    const after = await store.loadGameState(partyId);
    const bot2Picks = after.history.filter(
      (h) => h.type === 'PICK' && h.playerId === bot2,
    );
    assert.ok(bot2Picks.length >= 1, 'autoplay stalled after bot1 pick');
  } finally {
    Math.random = randomOriginal;
  }
});
