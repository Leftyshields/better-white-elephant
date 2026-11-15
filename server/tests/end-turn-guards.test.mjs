import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStandardState } from './helpers/test-store.mjs';
import { getEndTurnRejectionReason } from '../utils/end-turn-guards.js';

test('getEndTurnRejectionReason: rejects ENDED game without mutating state', () => {
  const state = buildStandardState({
    turnOrder: ['p1', 'p2'],
    currentTurnIndex: 0,
    wrappedGifts: ['g1'],
  });
  state.phase = 'ENDED';
  const before = structuredClone(state);

  const reason = getEndTurnRejectionReason(state, 'p1');

  assert.equal(reason, 'Game has already ended');
  assert.deepEqual(state, before);
});

test('getEndTurnRejectionReason: rejects non-ACTIVE game', () => {
  const state = buildStandardState({
    turnOrder: ['p1', 'p2'],
    currentTurnIndex: 0,
    wrappedGifts: ['g1'],
  });
  state.phase = 'LOBBY';

  assert.equal(getEndTurnRejectionReason(state, 'p1'), 'Cannot end turn: invalid action');
});

test('getEndTurnRejectionReason: rejects sender who is not the active player', () => {
  const state = buildStandardState({
    turnOrder: ['p1', 'p2'],
    currentTurnIndex: 0,
    wrappedGifts: ['g1'],
  });

  assert.equal(getEndTurnRejectionReason(state, 'p2'), 'Cannot end turn: invalid action');
});

test('getEndTurnRejectionReason: allows active player during ACTIVE game', () => {
  const state = buildStandardState({
    turnOrder: ['p1', 'p2'],
    currentTurnIndex: 0,
    wrappedGifts: ['g1'],
  });

  assert.equal(getEndTurnRejectionReason(state, 'p1'), null);
});

test('getEndTurnRejectionReason: active player is currentVictim during steal chain', () => {
  const state = buildStandardState({
    turnOrder: ['p1', 'p2', 'p3'],
    currentTurnIndex: 1,
    wrappedGifts: [],
  });
  state.currentVictim = 'p3';
  state.currentPlayerId = 'p3';

  assert.equal(getEndTurnRejectionReason(state, 'p2'), 'Cannot end turn: invalid action');
  assert.equal(getEndTurnRejectionReason(state, 'p3'), null);
});