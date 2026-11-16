/**
 * UI mirror of the server turn rules (server/engine.js is the source of truth).
 */

/** A turn is pick OR steal: once you pick, your turn is over (no steal or skip). */
export function hasPickedThisTurn(gameState, userId) {
  return new Map(gameState?.turnAction || []).get(userId) === 'PICKED';
}

/**
 * You can't pick the wrapped gift you brought unless it is the only wrapped gift left.
 * Uses the server's giftSubmitters map, so games started before the rule are unaffected.
 */
export function isOwnWrappedGiftLocked(gameState, gifts, giftId, userId) {
  if (!userId || gameState?.giftSubmitters?.[giftId] !== userId) return false;
  const wrappedCount = Object.values(gifts || {}).filter((gift) => gift.isWrapped).length;
  return wrappedCount > 1;
}
