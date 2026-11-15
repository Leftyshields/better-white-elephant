import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../engine.js';
import { buildStandardState } from './helpers/test-store.mjs';

test('canPick and canSteal are false when phase is not ACTIVE', () => {
  const base = buildStandardState({
    partyId: 'party-ended',
    turnOrder: ['p1', 'p2'],
    currentTurnIndex: 0,
    wrappedGifts: ['g1', 'g2'],
  });
  base.phase = 'ENDED';

  const engine = new GameEngine(base, base.config);

  assert.equal(engine.canPick('p1'), false);
  assert.equal(engine.canSteal('g-open', 'p1'), false);
});