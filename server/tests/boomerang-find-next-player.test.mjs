/**
 * Regression tests for Boomerang reverse-pass turn advancement (findNextValidPlayer).
 * Imports GameEngine directly; no module mocks (Node 18/20+ compatible).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../engine.js';
import { giftEntry } from './helpers/test-store.mjs';

const PARTY_ID = 'party-boomerang-test';
const BOOMERANG_CONFIG = { maxSteals: 3, returnToStart: true };

function buildBoomerangTurnQueue(turnOrder) {
  return [...turnOrder, ...[...turnOrder].reverse()];
}

function buildBoomerangState({
  turnOrder,
  currentTurnIndex,
  wrappedGifts,
  unwrappedGifts = [],
  turnAction,
}) {
  const turnQueue = buildBoomerangTurnQueue(turnOrder);
  return {
    partyId: PARTY_ID,
    phase: 'ACTIVE',
    config: { ...BOOMERANG_CONFIG },
    turnOrder: [...turnOrder],
    turnQueue,
    currentTurnIndex,
    currentVictim: null,
    currentPlayerId: turnQueue[currentTurnIndex],
    wrappedGifts: [...wrappedGifts],
    unwrappedGifts: [...unwrappedGifts],
    turnAction: turnAction ?? turnOrder.map((id) => [id, null]),
    history: [],
    stealStack: [],
    isBoomerangPhase: currentTurnIndex >= turnOrder.length,
  };
}

function engineFromState(state) {
  return new GameEngine(state, state.config);
}

test('findNextValidPlayer in boomerang starts at currentTurnIndex, not one slot ahead', () => {
  const turnOrder = ['p1', 'p2', 'p3', 'p4'];
  const turnQueue = buildBoomerangTurnQueue(turnOrder);
  // Caller already incremented into boomerang: index 4 is second P4 (transition slot).
  const state = buildBoomerangState({
    turnOrder,
    currentTurnIndex: 4,
    wrappedGifts: [],
    unwrappedGifts: turnOrder.map((id, i) => giftEntry(`g${i}`, id)),
  });
  const engine = engineFromState(state);
  assert.equal(engine.findNextValidPlayer(), turnQueue[4]);
});

test('after last forward pick, reverse pass begins on duplicated last player (3 players)', () => {
  const turnOrder = ['p1', 'p2', 'p3'];
  const state = buildBoomerangState({
    turnOrder,
    currentTurnIndex: 2,
    wrappedGifts: ['g3'],
    unwrappedGifts: [
      giftEntry('g1', 'p1'),
      giftEntry('g2', 'p2'),
    ],
    turnAction: [
      ['p1', 'PICKED'],
      ['p2', 'PICKED'],
      ['p3', null],
    ],
  });
  state.currentPlayerId = 'p3';
  const engine = engineFromState(state);

  engine.pickGift('g3', 'p3');

  assert.equal(engine.currentTurnIndex, 3, 'P3 must get the first reverse-pass slot (index 3)');
  assert.equal(engine.currentPlayerId, 'p3');
});

test('reverse pass visits every player for 4-party boomerang picks', () => {
  const turnOrder = ['a', 'b', 'c', 'd'];
  const turnQueue = buildBoomerangTurnQueue(turnOrder);
  const gifts = ['g0', 'g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7'];
  let wrapped = [...gifts];
  const unwrapped = [];
  const turnAction = turnOrder.map((id) => [id, null]);

  let state = buildBoomerangState({
    turnOrder,
    currentTurnIndex: 0,
    wrappedGifts: wrapped,
    unwrappedGifts: unwrapped,
    turnAction,
  });
  state.currentPlayerId = 'a';

  const playersInPickOrder = [
    'a', 'b', 'c', 'd',
    'd', 'c', 'b', 'a',
  ];

  for (const expected of playersInPickOrder) {
    const engine = engineFromState(state);
    const active = engine.calculateActivePlayer();
    assert.equal(active, expected, `active before pick should be ${expected}`);
    const giftId = engine.wrappedGifts[0];
    assert.ok(giftId, `wrapped gift required for ${expected}`);
    engine.pickGift(giftId, active);
    state = engine.getState();
    wrapped = state.wrappedGifts;
  }

  assert.equal(state.currentTurnIndex, turnQueue.length);
  assert.equal(state.currentPlayerId, 'a');
});

test('standard mode bookend pick still advances exactly one queue slot', () => {
  const turnOrder = ['p1', 'p2', 'p3'];
  const turnQueue = [...turnOrder, turnOrder[0]];
  const state = {
    partyId: PARTY_ID,
    phase: 'ACTIVE',
    config: { maxSteals: 3, returnToStart: false },
    turnOrder: [...turnOrder],
    turnQueue,
    currentTurnIndex: 1,
    currentVictim: null,
    currentPlayerId: 'p2',
    wrappedGifts: ['g3'],
    unwrappedGifts: [giftEntry('g1', 'p1')],
    turnAction: [
      ['p1', 'PICKED'],
      ['p2', null],
      ['p3', null],
    ],
    history: [],
    stealStack: [],
    isBoomerangPhase: false,
  };

  const engine = new GameEngine(state, state.config);
  engine.pickGift('g3', 'p2');

  assert.equal(engine.currentTurnIndex, 2);
  assert.equal(engine.currentPlayerId, 'p3');
});

test('5-player boomerang: stepping through reverse pass does not skip interior players', () => {
  const turnOrder = ['p1', 'p2', 'p3', 'p4', 'p5'];
  const turnQueue = buildBoomerangTurnQueue(turnOrder);
  // Last player just finished forward pass at index 4; pick advanced index to 5 (start of reverse).
  const state = buildBoomerangState({
    turnOrder,
    currentTurnIndex: 5,
    wrappedGifts: ['gx'],
    unwrappedGifts: turnOrder.map((id, i) => giftEntry(`g${i}`, id)),
    turnAction: turnOrder.map((id) => [id, id === 'p5' ? null : 'PICKED']),
  });
  state.currentPlayerId = 'p4';

  const engine = engineFromState(state);
  // Simulate end-of-turn advance from index 4 -> 5 (reverse starts at p4, not p3).
  const next = engine.findNextValidPlayer();
  assert.equal(next, turnQueue[5], 'reverse pass must include p4 at queue index 5');
});
