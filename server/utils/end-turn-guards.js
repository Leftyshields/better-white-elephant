import { GameEngine } from '../engine.js';

/**
 * Returns an error message when end-turn must be rejected, or null when the sender may proceed.
 * Does not mutate game state.
 */
export function getEndTurnRejectionReason(gameState, userId) {
  if (!gameState) {
    return 'Game not found';
  }

  if (gameState.phase === 'ENDED') {
    return 'Game has already ended';
  }

  if (gameState.phase !== 'ACTIVE') {
    return 'Cannot end turn: invalid action';
  }

  if (!userId) {
    return 'Cannot end turn: invalid action';
  }

  const config = gameState.config || { maxSteals: 3, returnToStart: false };
  const engine = new GameEngine(
    { ...gameState, partyId: gameState.partyId || 'guard-check' },
    config,
  );
  const activePlayerId = engine.currentPlayerId;

  if (!activePlayerId || userId !== activePlayerId) {
    return 'Cannot end turn: invalid action';
  }

  return null;
}