import { hasPickedThisTurn } from './turnRules.js';

/**
 * Whether the current user may manually skip / end their turn (Rule 10 + victim deadlock).
 */
export function canPlayerSkipTurn({
  gifts,
  gameState,
  currentTurnIndex,
  turnQueue,
  userId,
  activePlayerId,
}) {
  if (!userId || activePlayerId !== userId || !gifts) {
    return false;
  }
  if (hasPickedThisTurn(gameState, userId)) {
    return false;
  }

  const giftList = Object.values(gifts);
  const playerHasGift = giftList.some(
    (g) => !g.isWrapped && g.ownerId === userId,
  );

  if (playerHasGift) {
    return true;
  }

  const returnToStart = gameState?.config?.returnToStart || false;
  const turnOrderLength = gameState?.turnOrder?.length || 0;
  const isBoomerangPhase =
    returnToStart &&
    (gameState?.isBoomerangPhase ||
      (typeof currentTurnIndex === 'number' &&
        currentTurnIndex >= turnOrderLength));

  if (isBoomerangPhase) {
    return false;
  }

  const currentVictim = gameState?.currentVictim ?? null;
  if (currentVictim !== userId) {
    return false;
  }

  const hasWrappedGifts = giftList.some((g) => g.isWrapped);
  if (hasWrappedGifts) {
    return false;
  }

  for (const gift of giftList) {
    if (gift.isWrapped) continue;
    if (gift.isFrozen) continue;
    if (gift.ownerId === userId) continue;
    if (gift.lastOwnerId === userId) continue;
    return false;
  }

  return true;
}