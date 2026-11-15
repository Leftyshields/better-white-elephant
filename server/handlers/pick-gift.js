/**
 * Socket pick-gift handler (testable; used by server.js).
 */
import { END_TURN_GAME_NOT_FOUND } from '../utils/end-turn-guards.js';

export const PICK_GIFT_NOT_ON_TURN =
  'You can only open a gift on your own turn while the game is running.';
export const PICK_GIFT_NOT_IN_WRAPPED_PILE =
  "That gift isn't available to open. Pick a wrapped gift.";

export async function handlePickGift({
  partyId,
  giftId,
  userId,
  socket,
  io,
  isValidPartyId,
  isValidGiftId,
  verifyPartyMembership,
  loadGameState,
  saveGameState,
  GameEngine,
  scheduleBotMove,
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

  const gameState = await loadGameState(partyId);
  if (!gameState) {
    socket.emit('error', { message: END_TURN_GAME_NOT_FOUND });
    return;
  }

  if (gameState.partyId && gameState.partyId !== partyId) {
    socket.emit('error', { message: END_TURN_GAME_NOT_FOUND });
    return;
  }

  const config = gameState.config || { maxSteals: 3, returnToStart: false };
  gameState.partyId = partyId;
  const engine = new GameEngine(gameState, config);

  if (!engine.canPick(userId)) {
    const message = engine.playerHasGift(userId)
      ? "You already have a gift, so you can't open another one. Steal one instead, or skip your turn."
      : PICK_GIFT_NOT_ON_TURN;
    socket.emit('error', { message });
    return;
  }

  const heldByOther = engine.unwrappedGifts.get(giftId);
  if (heldByOther?.ownerId && heldByOther.ownerId !== userId) {
    socket.emit('error', { message: "That gift is already open, so you can't open it again." });
    return;
  }

  if (!engine.wrappedGifts.includes(giftId)) {
    socket.emit('error', { message: PICK_GIFT_NOT_IN_WRAPPED_PILE });
    return;
  }

  engine.pickGift(giftId, userId);
  const newState = engine.getState();
  newState.config = gameState.config;
  newState.partyId = partyId;

  await saveGameState(partyId, newState);

  io.to(`party:${partyId}`).emit('action_started', {
    type: 'pick',
    giftId,
    playerId: userId,
  });
  io.to(`party:${partyId}`).emit('game-updated', newState);

  if (scheduleBotMove) {
    scheduleBotMove(partyId, newState);
  }
}