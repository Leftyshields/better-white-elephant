/**
 * Pick-gift socket handler: no broadcast/save on invalid wrapped id.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../engine.js';
import {
  handlePickGift,
  PICK_GIFT_NOT_IN_WRAPPED_PILE,
  PICK_GIFT_NOT_ON_TURN,
} from '../handlers/pick-gift.js';
import { END_TURN_GAME_NOT_FOUND } from '../utils/end-turn-guards.js';
import { buildStandardState, createTestStore, mockIo } from './helpers/test-store.mjs';

const PARTY_ID = 'party-pick-handler';

const MSG_ALREADY_HOLDING =
  "You already have a gift, so you can't open another one. Steal one instead, or skip your turn.";
const MSG_ALREADY_OPEN = "That gift is already open, so you can't open it again.";

function isValidPartyId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]+$/.test(id);
}
function isValidGiftId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]+$/.test(id);
}

test('rejecting pick for id not in wrappedGifts: no action_started, save, or game-updated', async () => {
  const store = createTestStore();
  const turnOrder = ['p1', 'p2'];
  const initial = buildStandardState({
    partyId: PARTY_ID,
    turnOrder,
    currentTurnIndex: 0,
    wrappedGifts: ['g-valid'],
  });
  await store.saveGameState(PARTY_ID, initial);

  const io = mockIo();
  const socketErrors = [];
  const socket = {
    userId: 'p1',
    emit(event, payload) {
      if (event === 'error') socketErrors.push(payload);
    },
  };

  const saveCalls = [];
  await handlePickGift({
    partyId: PARTY_ID,
    giftId: 'g-phantom',
    userId: 'p1',
    socket,
    io,
    isValidPartyId,
    isValidGiftId,
    verifyPartyMembership: async () => true,
    loadGameState: (id) => store.loadGameState(id),
    saveGameState: async (id, state) => {
      saveCalls.push({ id, state });
      return store.saveGameState(id, state);
    },
    GameEngine,
    scheduleBotMove: null,
  });

  assert.equal(socketErrors.length, 1);
  assert.equal(socketErrors[0].message, PICK_GIFT_NOT_IN_WRAPPED_PILE);

  const roomEvents = io.emissions.filter((e) => e.event !== 'error');
  assert.equal(
    roomEvents.filter((e) => e.event === 'action_started').length,
    0,
    'must not broadcast action_started',
  );
  assert.equal(
    roomEvents.filter((e) => e.event === 'game-updated').length,
    0,
    'must not broadcast game-updated',
  );
  assert.equal(saveCalls.length, 0, 'must not save');

  const unchanged = await store.loadGameState(PARTY_ID);
  assert.deepEqual(unchanged.wrappedGifts, ['g-valid']);
});

test('socket copy strings match Copywriter final text', async () => {
  const store = createTestStore();
  const turnOrder = ['p1', 'p2'];
  const state = buildStandardState({
    partyId: PARTY_ID,
    turnOrder,
    currentTurnIndex: 0,
    wrappedGifts: ['g2'],
    unwrappedGifts: [['g1', { ownerId: 'p1', stealCount: 0, isFrozen: false, lastOwnerId: null }]],
  });
  state.currentPlayerId = 'p1';
  await store.saveGameState(PARTY_ID, state);

  const socketErrors = [];
  const socket = {
    userId: 'p1',
    emit(event, payload) {
      if (event === 'error') socketErrors.push(payload);
    },
  };

  await handlePickGift({
    partyId: PARTY_ID,
    giftId: 'g2',
    userId: 'p1',
    socket,
    io: mockIo(),
    isValidPartyId,
    isValidGiftId,
    verifyPartyMembership: async () => true,
    loadGameState: (id) => store.loadGameState(id),
    saveGameState: (id, s) => store.saveGameState(id, s),
    GameEngine,
    scheduleBotMove: null,
  });

  assert.equal(socketErrors[0]?.message, MSG_ALREADY_HOLDING);

  const state2 = buildStandardState({
    partyId: `${PARTY_ID}-open`,
    turnOrder: ['p1', 'p2'],
    currentTurnIndex: 0,
    wrappedGifts: ['g1'],
    unwrappedGifts: [['g1', { ownerId: 'p2', stealCount: 0, isFrozen: false, lastOwnerId: null }]],
  });
  state2.currentPlayerId = 'p1';
  await store.saveGameState(`${PARTY_ID}-open`, state2);

  const socketErrors2 = [];
  const socket2 = {
    userId: 'p1',
    emit(event, payload) {
      if (event === 'error') socketErrors2.push(payload);
    },
  };

  await handlePickGift({
    partyId: `${PARTY_ID}-open`,
    giftId: 'g1',
    userId: 'p1',
    socket: socket2,
    io: mockIo(),
    isValidPartyId,
    isValidGiftId,
    verifyPartyMembership: async () => true,
    loadGameState: (id) => store.loadGameState(id),
    saveGameState: (id, s) => store.saveGameState(id, s),
    GameEngine,
    scheduleBotMove: null,
  });

  assert.equal(socketErrors2[0]?.message, MSG_ALREADY_OPEN);
});

test('missing game state returns shared game-not-found copy', async () => {
  const store = createTestStore();
  const socketErrors = [];
  const socket = {
    userId: 'p1',
    emit(event, payload) {
      if (event === 'error') socketErrors.push(payload);
    },
  };

  await handlePickGift({
    partyId: PARTY_ID,
    giftId: 'g1',
    userId: 'p1',
    socket,
    io: mockIo(),
    isValidPartyId,
    isValidGiftId,
    verifyPartyMembership: async () => true,
    loadGameState: (id) => store.loadGameState(id),
    saveGameState: (id, s) => store.saveGameState(id, s),
    GameEngine,
    scheduleBotMove: null,
  });

  assert.equal(socketErrors[0]?.message, END_TURN_GAME_NOT_FOUND);
});

test('pick when not active player returns not-on-turn copy', async () => {
  const store = createTestStore();
  const turnOrder = ['p1', 'p2'];
  const initial = buildStandardState({
    partyId: PARTY_ID,
    turnOrder,
    currentTurnIndex: 0,
    wrappedGifts: ['g-valid'],
  });
  await store.saveGameState(PARTY_ID, initial);

  const socketErrors = [];
  const socket = {
    userId: 'p2',
    emit(event, payload) {
      if (event === 'error') socketErrors.push(payload);
    },
  };

  await handlePickGift({
    partyId: PARTY_ID,
    giftId: 'g-valid',
    userId: 'p2',
    socket,
    io: mockIo(),
    isValidPartyId,
    isValidGiftId,
    verifyPartyMembership: async () => true,
    loadGameState: (id) => store.loadGameState(id),
    saveGameState: (id, s) => store.saveGameState(id, s),
    GameEngine,
    scheduleBotMove: null,
  });

  assert.equal(socketErrors[0]?.message, PICK_GIFT_NOT_ON_TURN);
});