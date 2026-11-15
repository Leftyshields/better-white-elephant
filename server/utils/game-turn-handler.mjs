/**
 * Turn actions (pick, steal, end turn) with atomic state persistence.
 */
import { GameEngine } from '../engine.js';
import { runAtomicGameMutation, GameStateConflictError, isGameStateConflictError } from './atomic-game-action.mjs';
import { assertPickGiftAllowed } from './pick-gift-guards.js';
import { getEndTurnRejectionReason } from './end-turn-guards.js';
import { isBot } from './bot-ids.js';

export { GameStateConflictError, isGameStateConflictError };

export class BotTurnStaleError extends Error {
  constructor() {
    super('Bot turn no longer active');
    this.name = 'BotTurnStaleError';
    this.code = 'BOT_TURN_STALE';
  }
}

export function isBotTurnStaleError(error) {
  return error?.code === 'BOT_TURN_STALE' || error instanceof BotTurnStaleError;
}

const GAME_NOT_READY_TO_END = 'GAME_NOT_READY_TO_END';

function buildEngine(gameState, partyId) {
  const config = gameState.config || { maxSteals: 3, returnToStart: false };
  gameState.partyId = partyId;
  return new GameEngine(gameState, config);
}

function mutateWithEngine(gameState, partyId, playerId, mutate) {
  if (gameState.phase === 'ENDED') {
    throw new Error('Game has already ended');
  }
  if (gameState.partyId && gameState.partyId !== partyId) {
    throw new Error('Game state party ID mismatch');
  }

  const engine = buildEngine(gameState, partyId);

  if (playerId != null) {
    const activePlayer = engine.calculateActivePlayer();
    if (activePlayer !== playerId) {
      throw new Error('Not your turn');
    }
  }

  mutate(engine);

  const newState = engine.getState();
  newState.config = gameState.config;
  newState.partyId = partyId;
  return newState;
}

export async function executePickGift(partyId, giftId, playerId, options = {}) {
  return runAtomicGameMutation(
    partyId,
    (gameState) => {
      const engine = buildEngine(gameState, partyId);
      assertPickGiftAllowed(engine, playerId, giftId);
      engine.pickGift(giftId, playerId);
      const newState = engine.getState();
      newState.config = gameState.config;
      newState.partyId = partyId;
      return newState;
    },
    options,
  );
}

export async function executeStealGift(partyId, giftId, playerId, options = {}) {
  return runAtomicGameMutation(
    partyId,
    (gameState) => mutateWithEngine(gameState, partyId, playerId, (engine) => engine.stealGift(giftId, playerId)),
    options,
  );
}

export async function executeEndTurn(partyId, playerId, options = {}) {
  return runAtomicGameMutation(
    partyId,
    (gameState) => {
      const rejection = getEndTurnRejectionReason(gameState, playerId);
      if (rejection) {
        throw new Error(rejection);
      }
      return mutateWithEngine(gameState, partyId, playerId, (engine) => engine.endTurn());
    },
    options,
  );
}

/**
 * End turn only when the expected bot is still the active player (bot autoplay).
 * @param {string} partyId
 * @param {string} expectedBotPlayerId — bot that scheduled this end-turn
 */
export async function executeEndActiveTurn(partyId, expectedBotPlayerId, options = {}) {
  if (!expectedBotPlayerId || !isBot(expectedBotPlayerId)) {
    throw new BotTurnStaleError();
  }

  return runAtomicGameMutation(
    partyId,
    (gameState) => {
      if (gameState.phase === 'ENDED') {
        throw new Error('Game has already ended');
      }
      const engine = buildEngine(gameState, partyId);
      const activePlayer = engine.calculateActivePlayer();
      if (activePlayer !== expectedBotPlayerId || !isBot(expectedBotPlayerId)) {
        throw new BotTurnStaleError();
      }
      engine.endTurn();
      const newState = engine.getState();
      newState.config = gameState.config;
      newState.partyId = partyId;
      return newState;
    },
    options,
  );
}

/** Atomically end the game when engine rules say it should finish. */
export async function executeEndGameWhenReady(partyId, options = {}) {
  return runAtomicGameMutation(
    partyId,
    (gameState) => {
      if (gameState.phase === 'ENDED') {
        throw new Error('Game has already ended');
      }
      const engine = buildEngine(gameState, partyId);
      if (!engine.shouldGameEnd()) {
        throw new Error(GAME_NOT_READY_TO_END);
      }
      const { state } = engine.endGame();
      state.config = gameState.config;
      state.partyId = partyId;
      return state;
    },
    options,
  );
}

export function isGameNotReadyToEndError(error) {
  return error?.message === GAME_NOT_READY_TO_END;
}