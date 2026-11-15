/**
 * Socket pick-gift handler (testable; used by server.js).
 */
import { END_TURN_GAME_NOT_FOUND } from '../utils/end-turn-guards.js';
import { executePickGift, isGameStateConflictError } from '../utils/game-turn-handler.mjs';
import { clientSafeSocketGameErrorMessage } from '../utils/socket-error-copy.js';

export {
  PICK_GIFT_NOT_ON_TURN,
  PICK_GIFT_NOT_IN_WRAPPED_PILE,
} from '../utils/pick-gift-guards.js';

export async function handlePickGift({
  partyId,
  giftId,
  userId,
  socket,
  io,
  isValidPartyId,
  isValidGiftId,
  verifyPartyMembership,
  scheduleBotMove,
  executePick = executePickGift,
}) {
  if (!isValidPartyId(partyId) || !isValidGiftId(giftId)) {
    socket.emit('error', { message: 'Invalid party ID or gift ID' });
    return;
  }

  const isParticipant = await verifyPartyMembership(partyId, userId);
  if (!isParticipant) {
    socket.emit('error', { message: 'You are not a participant in this party' });
    return;
  }

  try {
    const { newState } = await executePick(partyId, giftId, userId);
    if (!newState || typeof newState !== 'object') {
      throw new Error('Pick could not be applied');
    }

    io.to(`party:${partyId}`).emit('action_started', {
      type: 'pick',
      giftId,
      playerId: userId,
    });
    io.to(`party:${partyId}`).emit('game-updated', newState);

    if (scheduleBotMove) {
      scheduleBotMove(partyId, newState);
    }
  } catch (error) {
    if (isGameStateConflictError(error)) {
      socket.emit('error', {
        message: clientSafeSocketGameErrorMessage(error.message, 'GAME_STATE_CONFLICT'),
        code: 'GAME_STATE_CONFLICT',
      });
      return;
    }
    const message =
      error.message === 'Game not found' || error.message === 'Game state party ID mismatch'
        ? END_TURN_GAME_NOT_FOUND
        : clientSafeSocketGameErrorMessage(error.message);
    socket.emit('error', { message });
  }
}