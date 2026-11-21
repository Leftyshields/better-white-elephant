/**
 * Pick-gift socket handler: validation and broadcast only after atomic commit.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { END_TURN_GAME_NOT_FOUND } from '../utils/end-turn-guards.js';
import { SOCKET_ACTION_FAILED_GENERIC_MESSAGE } from '../utils/socket-error-copy.js';
import {
  PICK_GIFT_ALREADY_HOLDING,
  PICK_GIFT_ALREADY_OPEN,
  PICK_GIFT_NOT_IN_WRAPPED_PILE,
  PICK_GIFT_NOT_ON_TURN,
  PICK_GIFT_OWN_GIFT,
  assertPickGiftAllowed,
} from '../utils/pick-gift-guards.js';
import { GameEngine } from '../engine.js';
import { buildStandardState, createTestStore, mockIo } from './helpers/test-store.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..');

mock.module('firebase-admin', {
  defaultExport: {
    firestore: {
      Timestamp: { now: () => ({}) },
    },
    credential: {
      cert: () => ({}),
    },
    initializeApp: () => ({}),
  },
});

const firebaseAdminPath = path.join(serverRoot, 'config/firebase-admin.js');
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

const { handlePickGift } = await import('../handlers/pick-gift.js');

const PARTY_ID = 'party-pick-handler';

function isValidPartyId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]+$/.test(id);
}
function isValidGiftId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]+$/.test(id);
}

test('rejecting invalid wrapped id: no action_started or game-updated', async () => {
  const store = createTestStore();
  await store.saveGameState(
    PARTY_ID,
    buildStandardState({
      partyId: PARTY_ID,
      turnOrder: ['p1', 'p2'],
      currentTurnIndex: 0,
      wrappedGifts: ['g-valid'],
    }),
  );

  const io = mockIo();
  const socketErrors = [];
  const socket = {
    userId: 'p1',
    emit(event, payload) {
      if (event === 'error') socketErrors.push(payload);
    },
  };

  await handlePickGift({
    partyId: PARTY_ID,
    giftId: 'g-phantom',
    userId: 'p1',
    socket,
    io,
    isValidPartyId,
    isValidGiftId,
    verifyPartyMembership: async () => true,
    scheduleBotMove: null,
    executePick: async () => {
      throw new Error(PICK_GIFT_NOT_IN_WRAPPED_PILE);
    },
  });

  assert.equal(socketErrors[0]?.message, PICK_GIFT_NOT_IN_WRAPPED_PILE);
  const roomEvents = io.emissions.filter((e) => e.event !== 'error');
  assert.equal(roomEvents.filter((e) => e.event === 'action_started').length, 0);
  assert.equal(roomEvents.filter((e) => e.event === 'game-updated').length, 0);
});

test('socket copy strings match Copywriter final text', async () => {
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
    scheduleBotMove: null,
    executePick: async () => {
      throw new Error(PICK_GIFT_ALREADY_HOLDING);
    },
  });

  assert.equal(socketErrors[0]?.message, PICK_GIFT_ALREADY_HOLDING);

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
    scheduleBotMove: null,
    executePick: async () => {
      throw new Error(PICK_GIFT_ALREADY_OPEN);
    },
  });

  assert.equal(socketErrors2[0]?.message, PICK_GIFT_ALREADY_OPEN);
});

test('missing game state returns shared game-not-found copy', async () => {
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
    scheduleBotMove: null,
    executePick: async () => {
      throw new Error('Game not found');
    },
  });

  assert.equal(socketErrors[0]?.message, END_TURN_GAME_NOT_FOUND);
});

test('pick when not active player returns not-on-turn copy', async () => {
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
    scheduleBotMove: null,
    executePick: async () => {
      throw new Error(PICK_GIFT_NOT_ON_TURN);
    },
  });

  assert.equal(socketErrors[0]?.message, PICK_GIFT_NOT_ON_TURN);
});

test('successful pick broadcasts only after atomic executePick resolves', async () => {
  const io = mockIo();
  const emissionLog = [];
  const trackingIo = {
    to() {
      return {
        emit(event, payload) {
          emissionLog.push(event);
          io.to(`party:${PARTY_ID}`).emit(event, payload);
        },
      };
    },
  };

  const newState = { partyId: PARTY_ID, phase: 'ACTIVE', wrappedGifts: [] };
  await handlePickGift({
    partyId: PARTY_ID,
    giftId: 'g-valid',
    userId: 'p1',
    socket: { userId: 'p1', emit() {} },
    io: trackingIo,
    isValidPartyId,
    isValidGiftId,
    verifyPartyMembership: async () => true,
    scheduleBotMove: null,
    executePick: async () => {
      assert.equal(emissionLog.length, 0, 'must not broadcast before executePick resolves');
      return { newState };
    },
  });

  assert.deepEqual(emissionLog, ['action_started', 'game-updated']);
});

test('failed executePick: no action_started or game-updated', async () => {
  const io = mockIo();
  const socketErrors = [];
  const socket = {
    userId: 'p1',
    emit(event, payload) {
      if (event === 'error') socketErrors.push(payload);
    },
  };

  await handlePickGift({
    partyId: PARTY_ID,
    giftId: 'g-valid',
    userId: 'p1',
    socket,
    io,
    isValidPartyId,
    isValidGiftId,
    verifyPartyMembership: async () => true,
    scheduleBotMove: null,
    executePick: async () => {
      throw new Error('persist failed');
    },
  });

  assert.equal(socketErrors[0]?.message, SOCKET_ACTION_FAILED_GENERIC_MESSAGE);
  const roomEvents = io.emissions.filter((e) => e.event !== 'error');
  assert.equal(roomEvents.filter((e) => e.event === 'action_started').length, 0);
  assert.equal(roomEvents.filter((e) => e.event === 'game-updated').length, 0);
});
test('picking your own wrapped gift sends the own-gift copy and broadcasts nothing', async () => {
  const state = buildStandardState({
    partyId: PARTY_ID,
    turnOrder: ['p1', 'p2'],
    currentTurnIndex: 0,
    wrappedGifts: ['g1', 'g2'],
  });
  state.giftSubmitters = { g1: 'p1', g2: 'p2' };

  const io = mockIo();
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
    io,
    isValidPartyId,
    isValidGiftId,
    verifyPartyMembership: async () => true,
    scheduleBotMove: null,
    executePick: async () => {
      assertPickGiftAllowed(new GameEngine(structuredClone(state), state.config), 'p1', 'g1');
    },
  });

  assert.equal(socketErrors[0]?.message, PICK_GIFT_OWN_GIFT);
  assert.equal(io.emissions.filter((e) => e.event === 'game-updated').length, 0);
});

// BUG-18: a pick can end the game when the next player has no legal move left.
function pickHandlerArgs(newState, calls) {
  return {
    partyId: PARTY_ID,
    giftId: 'hostGift',
    userId: 'host',
    socket: { emit: (event, payload) => calls.push(['socket', event, payload]) },
    io: mockIo(),
    isValidPartyId: () => true,
    isValidGiftId: () => true,
    verifyPartyMembership: async () => true,
    scheduleBotMove: () => calls.push(['scheduleBotMove']),
    finalizeEndedGame: async (partyId, state) => calls.push(['finalize', partyId, state.phase]),
    executePick: async () => ({ newState }),
  };
}

test('a pick that ends the game is finalized (party ENDED, winners) and no bot move is scheduled', async () => {
  const calls = [];
  await handlePickGift(pickHandlerArgs({ phase: 'ENDED' }, calls));
  assert.deepEqual(calls, [['finalize', PARTY_ID, 'ENDED']]);
});

test('a pick that keeps the game going is not finalized', async () => {
  const calls = [];
  await handlePickGift(pickHandlerArgs({ phase: 'ACTIVE' }, calls));
  assert.deepEqual(calls, [['scheduleBotMove']]);
});
