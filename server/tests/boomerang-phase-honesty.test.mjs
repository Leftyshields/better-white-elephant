/**
 * Regression: isBoomerangPhase and boomerang UI strings must not appear when returnToStart is false.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../engine.js';
import { giftEntry } from './helpers/test-store.mjs';

const PARTY_ID = 'party-boomerang-honesty';

function standardBookendState({ turnOrder, currentTurnIndex, unwrappedGifts = [] }) {
  const turnQueue = [...turnOrder, turnOrder[0]];
  return {
    partyId: PARTY_ID,
    phase: 'ACTIVE',
    config: { maxSteals: 3, returnToStart: false },
    turnOrder: [...turnOrder],
    turnQueue,
    currentTurnIndex,
    currentVictim: null,
    currentPlayerId: turnQueue[currentTurnIndex],
    wrappedGifts: [],
    unwrappedGifts: [...unwrappedGifts],
    turnAction: turnOrder.map((id) => [id, null]),
    history: [],
    stealStack: [],
    isBoomerangPhase: false,
  };
}

test('standard mode: Player 1 final turn does not set isBoomerangPhase when returnToStart is false', () => {
  const turnOrder = ['p1', 'p2', 'p3', 'p4'];
  const finalIndex = turnOrder.length; // bookend slot (Player 1 again)
  const state = standardBookendState({
    turnOrder,
    currentTurnIndex: finalIndex,
    unwrappedGifts: turnOrder.map((id, i) => giftEntry(`g${i}`, id)),
  });

  const engine = new GameEngine(state, state.config);
  const out = engine.getState();

  assert.equal(
    out.isBoomerangPhase,
    false,
    'last-turn index must not be labeled boomerang when boomerang rule is off',
  );
  assert.equal(out.config.returnToStart, false);
});

test('boomerang mode: second half of queue sets isBoomerangPhase when returnToStart is true', () => {
  const turnOrder = ['p1', 'p2', 'p3'];
  const turnQueue = [...turnOrder, ...[...turnOrder].reverse()];
  const state = {
    partyId: PARTY_ID,
    phase: 'ACTIVE',
    config: { maxSteals: 3, returnToStart: true },
    turnOrder: [...turnOrder],
    turnQueue,
    currentTurnIndex: turnOrder.length,
    currentVictim: null,
    currentPlayerId: turnQueue[turnOrder.length],
    wrappedGifts: [],
    unwrappedGifts: turnOrder.map((id, i) => giftEntry(`g${i}`, id)),
    turnAction: turnOrder.map((id) => [id, 'PICKED']),
    history: [],
    stealStack: [],
    isBoomerangPhase: true,
  };

  const engine = new GameEngine(state, state.config);
  const out = engine.getState();

  assert.equal(out.isBoomerangPhase, true);
  assert.equal(out.config.returnToStart, true);
});

test('standard mode: isBoomerangPhase stays false for every turn index when returnToStart is false', () => {
  const turnOrder = ['p1', 'p2', 'p3'];
  const turnQueue = [...turnOrder, turnOrder[0]];

  for (let index = 0; index <= turnQueue.length - 1; index++) {
    const state = standardBookendState({
      turnOrder,
      currentTurnIndex: index,
      unwrappedGifts: turnOrder.map((id, i) => giftEntry(`g${i}`, id)),
    });
    const engine = new GameEngine(state, state.config);
    assert.equal(
      engine.getState().isBoomerangPhase,
      false,
      `index ${index} should not be boomerang phase in standard mode`,
    );
  }
});
