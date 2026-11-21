/**
 * Atomic read-validate-write for game state.
 *
 * Uses Redis WATCH/MULTI/EXEC on a **dedicated connection** per mutation
 * (client.duplicate()) so concurrent turns on different parties—or other
 * commands on the shared app client—do not share WATCH state.
 *
 * After a successful Redis commit, Firestore is updated for durability. If
 * Firestore fails, Redis remains the source of truth for live play; the next
 * loadGameState() still serves Redis until it expires, and Firestore can be
 * repaired from Redis on the next successful persist or restore path.
 */
import {
  loadGameState,
  prepareGameStateForSave,
  resolvePartyTtlForGameState,
  saveGameStateToFirestore,
} from './game-state-persistence.js';
import { resolveTransactionRedis } from './redis-transaction-client.mjs';
import { assertGiftConservation } from './game-state-invariants.mjs';

const MAX_ATOMIC_ATTEMPTS = 15;

export class GameStateConflictError extends Error {
  constructor(message = 'Game state conflict; please retry') {
    super(message);
    this.name = 'GameStateConflictError';
    this.code = 'GAME_STATE_CONFLICT';
  }
}

/**
 * BUG-23: turnStartedAt marks when the active turn began (the host takeover clock and turn key).
 * A new turn starts whenever the active player, the queue slot, or the steal victim changes; any
 * other mutation keeps the old value. States saved before BUG-23 get one on their next turn.
 */
export function stampTurnStartedAt(previousState, newState, nowIso = new Date().toISOString()) {
  const turnChanged =
    previousState?.currentPlayerId !== newState.currentPlayerId ||
    (previousState?.currentTurnIndex || 0) !== (newState.currentTurnIndex || 0) ||
    (previousState?.currentVictim || null) !== (newState.currentVictim || null);
  newState.turnStartedAt = turnChanged || !previousState?.turnStartedAt ? nowIso : previousState.turnStartedAt;
  return newState;
}

export function isGameStateConflictError(error) {
  return error?.code === 'GAME_STATE_CONFLICT' || error instanceof GameStateConflictError;
}

/**
 * @param {string} partyId
 * @param {(gameState: object) => object | Promise<object>} mutateFn
 * @param {{ redis?: object, ttl?: number | null }} [options]
 * @returns {Promise<{ newState: object, previousState: object, firestorePersisted: boolean }>}
 */
export async function runAtomicGameMutation(partyId, mutateFn, options = {}) {
  if (!partyId || typeof partyId !== 'string') {
    throw new Error(`Invalid partyId: ${partyId}`);
  }

  const { client: redis, release } = await resolveTransactionRedis(options.redis);
  const redisKey = `game:${partyId}`;

  try {
    for (let attempt = 0; attempt < MAX_ATOMIC_ATTEMPTS; attempt++) {
      await redis.watch(redisKey);
      let raw = await redis.get(redisKey);

      if (!raw) {
        await redis.unwatch();
        const restored = await loadGameState(partyId);
        if (!restored) {
          throw new Error('Game not found');
        }
        continue;
      }

      let gameState;
      try {
        gameState = JSON.parse(raw);
      } catch {
        await redis.unwatch();
        throw new Error('Corrupted game state');
      }

      if (gameState.partyId && gameState.partyId !== partyId) {
        await redis.unwatch();
        throw new Error('Game state party ID mismatch');
      }
      gameState.partyId = partyId;

      let newState;
      try {
        newState = await mutateFn(gameState);
      } catch (error) {
        await redis.unwatch();
        throw error;
      }

      if (!newState || typeof newState !== 'object') {
        await redis.unwatch();
        throw new Error('Mutation did not return game state');
      }

      newState.partyId = partyId;
      stampTurnStartedAt(gameState, newState);
      assertGiftConservation(newState);

      const { cleanedState, redisJsonString } = prepareGameStateForSave(partyId, newState);
      const ttl = await resolvePartyTtlForGameState(partyId, newState, options.ttl ?? null);

      const multi = redis.multi();
      multi.setEx(redisKey, ttl, redisJsonString);
      const execResult = await multi.exec();

      if (execResult === null) {
        continue;
      }

      const firestorePersisted = await saveGameStateToFirestore(partyId, cleanedState, {
        compactFailureLog: true,
      });
      if (!firestorePersisted) {
        console.error(
          `[game-state] Firestore persist failed after Redis turn commit; Redis is authoritative for partyId=${partyId} stateVersion=${cleanedState?.stateVersion ?? 'n/a'}`,
        );
      }

      return {
        newState: JSON.parse(redisJsonString),
        previousState: gameState,
        firestorePersisted,
      };
    }

    throw new GameStateConflictError();
  } finally {
    await release();
  }
}