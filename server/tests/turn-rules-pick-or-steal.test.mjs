/**
 * Product turn rules (BUG-16):
 * - A turn is pick OR steal. Picking ends the turn, so a steal can't follow a pick, in any phase.
 * - When the same player is up again right away, that is a new turn, but they can't take back
 *   the gift they just lost (U-turn lock survives).
 * - A player can't pick their own wrapped gift unless it is the only wrapped gift left.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../engine.js';
import { assertPickGiftAllowed, PICK_GIFT_OWN_GIFT } from '../utils/pick-gift-guards.js';
import { giftEntry } from './helpers/test-store.mjs';

const STANDARD = { maxSteals: 3, returnToStart: false };
const BOOMERANG = { maxSteals: 3, returnToStart: true };
const STEAL_BACK_ERROR = /Cannot steal back a gift/;

function newGame({ turnOrder, config = STANDARD, wrappedGifts, giftSubmitters }) {
  const turnQueue = config.returnToStart
    ? [...turnOrder, ...[...turnOrder].reverse()]
    : [...turnOrder, turnOrder[0]];
  const state = {
    partyId: 'party-turn-rules',
    phase: 'ACTIVE',
    config,
    turnOrder: [...turnOrder],
    turnQueue,
    currentTurnIndex: 0,
    currentVictim: null,
    wrappedGifts: [...wrappedGifts],
    unwrappedGifts: [],
    turnAction: turnOrder.map((id) => [id, null]),
    history: [],
    stealStack: [],
    ...(giftSubmitters ? { giftSubmitters } : {}),
  };
  return new GameEngine(state, config);
}

/** Persist and reload like Redis does (JSON round trip). */
function rebuild(engine) {
  const saved = JSON.parse(JSON.stringify(engine.getState()));
  return new GameEngine(saved, saved.config);
}

/** A player who already picked but is still the active player (stale or clamped state). */
function stateWithActivePicker({ config, turnOrder, turnQueue, currentTurnIndex, activeId, unwrapped }) {
  const state = {
    partyId: 'party-turn-rules',
    phase: 'ACTIVE',
    config,
    turnOrder,
    turnQueue,
    currentTurnIndex,
    currentVictim: null,
    wrappedGifts: [],
    unwrappedGifts: unwrapped,
    turnAction: turnOrder.map((id) => [id, id === activeId ? 'PICKED' : null]),
    history: [],
    stealStack: [],
  };
  const engine = new GameEngine(state, config);
  assert.equal(engine.calculateActivePlayer(), activeId);
  return engine;
}

test('pick ends the turn: picker is marked PICKED and the next player is up', () => {
  const engine = newGame({ turnOrder: ['p1', 'p2', 'p3'], wrappedGifts: ['g1', 'g2', 'g3'] });
  engine.pickGift('g1', 'p1');
  assert.equal(engine.turnAction.get('p1'), 'PICKED');
  assert.equal(engine.currentPlayerId, 'p2');
  assert.equal(engine.canSteal('g1', 'p1'), false);
  assert.throws(() => engine.stealGift('g1', 'p1'));
});

test('steal after pick is rejected in standard phase', () => {
  const engine = stateWithActivePicker({
    config: STANDARD,
    turnOrder: ['p1', 'p2', 'p3'],
    turnQueue: ['p1', 'p2', 'p3', 'p1'],
    currentTurnIndex: 1,
    activeId: 'p2',
    unwrapped: [giftEntry('g1', 'p1'), giftEntry('g2', 'p2')],
  });
  assert.equal(engine.canSteal('g1', 'p2'), false);
  assert.throws(() => engine.stealGift('g1', 'p2'), /Cannot steal gift: invalid action/);
});

test('steal after pick is rejected in boomerang phase (no pick-then-swap)', () => {
  const engine = stateWithActivePicker({
    config: BOOMERANG,
    turnOrder: ['p1', 'p2', 'p3'],
    turnQueue: ['p1', 'p2', 'p3', 'p3', 'p2', 'p1'],
    currentTurnIndex: 4,
    activeId: 'p2',
    unwrapped: [giftEntry('g1', 'p1'), giftEntry('g2', 'p2'), giftEntry('g3', 'p3')],
  });
  assert.equal(engine.canSteal('g1', 'p2'), false);
  assert.throws(() => engine.stealGift('g1', 'p2'), /Cannot steal gift: invalid action/);
  assert.equal(engine.unwrappedGifts.get('g1').ownerId, 'p1');
});

test("steal after pick is rejected on Player 1's final (bookend) turn", () => {
  const engine = stateWithActivePicker({
    config: STANDARD,
    turnOrder: ['p1', 'p2', 'p3'],
    turnQueue: ['p1', 'p2', 'p3', 'p1'],
    currentTurnIndex: 3,
    activeId: 'p1',
    unwrapped: [giftEntry('g1', 'p1'), giftEntry('g2', 'p2'), giftEntry('g3', 'p3')],
  });
  assert.equal(engine.canSteal('g2', 'p1'), false);
  assert.throws(() => engine.stealGift('g2', 'p1'), /Cannot steal gift: invalid action/);
  assert.equal(engine.unwrappedGifts.get('g2').ownerId, 'p2');
});

test('2-player bookend: stolen-from player picks, gets a new turn, but cannot steal back the lost gift', () => {
  // Queue [g, h, g]: the Playtest BUG-16 game.
  const engine = newGame({ turnOrder: ['g', 'h'], wrappedGifts: ['candle', 'mug'] });
  engine.pickGift('candle', 'g');
  engine.stealGift('candle', 'h');
  assert.equal(engine.currentPlayerId, 'g'); // victim

  engine.pickGift('mug', 'g');

  // Same player is next in the queue: a fresh turn once the pick settles.
  assert.equal(engine.currentPlayerId, 'g');
  assert.equal(engine.turnAction.get('g'), null);
  // The lock on the gift g just lost survives the pick.
  assert.equal(engine.unwrappedGifts.get('candle').lastOwnerId, 'g');
  assert.throws(() => engine.canSteal('candle', 'g'), STEAL_BACK_ERROR);
  assert.throws(() => engine.stealGift('candle', 'g'), STEAL_BACK_ERROR);

  // Still blocked after a save and reload.
  const reloaded = rebuild(engine);
  assert.throws(() => reloaded.stealGift('candle', 'g'), STEAL_BACK_ERROR);

  // Keeping is allowed and ends the game.
  reloaded.endTurn();
  assert.equal(reloaded.phase, 'ENDED');
  assert.equal(reloaded.unwrappedGifts.get('candle').ownerId, 'h');
  assert.equal(reloaded.unwrappedGifts.get('mug').ownerId, 'g');
});

test('bookend new turn can still steal a different gift', () => {
  const engine = newGame({ turnOrder: ['p1', 'p2', 'p3'], wrappedGifts: ['g1', 'g2', 'g3'] });
  engine.pickGift('g1', 'p1');
  engine.pickGift('g2', 'p2');
  engine.stealGift('g1', 'p3'); // p1 is the victim
  engine.pickGift('g3', 'p1'); // bookend slot is p1 again

  assert.equal(engine.currentPlayerId, 'p1');
  assert.throws(() => engine.canSteal('g1', 'p1'), STEAL_BACK_ERROR);
  assert.equal(engine.canSteal('g2', 'p1'), true);
  engine.stealGift('g2', 'p1');
  assert.equal(engine.unwrappedGifts.get('g2').ownerId, 'p1');
});

test('boomerang turnaround: victim who skips and is up next cannot steal back the lost gift', () => {
  const engine = newGame({
    turnOrder: ['p1', 'p2', 'p3'],
    config: BOOMERANG,
    wrappedGifts: ['g1', 'g2', 'g3'],
  });
  engine.pickGift('g1', 'p1');
  engine.pickGift('g2', 'p2');
  engine.pickGift('g3', 'p3');
  assert.equal(engine.currentPlayerId, 'p3'); // turnaround slot
  engine.stealGift('g2', 'p3'); // swap: p2 now holds g3
  assert.equal(engine.currentPlayerId, 'p2');

  engine.endTurn(); // p2 keeps g3; next slot is p2 again

  assert.equal(engine.currentPlayerId, 'p2');
  assert.throws(() => engine.canSteal('g2', 'p2'), STEAL_BACK_ERROR);
  assert.equal(engine.canSteal('g1', 'p2'), true);
});

test('lock still clears when the turn passes to someone else', () => {
  const engine = newGame({ turnOrder: ['p1', 'p2', 'p3', 'p4'], wrappedGifts: ['g1', 'g2', 'g3', 'g4'] });
  engine.pickGift('g1', 'p1');
  engine.stealGift('g1', 'p2'); // p1 victim
  engine.pickGift('g2', 'p1'); // next is p3
  assert.equal(engine.currentPlayerId, 'p3');
  assert.equal(engine.unwrappedGifts.get('g1').lastOwnerId, null);
});

test('own gift: rejected while 2+ wrapped gifts remain', () => {
  const engine = newGame({
    turnOrder: ['p1', 'p2', 'p3'],
    wrappedGifts: ['g1', 'g2', 'g3'],
    giftSubmitters: { g1: 'p1', g2: 'p2', g3: 'p3' },
  });
  assert.equal(engine.canPick('p1', 'g1'), false);
  assert.equal(engine.canPick('p1', 'g2'), true);
  assert.throws(() => assertPickGiftAllowed(engine, 'p1', 'g1'), { message: PICK_GIFT_OWN_GIFT });
  assert.throws(() => engine.pickGift('g1', 'p1'), { message: PICK_GIFT_OWN_GIFT });
  assert.ok(engine.wrappedGifts.includes('g1'));

  engine.pickGift('g2', 'p1');
  assert.equal(engine.unwrappedGifts.get('g2').ownerId, 'p1');
});

test('own gift: allowed when it is the only wrapped gift left', () => {
  const engine = newGame({
    turnOrder: ['p1', 'p2', 'p3'],
    wrappedGifts: ['g1', 'g2', 'g3'],
    giftSubmitters: { g1: 'p2', g2: 'p1', g3: 'p3' },
  });
  engine.pickGift('g1', 'p1');
  engine.pickGift('g2', 'p2');
  assert.deepEqual(engine.wrappedGifts, ['g3']);
  assert.doesNotThrow(() => assertPickGiftAllowed(engine, 'p3', 'g3'));
  engine.pickGift('g3', 'p3');
  assert.equal(engine.unwrappedGifts.get('g3').ownerId, 'p3');
});

test('own gift: rule survives an engine rebuild from persisted state', () => {
  const engine = newGame({
    turnOrder: ['p1', 'p2', 'p3'],
    wrappedGifts: ['g1', 'g2', 'g3'],
    giftSubmitters: { g1: 'p1', g2: 'p2', g3: 'p3' },
  });
  engine.pickGift('g3', 'p1');
  const reloaded = rebuild(engine);
  assert.deepEqual(reloaded.getState().giftSubmitters, { g1: 'p1', g2: 'p2', g3: 'p3' });
  assert.throws(() => assertPickGiftAllowed(reloaded, 'p2', 'g2'), { message: PICK_GIFT_OWN_GIFT });
  assert.throws(() => reloaded.pickGift('g2', 'p2'), { message: PICK_GIFT_OWN_GIFT });
});

test('own gift: games started before the rule (no giftSubmitters) still allow the pick', () => {
  const engine = newGame({ turnOrder: ['p1', 'p2', 'p3'], wrappedGifts: ['g1', 'g2', 'g3'] });
  assert.equal(engine.getState().giftSubmitters, null);
  assert.doesNotThrow(() => assertPickGiftAllowed(engine, 'p1', 'g1'));
  engine.pickGift('g1', 'p1');
  assert.equal(engine.unwrappedGifts.get('g1').ownerId, 'p1');
});
