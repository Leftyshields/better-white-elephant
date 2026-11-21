/**
 * Lobby gift pot count (G25). In the lobby a player can read only their own gift doc, so the pot
 * is counted from seats: every GOING guest whose seat is Ready has a gift in (Ready is set when the
 * gift is saved). The caller's own gift is added when their seat is not already counted (the host,
 * or a guest who is not Ready yet). Other players cannot see the host's gift, so their count leaves
 * it out.
 *
 * @param {{ participants?: Array<{id: string, status?: string, ready?: boolean}>, adminId?: string | null,
 *   userId?: string | null, hasOwnGift?: boolean }} input
 * @returns {number}
 */
export function lobbyGiftPotCount({ participants = [], adminId = null, userId = null, hasOwnGift = false }) {
  const countedSeatIds = new Set(
    participants
      .filter((p) => p.status === 'GOING' && p.id !== adminId && p.ready === true)
      .map((p) => p.id)
  );
  const ownExtra = hasOwnGift && userId && !countedSeatIds.has(userId) ? 1 : 0;
  return countedSeatIds.size + ownExtra;
}
