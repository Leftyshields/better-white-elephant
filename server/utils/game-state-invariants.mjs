/**
 * Invariants for persisted game state (gift conservation).
 */

/**
 * @param {object} gameState
 */
export function assertGiftConservation(gameState) {
  const wrapped = gameState.wrappedGifts || [];
  const unwrappedRaw = gameState.unwrappedGifts || [];
  const entries =
    unwrappedRaw instanceof Map ? Array.from(unwrappedRaw.entries()) : [...unwrappedRaw];

  const seenGiftIds = new Set();
  for (const giftId of wrapped) {
    if (seenGiftIds.has(giftId)) {
      throw new Error(`Duplicate gift in state: ${giftId}`);
    }
    seenGiftIds.add(giftId);
  }

  for (const [giftId] of entries) {
    if (seenGiftIds.has(giftId)) {
      throw new Error(`Duplicate gift in state: ${giftId}`);
    }
    seenGiftIds.add(giftId);
  }

  const ownerCounts = new Map();
  for (const [, gift] of entries) {
    const ownerId = gift?.ownerId;
    if (!ownerId) continue;
    ownerCounts.set(ownerId, (ownerCounts.get(ownerId) || 0) + 1);
    if (ownerCounts.get(ownerId) > 1) {
      throw new Error(`Player ${ownerId} owns multiple gifts`);
    }
  }
}