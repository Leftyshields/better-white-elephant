/**
 * BUG-23: the host's one takeover control for an away or idle player.
 * Pure rules shared by the game server (which enforces them) and the client (which labels the
 * button). The server always re-derives on fresh state inside the atomic mutation.
 */
import { pickableWrappedGifts } from '../utils/pick-gift-guards.js';

/** No "away" until the last socket has been gone this long (a reload never flashes away). */
export const AWAY_GRACE_MS = 5000;
/** Control usable once the player has been away this long (counted from the disconnect). */
export const AWAY_TAKEOVER_MS = 30000;
/** Control usable once a turn is this old, connected or not. */
export const IDLE_TAKEOVER_MS = 90000;
/** A player who comes back during their turn gets this long before the idle rule applies again. */
export const RETURN_FAIR_MS = 30000;
/** Never act in the first seconds of a turn, so one double tap can't act on two players. */
export const MIN_TURN_AGE_MS = 3000;
/** Reserve the slot (hint) once the turn is this old even if nobody is away. */
export const SLOT_RESERVE_TURN_AGE_MS = 60000;

export const TAKEOVER_ACTIONS = Object.freeze(['pick', 'keep', 'keep_and_end', 'steal', 'skip']);

export const TAKEOVER_CODES = Object.freeze({
  NOT_HOST: 'NOT_HOST',
  TURN_MOVED: 'TURN_MOVED',
  PLAYER_BACK: 'PLAYER_BACK',
  NOT_YET: 'NOT_YET',
  FAILED: 'FAILED',
});

/** The turn key the button is rendered from. Games started before BUG-23 fall back to updatedAt. */
export function turnKeyOf(gameState) {
  return gameState?.turnStartedAt || gameState?.updatedAt || null;
}

function toMs(value) {
  if (value == null) return null;
  const ms = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function ownerOf(gift) {
  return gift?.ownerId ?? null;
}

/**
 * Unwrapped gifts the player could steal by the bot's rule set: not frozen, held by someone else,
 * and not the one just taken from them (steal-back lock).
 */
export function stealableGiftIds(gameState, playerId) {
  const ids = [];
  for (const [giftId, gift] of gameState?.unwrappedGifts || []) {
    const owner = ownerOf(gift);
    if (!gift?.isFrozen && owner && owner !== playerId && gift?.lastOwnerId !== playerId) {
      ids.push(giftId);
    }
  }
  return ids;
}

function holdsGift(gameState, playerId) {
  return (gameState?.unwrappedGifts || []).some(([, gift]) => ownerOf(gift) === playerId);
}

function isBoomerangRound(gameState) {
  if (!gameState?.config?.returnToStart) return false;
  return (gameState.currentTurnIndex || 0) >= (gameState.turnOrder?.length || 0);
}

/**
 * The one move the host's control makes for this player right now (spec section 3 table):
 * pick when they hold nothing and may open a wrapped gift; keep when they hold a gift (keep_and_end
 * on the bookend final turn when keeping ends the game); steal when nothing is wrapped but a legal
 * steal exists; skip when nothing is legal (victim deadlock).
 * @returns {'pick'|'keep'|'keep_and_end'|'steal'|'skip'}
 */
export function deriveTakeoverAction(gameState, playerId) {
  if (holdsGift(gameState, playerId)) {
    const queueLength = gameState?.turnQueue?.length || 0;
    const isBookendFinalTurn =
      !isBoomerangRound(gameState) &&
      !gameState?.currentVictim &&
      (gameState?.currentTurnIndex || 0) === queueLength - 1 &&
      gameState?.turnOrder?.[0] === playerId &&
      (gameState?.wrappedGifts || []).length === 0;
    return isBookendFinalTurn ? 'keep_and_end' : 'keep';
  }
  if (pickableWrappedGifts(gameState || {}, playerId).length > 0) return 'pick';
  if (stealableGiftIds(gameState, playerId).length > 0) return 'steal';
  return 'skip';
}

/**
 * When the host's control is usable, in server time (ms).
 * usable: turn is 3s old AND (away 30s+ OR turn 90s+; a return during this turn adds a fair 30s).
 * @param {{ turnStartedAt: string|number|null, awaySince?: string|number|null,
 *   returnedAt?: string|number|null, now: number }} input
 * @returns {{ usable: boolean, showSlot: boolean, availableAt: number|null, reason: string|null }}
 */
export function takeoverTiming({ turnStartedAt, awaySince = null, returnedAt = null, now }) {
  const turnStart = toMs(turnStartedAt);
  if (turnStart == null) {
    return { usable: false, showSlot: false, availableAt: null, reason: TAKEOVER_CODES.NOT_YET };
  }
  const away = toMs(awaySince);
  const returned = toMs(returnedAt);
  const minAt = turnStart + MIN_TURN_AGE_MS;
  const awayAt = away != null ? away + AWAY_TAKEOVER_MS : null;
  let idleAt = turnStart + IDLE_TAKEOVER_MS;
  if (away == null && returned != null && returned >= turnStart) {
    idleAt = Math.max(idleAt, returned + RETURN_FAIR_MS);
  }
  const ruleAt = awayAt != null ? Math.min(awayAt, idleAt) : idleAt;
  const availableAt = Math.max(minAt, ruleAt);
  const usable = now >= availableAt;
  const showSlot = usable || away != null || now - turnStart >= SLOT_RESERVE_TURN_AGE_MS;
  let reason = null;
  if (!usable) {
    const cameBackRecently = away == null && returned != null && now - returned < RETURN_FAIR_MS;
    reason = cameBackRecently ? TAKEOVER_CODES.PLAYER_BACK : TAKEOVER_CODES.NOT_YET;
  }
  return { usable, showSlot, availableAt, reason };
}
