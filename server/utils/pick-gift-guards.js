/**
 * Pre-mutation pick validation (shared by socket handler and atomic executor).
 */
export const PICK_GIFT_NOT_ON_TURN =
  'You can only open a gift on your own turn while the game is running.';
export const PICK_GIFT_NOT_IN_WRAPPED_PILE =
  "That gift isn't available to open. Pick a wrapped gift.";
export const PICK_GIFT_ALREADY_HOLDING =
  "You already have a gift, so you can't open another one. Steal one instead, or skip your turn.";
export const PICK_GIFT_ALREADY_OPEN =
  "That gift is already open, so you can't open it again.";

/**
 * @param {import('../engine.js').GameEngine} engine
 * @param {string} userId
 * @param {string} giftId
 */
export function assertPickGiftAllowed(engine, userId, giftId) {
  if (!engine.canPick(userId)) {
    const message = engine.playerHasGift(userId) ? PICK_GIFT_ALREADY_HOLDING : PICK_GIFT_NOT_ON_TURN;
    throw new Error(message);
  }

  const heldByOther = engine.unwrappedGifts.get(giftId);
  if (heldByOther?.ownerId && heldByOther.ownerId !== userId) {
    throw new Error(PICK_GIFT_ALREADY_OPEN);
  }

  if (!engine.wrappedGifts.includes(giftId)) {
    throw new Error(PICK_GIFT_NOT_IN_WRAPPED_PILE);
  }
}