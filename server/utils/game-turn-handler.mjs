/**
 * Turn actions (pick, steal, end turn) with atomic state persistence.
 */
import { GameEngine } from '../engine.js';
import { runAtomicGameMutation, GameStateConflictError, isGameStateConflictError } from './atomic-game-action.mjs';
import { assertPickGiftAllowed } from './pick-gift-guards.js';
import { getEndTurnRejectionReason } from './end-turn-guards.js';
import { isBot } from './bot-ids.js';
import { pickableWrappedGifts } from './pick-gift-guards.js';
import {
  TAKEOVER_CODES,
  deriveTakeoverAction,
  stealableGiftIds,
  takeoverTiming,
  turnKeyOf,
} from '../shared/host-takeover.mjs';

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
/** BUG-23: a host takeover the server refused. `code` is one of TAKEOVER_CODES (never raw text). */
export class HostTakeoverRejectedError extends Error {
  constructor(code) {
    super(`Host takeover rejected: ${code}`);
    this.name = 'HostTakeoverRejectedError';
    this.code = code;
  }
}

function shuffled(list, random) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * BUG-23: the host takes one turn for an away or idle player. Everything is checked and the random
 * gift is rolled inside the atomic mutation on fresh state, so a double tap or a racing return can
 * never act twice or on stale data. The server does only the action the button showed.
 *
 * @param {string} partyId
 * @param {{ hostId: string, playerId: string, action: string, turnKey: string,
 *   presence: () => { awaySince: number|null, returnedAt: number|null },
 *   now?: () => number, random?: () => number }} request
 */
export async function executeHostTakeover(partyId, request, options = {}) {
  const { hostId, playerId, action, turnKey, presence, now = () => Date.now(), random = Math.random } = request;
  return runAtomicGameMutation(
    partyId,
    (gameState) => {
      if (gameState.phase !== 'ACTIVE') throw new HostTakeoverRejectedError(TAKEOVER_CODES.TURN_MOVED);
      const engine = buildEngine(gameState, partyId);
      const activePlayer = engine.calculateActivePlayer();
      if (
        activePlayer !== playerId ||
        playerId === hostId ||
        isBot(playerId) ||
        engine.turnAction.get(playerId) ||
        turnKeyOf(gameState) !== turnKey
      ) {
        throw new HostTakeoverRejectedError(TAKEOVER_CODES.TURN_MOVED);
      }

      const { awaySince, returnedAt } = presence();
      const timing = takeoverTiming({ turnStartedAt: turnKeyOf(gameState), awaySince, returnedAt, now: now() });
      if (!timing.usable) throw new HostTakeoverRejectedError(timing.reason);

      if (deriveTakeoverAction(gameState, playerId) !== action) {
        throw new HostTakeoverRejectedError(TAKEOVER_CODES.TURN_MOVED);
      }

      const historyBefore = engine.history.length;
      engine.currentPlayerId = playerId;
      if (action === 'pick') {
        const [giftId] = shuffled(pickableWrappedGifts(engine, playerId), random);
        engine.pickGift(giftId, playerId);
      } else if (action === 'steal') {
        let stolen = false;
        for (const giftId of shuffled(stealableGiftIds(gameState, playerId), random)) {
          if (engine.canSteal(giftId, playerId)) {
            engine.stealGift(giftId, playerId);
            stolen = true;
            break;
          }
        }
        if (!stolen) throw new HostTakeoverRejectedError(TAKEOVER_CODES.FAILED);
      } else {
        // keep, keep_and_end and skip all end the turn; keeping on the bookend ends the game.
        engine.endTurn();
      }

      // The first new history entry is the move made for the player; record who made it.
      const assisted = engine.history[historyBefore];
      if (assisted && assisted.playerId === playerId) {
        engine.history[historyBefore] = { ...assisted, assistedBy: hostId, assistedAction: action };
      }

      const newState = engine.getState();
      newState.config = gameState.config;
      newState.partyId = partyId;
      return newState;
    },
    options,
  );
}

export function isHostTakeoverRejectedError(error) {
  return error instanceof HostTakeoverRejectedError || error?.name === 'HostTakeoverRejectedError';
}
