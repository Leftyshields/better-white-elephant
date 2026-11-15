/**
 * Socket pick-gift handler (testable; used by server.js).
 */
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
    socket.emit('error', { message: 'Game not found' });
    return;
  }

  if (gameState.partyId && gameState.partyId !== partyId) {
    socket.emit('error', { message: 'Game state party ID mismatch' });
    return;
  }

  const config = gameState.config || { maxSteals: 3, returnToStart: false };
  gameState.partyId = partyId;
  const engine = new GameEngine(gameState, config);

  if (!engine.canPick(userId)) {
    const message = engine.playerHasGift(userId)
      ? "You already have a gift, so you can't open another one. Steal one instead, or skip your turn."
      : 'Cannot pick gift: invalid action';
    socket.emit('error', { message });
    return;
  }

  const heldByOther = engine.unwrappedGifts.get(giftId);
  if (heldByOther?.ownerId && heldByOther.ownerId !== userId) {
    socket.emit('error', { message: "That gift is already open, so you can't open it again." });
    return;
  }

  if (!engine.wrappedGifts.includes(giftId)) {
    socket.emit('error', { message: 'Cannot pick gift: invalid action' });
    return;
  }

  engine.pickGift(giftId, userId);
  const newState = engine.getState();
  newState.config = gameState.config;
  newState.partyId = partyId;

  io.to(`party:${partyId}`).emit('action_started', {
    type: 'pick',
    giftId,
    playerId: userId,
  });

  await saveGameState(partyId, newState);
  io.to(`party:${partyId}`).emit('game-updated', newState);

  if (scheduleBotMove) {
    scheduleBotMove(partyId, newState);
  }
}