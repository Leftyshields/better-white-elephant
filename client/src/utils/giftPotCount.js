/**
 * Lobby gift pot count (G25 + G26). A player can read only their own gift doc before the game, so
 * the pot is counted from seats: every GOING seat (host included) whose hasGift flag is true.
 * Firestore rules let only the seat's owner set hasGift, and only while it points at their real
 * gift (giftId), so the count is the same for every viewer and Ready/undo Ready doesn't move it.
 *
 * @param {Array<{status?: string, hasGift?: boolean}>} [participants]
 * @returns {number}
 */
export function lobbyGiftPotCount(participants = []) {
  return participants.filter((p) => p.status === 'GOING' && p.hasGift === true).length;
}
