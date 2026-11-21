/**
 * UI mirror of the server turn rules (server/engine.js is the source of truth).
 */

/** A turn is pick OR steal: once you pick, your turn is over (no steal or skip). */
export function hasPickedThisTurn(gameState, userId) {
  return new Map(gameState?.turnAction || []).get(userId) === 'PICKED';
}

/**
 * You can't pick the wrapped gift you brought while someone else's wrapped gift remains.
 * When every remaining wrapped gift is yours, you may pick one (matches the server, no deadlock).
 * Uses the server's giftSubmitters map, so games started before the rule are unaffected.
 */
export function isOwnWrappedGiftLocked(gameState, gifts, giftId, userId) {
  const submitters = gameState?.giftSubmitters;
  if (!userId || submitters?.[giftId] !== userId) return false;
  return Object.entries(gifts || {}).some(([id, gift]) => gift.isWrapped && submitters[id] !== userId);
}
