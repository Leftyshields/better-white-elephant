/**
 * Regression: pickGift must not delete a held gift when the picker already owns one.
 * When wrapped gifts remain, players may pick again (boomerang / claim-all-gifts paths).
 * Releasing the old gift must re-wrap it, not remove it from the game.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../engine.js';
import { buildStandardState, giftEntry } from './helpers/test-store.mjs';

const PARTY_ID = 'party-pick-held-test';
const BOOMERANG_CONFIG = { maxSteals: 3, returnToStart: true };

function allGiftIds(engine) {
  const unwrapped = [...engine.unwrappedGifts.keys()];
  const wrapped = [...engine.wrappedGifts];
  return { unwrapped, wrapped, union: new Set([...unwrapped, ...wrapped]) };
}

function countGifts(engine) {
  return engine.unwrappedGifts.size + engine.wrappedGifts.length;
}

test('pick while holding a gift re-wraps the old gift instead of deleting it', () => {
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
  assert.ok(engine.canPick('p3'));

  engine.pickGift('g-extra', 'p3');

  assert.equal(countGifts(engine), beforeCount, 'total gifts in play must not shrink');
  assert.equal(engine.unwrappedGifts.get('g3'), undefined, 'released gift must leave unwrapped map');
  assert.ok(
    engine.wrappedGifts.includes('g3'),
    'released gift must return to wrapped pile',
  );
  assert.equal(engine.unwrappedGifts.get('g-extra')?.ownerId, 'p3');
  assert.equal(
    [...engine.unwrappedGifts.values()].filter((g) => g.ownerId === 'p3').length,
    1,
    'picker owns exactly one gift',
  );
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
    /already held|invalid action/i,
    'pick must not stomp another owner',
  );
  assert.equal(engine.unwrappedGifts.get('g1')?.ownerId, 'p2');
});