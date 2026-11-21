import { GameEngine } from '../engine.js';

export const END_TURN_GAME_NOT_FOUND =
  "We couldn't find this game. Refresh the page and try again.";
export const END_TURN_GAME_ALREADY_ENDED =
  "This game is over, so there's no turn to skip.";
export const END_TURN_SOCKET_ERROR =
  'You can only skip on your own turn while the game is running.';

/**
 * Returns an error message when end-turn must be rejected, or null when the sender may proceed.
 * Does not mutate game state.
 */
export function getEndTurnRejectionReason(gameState, userId) {
  if (!gameState) {
    return END_TURN_GAME_NOT_FOUND;
  }

  if (gameState.phase === 'ENDED') {
    return END_TURN_GAME_ALREADY_ENDED;
  }

  if (gameState.phase !== 'ACTIVE') {
    return END_TURN_SOCKET_ERROR;
  }

  if (!userId) {
    return END_TURN_SOCKET_ERROR;
  }

  const config = gameState.config || { maxSteals: 3, returnToStart: false };
  const engine = new GameEngine(
    { ...gameState, partyId: gameState.partyId || 'guard-check' },
    config,
  );
  const activePlayerId = engine.currentPlayerId;

  if (!activePlayerId || userId !== activePlayerId) {
    return END_TURN_SOCKET_ERROR;
  }

  // A pick or steal already ended this turn; a skip can't follow it (hidden button is not enough).
  if (engine.turnAction.get(userId)) {
    return END_TURN_SOCKET_ERROR;
  }

  return null;
}