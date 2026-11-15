/**
 * Socket wiring for pick-gift — always uses authenticated socket.userId (never client-supplied actor).
 */
import { handlePickGift } from './pick-gift.js';

/**
 * @param {object} socket
 * @param {object} payload
 * @param {object} deps — same dependencies as handlePickGift (minus userId)
 */
export async function onSocketPickGift(socket, payload, deps) {
  const { partyId, giftId } = payload ?? {};
  return handlePickGift({
    ...deps,
    partyId,
    giftId,
    userId: socket.userId,
    socket,
  });
}