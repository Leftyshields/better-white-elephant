/**
 * Persist initial game state after a LOBBY→ACTIVE claim; roll back orphaned ACTIVE if save fails.
 */
import { loadGameState, saveGameStateIfAbsent } from './game-state-persistence.js';
import { revertOrphanedActivePartyToLobby } from './game-start-lock.js';

/**
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {string} partyId
 * @param {object} gameState
 * @returns {Promise<{ created: boolean, gameState: object | null }>}
 */
export async function saveInitialGameStateOrRevertParty(db, partyId, gameState, deps = {}) {
  const saveIfAbsent = deps.saveGameStateIfAbsent ?? saveGameStateIfAbsent;
  const loadState = deps.loadGameState ?? loadGameState;
  const revertOrphan = deps.revertOrphanedActivePartyToLobby ?? revertOrphanedActivePartyToLobby;

  try {
    return await saveIfAbsent(partyId, gameState);
  } catch (error) {
    const existing = await loadState(partyId);
    if (!existing) {
      await revertOrphan(db, partyId);
    }
    throw error;
  }
}