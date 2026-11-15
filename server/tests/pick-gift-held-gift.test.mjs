/**
 * Regression: pickGift must not delete or overwrite held gifts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../engine.js';
import { buildStandardState, giftEntry } from './helpers/test-store.mjs';

const PARTY_ID = 'party-pick-held-test';
const BOOMERANG_CONFIG = { maxSteals: 3, returnToStart: true };

function countGifts(engine) {
  return engine.unwrappedGifts.size + engine.wrappedGifts.length;
}

test('pick is rejected when picker already holds an unwrapped gift', () => {
  const turnOrder = ['p1', 'p2', 'p3'];
  const turnQueue = [...turnOrder, ...[...turnOrder].reverse()];
  const state = {
    partyId: PARTY_ID,
    phase: 'ACTIVE',
    config: { ...BOOMERANG_CONFIG },
    turnOrder: [...turnOrder],
    turnQueue,
    currentTurnIndex: turnOrder.length,
    currentVictim: null,
    currentPlayerId: 'p3',
    wrappedGifts: ['g-extra'],
    unwrappedGifts: [
      giftEntry('g1', 'p1'),
      giftEntry('g2', 'p2'),
      giftEntry('g3', 'p3'),
    ],
    turnAction: [
      ['p1', 'PICKED'],
      ['p2', 'PICKED'],
      ['p3', null],
    ],
    history: [],
    stealStack: [],
    isBoomerangPhase: true,
  };

  const engine = new GameEngine(state, state.config);
  const beforeCount = countGifts(engine);
  assert.equal(engine.canPick('p3'), false);

  assert.throws(
    () => engine.pickGift('g-extra', 'p3'),
    /You already have a gift, so you can't open another one/,
  );

  assert.equal(countGifts(engine), beforeCount);
  assert.equal(engine.unwrappedGifts.get('g3')?.ownerId, 'p3');
  assert.ok(!engine.wrappedGifts.includes('g3'));
});

test('pick cannot overwrite a gift held by another player', () => {
  const state = buildStandardState({
    partyId: PARTY_ID,
    turnOrder: ['p1', 'p2'],
    currentTurnIndex: 0,
    wrappedGifts: ['g1'],
    unwrappedGifts: [giftEntry('g1', 'p2')],
    turnAction: [
      ['p1', null],
      ['p2', 'PICKED'],
    ],
  });
  state.currentPlayerId = 'p1';

  const engine = new GameEngine(state, state.config);

  assert.throws(
    () => engine.pickGift('g1', 'p1'),
    /That gift is already open/,
    'pick must not stomp another owner',
  );
  assert.equal(engine.unwrappedGifts.get('g1')?.ownerId, 'p2');
});