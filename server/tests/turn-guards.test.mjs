/**
 * Turn guards follow-up to PR 120 (ledger A12 / BUG-18, Security should-fixes 1 and 2):
 * - Picking your own last gift ends the turn cleanly; nobody is left holding a turn with no legal move.
 * - Own-gift pick is allowed when every remaining wrapped gift is the player's own (no deadlock).
 * - The server rejects a skip once turnAction is set for that player.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../engine.js';
import {
  assertPickGiftAllowed,
  pickableWrappedGifts,
  PICK_GIFT_OWN_GIFT,
} from '../utils/pick-gift-guards.js';
import { END_TURN_SOCKET_ERROR, getEndTurnRejectionReason } from '../utils/end-turn-guards.js';
import { buildStandardState, giftEntry } from './helpers/test-store.mjs';

const STANDARD = { maxSteals: 3, returnToStart: false };

function newGame({ turnOrder, wrappedGifts, giftSubmitters }) {
  const state = {
    partyId: 'party-turn-guards',
    phase: 'ACTIVE',
    config: STANDARD,
    turnOrder: [...turnOrder],
    turnQueue: [...turnOrder, turnOrder[0]],
    currentTurnIndex: 0,
    currentVictim: null,
    wrappedGifts: [...wrappedGifts],
    unwrappedGifts: [],
    turnAction: turnOrder.map((id) => [id, null]),
    history: [],
    stealStack: [],
    giftSubmitters,
  };
  return new GameEngine(state, STANDARD);
}

test('BUG-18 repro: host picks their own last gift and the turn ends instead of sticking', () => {
  // Playtest 1116 C: host goes first and picks the guest's gift, the guest steals it back,
  // then the host picks their own gift, the only wrapped gift left.
  const engine = newGame({
    turnOrder: ['host', 'guest'],
    wrappedGifts: ['hostGift', 'guestGift'],
    giftSubmitters: { hostGift: 'host', guestGift: 'guest' },
  });
  engine.pickGift('guestGift', 'host');
  engine.stealGift('guestGift', 'guest');
  assert.equal(engine.currentPlayerId, 'host');

  assert.doesNotThrow(() => assertPickGiftAllowed(engine, 'host', 'hostGift'));
  const state = engine.pickGift('hostGift', 'host');

  // Before the fix: phase ACTIVE, host still up ("Your Turn!", Skip) with nothing to do.
  assert.equal(state.phase, 'ENDED');
  assert.deepEqual(
    state.history.map((h) => [h.type, h.playerId]),
    [
      ['PICK', 'host'],
      ['STEAL', 'guest'],
      ['PICK', 'host'],
      ['END_TURN', 'host'],
    ],
  );
  assert.equal(engine.unwrappedGifts.get('guestGift').ownerId, 'guest');
  assert.equal(engine.unwrappedGifts.get('hostGift').ownerId, 'host');
});

test('a bookend player who still has a legal steal keeps the turn (no over-eager auto-skip)', () => {
  const engine = newGame({
    turnOrder: ['p1', 'p2', 'p3'],
    wrappedGifts: ['g1', 'g2', 'g3'],
    giftSubmitters: { g1: 'p2', g2: 'p3', g3: 'p1' },
  });
  engine.pickGift('g1', 'p1');
  engine.pickGift('g2', 'p2');
  engine.pickGift('g3', 'p3');
  assert.equal(engine.phase, 'ACTIVE');
  assert.equal(engine.currentPlayerId, 'p1');
  assert.equal(engine.hasLegalMove('p1'), true);
  assert.equal(engine.history.filter((h) => h.type === 'END_TURN').length, 0);
});

test("all remaining wrapped gifts are the player's own: the pick is allowed, so the game cannot deadlock", () => {
  // p2 brought two gifts and p3 brought none, so after p1 opens one of p2's, p2 faces only their own.
  const engine = newGame({
    turnOrder: ['p1', 'p2', 'p3'],
    wrappedGifts: ['g1', 'g2', 'g3'],
    giftSubmitters: { g1: 'p2', g2: 'p2', g3: 'p2' },
  });
  engine.pickGift('g1', 'p1');
  assert.equal(engine.currentPlayerId, 'p2');

  // Before the fix: canPick false for both and pickable empty, so p2 (or a bot) was stuck.
  assert.deepEqual(pickableWrappedGifts(engine, 'p2'), ['g2', 'g3']);
  assert.equal(engine.canPick('p2', 'g2'), true);
  assert.doesNotThrow(() => assertPickGiftAllowed(engine, 'p2', 'g2'));
  engine.pickGift('g2', 'p2');
  assert.equal(engine.unwrappedGifts.get('g2').ownerId, 'p2');
});

test("own gift stays blocked while any other player's wrapped gift remains", () => {
  const engine = newGame({
    turnOrder: ['p1', 'p2', 'p3'],
    wrappedGifts: ['g1', 'g2', 'g3'],
    giftSubmitters: { g1: 'p1', g2: 'p1', g3: 'p2' },
  });
  assert.deepEqual(pickableWrappedGifts(engine, 'p1'), ['g3']);
  assert.throws(() => assertPickGiftAllowed(engine, 'p1', 'g1'), { message: PICK_GIFT_OWN_GIFT });
  assert.throws(() => engine.pickGift('g2', 'p1'), { message: PICK_GIFT_OWN_GIFT });
});

test('skip is rejected once the active player already picked this turn (stale state)', () => {
  const state = buildStandardState({
    turnOrder: ['p1', 'p2', 'p3'],
    currentTurnIndex: 1,
    wrappedGifts: ['g3'],
    unwrappedGifts: [giftEntry('g1', 'p1'), giftEntry('g2', 'p2')],
    turnAction: [
      ['p1', 'PICKED'],
      ['p2', 'PICKED'],
      ['p3', null],
    ],
  });
  assert.equal(getEndTurnRejectionReason(state, 'p2'), END_TURN_SOCKET_ERROR);
});

test('skip is rejected once the active player already stole this turn', () => {
  const state = buildStandardState({
    turnOrder: ['p1', 'p2'],
    currentTurnIndex: 2,
    wrappedGifts: [],
    unwrappedGifts: [giftEntry('g1', 'p1'), giftEntry('g2', 'p2')],
    turnAction: [
      ['p1', 'STOLEN'],
      ['p2', null],
    ],
  });
  assert.equal(getEndTurnRejectionReason(state, 'p1'), END_TURN_SOCKET_ERROR);
});

test('skip is still allowed for the active player who has not acted (bookend keep)', () => {
  const state = buildStandardState({
    turnOrder: ['p1', 'p2'],
    currentTurnIndex: 2,
    wrappedGifts: [],
    unwrappedGifts: [giftEntry('g1', 'p1'), giftEntry('g2', 'p2')],
  });
  assert.equal(getEndTurnRejectionReason(state, 'p1'), null);
});
