/**
 * Simulated Boomerang games (bot-style decisions) must finish without stalling,
 * with one gift per player and no wrapped gifts left.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../engine.js';

const PARTY_ID = 'party-boomerang-full';
const CONFIG = { maxSteals: 3, returnToStart: true };
const MAX_STEPS = 500;

function buildBoomerangTurnQueue(turnOrder) {
  return [...turnOrder, ...[...turnOrder].reverse()];
}

function initialState(turnOrder) {
  const gifts = turnOrder.map((_, i) => `g${i}`);
  const turnQueue = buildBoomerangTurnQueue(turnOrder);
  return {
    partyId: PARTY_ID,
    phase: 'ACTIVE',
    config: { ...CONFIG },
    turnOrder: [...turnOrder],
    turnQueue,
    currentTurnIndex: 0,
    currentVictim: null,
    currentPlayerId: turnQueue[0],
    wrappedGifts: [...gifts],
    unwrappedGifts: [],
    turnAction: turnOrder.map((id) => [id, null]),
    history: [],
    stealStack: [],
    isBoomerangPhase: false,
  };
}

function botLikeDecision(engine, playerId) {
  const isVictim = engine.currentVictim === playerId;
  const hasGift = engine.playerHasGift(playerId);

  if (isVictim && !hasGift && engine.canPick(playerId)) {
    const giftId = engine.wrappedGifts[Math.floor(Math.random() * engine.wrappedGifts.length)];
    return { action: 'pick', giftId };
  }

  if (!hasGift && engine.canPick(playerId)) {
    const giftId = engine.wrappedGifts[Math.floor(Math.random() * engine.wrappedGifts.length)];
    return { action: 'pick', giftId };
  }

  if (hasGift && engine.isInBoomerangPhase()) {
    const stealable = [];
    for (const [giftId, gift] of engine.unwrappedGifts.entries()) {
      try {
        if (engine.canSteal(giftId, playerId)) stealable.push(giftId);
      } catch {
        // U-turn block throws
      }
    }
    if (stealable.length > 0) {
      const giftId = stealable[Math.floor(Math.random() * stealable.length)];
      return { action: 'steal', giftId };
    }
    return { action: 'skip' };
  }

  if (hasGift) {
    return { action: 'skip' };
  }

  const stealable = [];
  for (const [giftId, gift] of engine.unwrappedGifts.entries()) {
    try {
      if (engine.canSteal(giftId, playerId)) stealable.push(giftId);
    } catch {
      // U-turn block throws
    }
  }
  if (stealable.length > 0) {
    const giftId = stealable[Math.floor(Math.random() * stealable.length)];
    return { action: 'steal', giftId };
  }

  if (engine.canPick(playerId)) {
    return { action: 'pick', giftId: engine.wrappedGifts[0] };
  }

  return { action: 'skip' };
}

function applyDecision(engine, playerId, decision) {
  if (decision.action === 'pick') {
    engine.pickGift(decision.giftId, playerId);
    return;
  }
  if (decision.action === 'steal') {
    engine.stealGift(decision.giftId, playerId);
    return;
  }
  if (decision.action === 'skip') {
    engine.currentPlayerId = playerId;
    engine.endTurn();
    return;
  }
  throw new Error(`Unknown action: ${decision.action}`);
}

function activeHasLegalMove(engine, playerId) {
  if (engine.canPick(playerId)) return true;
  for (const giftId of engine.unwrappedGifts.keys()) {
    try {
      if (engine.canSteal(giftId, playerId)) return true;
    } catch {
      // U-turn violation throws
    }
  }
  if (engine.playerHasGift(playerId)) return true;
  if (engine.currentVictim === playerId) return true;
  return false;
}

function runSimulatedBoomerangGame(turnOrder) {
  const state = initialState(turnOrder);
  const engine = new GameEngine(state, CONFIG);
  let steps = 0;

  while (engine.phase !== 'ENDED' && steps < MAX_STEPS) {
    const playerId = engine.calculateActivePlayer();
    engine.currentPlayerId = playerId;

    assert.ok(
      activeHasLegalMove(engine, playerId),
      `stall: no legal move for ${playerId} at step ${steps}`,
    );

    const decision = botLikeDecision(engine, playerId);
    applyDecision(engine, playerId, decision);
    steps += 1;

    if (engine.shouldGameEnd()) {
      engine.phase = 'ENDED';
    }
  }

  assert.equal(engine.phase, 'ENDED', `game did not end within ${MAX_STEPS} steps`);
  assert.equal(engine.wrappedGifts.length, 0, 'wrapped gifts must be empty');

  const owners = new Map();
  for (const [giftId, gift] of engine.unwrappedGifts.entries()) {
    assert.ok(gift.ownerId, `gift ${giftId} missing owner`);
    owners.set(gift.ownerId, (owners.get(gift.ownerId) || 0) + 1);
  }

  for (const playerId of turnOrder) {
    assert.equal(owners.get(playerId) || 0, 1, `player ${playerId} must hold exactly one gift`);
  }
  assert.equal(engine.unwrappedGifts.size, turnOrder.length);
}

for (const playerCount of [2, 3, 4, 5, 6]) {
  test(`boomerang simulation finishes with ${playerCount} players`, () => {
    const turnOrder = Array.from({ length: playerCount }, (_, i) => `p${i}`);
    runSimulatedBoomerangGame(turnOrder);
  });
}

test('engine rejects pick when picker already holds an unwrapped gift', () => {
  const turnOrder = ['p1', 'p2', 'p3'];
  const state = initialState(turnOrder);
  state.currentTurnIndex = turnOrder.length;
  state.wrappedGifts = ['g-extra'];
  state.unwrappedGifts = turnOrder.map((id, i) => [
    `g${i}`,
    { ownerId: id, stealCount: 0, isFrozen: false, lastOwnerId: null },
  ]);
  state.currentPlayerId = 'p2';

  const engine = new GameEngine(state, CONFIG);
  const expected =
    "You already have a gift, so you can't open another one. Steal one instead, or skip your turn.";
  assert.throws(() => engine.pickGift('g-extra', 'p2'), (err) => {
    assert.equal(err.message, expected);
    return true;
  });
});