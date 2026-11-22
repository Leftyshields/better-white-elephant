/**
 * Persist a game that the engine has just moved to phase ENDED: winners on gift docs,
 * ended game state and the shipping fulfillment snapshot, then party status ENDED with
 * history and retention stamps, then broadcast game-ended. The snapshot is written before
 * the status flip so the giver's address card does not 403 on a race. Shared by the
 * end-turn socket handler and the pick paths (a pick can end the game when the next
 * player has no legal move, BUG-18).
 */
import admin from 'firebase-admin';
import { db } from '../config/firebase-admin.js';
import { GameEngine } from '../engine.js';
import { redisTtlSecondsForPartyStatus, saveGameState } from './game-state-persistence.js';
import { saveShippingFulfillmentSnapshot } from './shipping-fulfillment-snapshot.js';

/**
 * @param {string} partyId
 * @param {object} endedState - game state with phase ENDED
 * @param {{ to: (room: string) => { emit: Function } }} io
 */
export async function finalizeEndedGame(partyId, endedState, io) {
  const config = endedState.config || { maxSteals: 3, returnToStart: false };
  const finalEngine = new GameEngine(endedState, config);
  const finalState = finalEngine.endGame();
  const finalOwnership = finalState.finalOwnership || {};

  // One gift per winner: the first gift seen for each winner is theirs.
  const winnerToGiftMap = new Map();
  const giftsToUpdate = [];
  for (const [giftId, winnerId] of Object.entries(finalOwnership)) {
    if (winnerId && !winnerToGiftMap.has(winnerId)) {
      winnerToGiftMap.set(winnerId, giftId);
      giftsToUpdate.push({ giftId, winnerId });
    }
  }

  // Set winnerId on assigned gifts and clear it from any others.
  const assignedGiftIds = new Set(giftsToUpdate.map((g) => g.giftId));
  const allGiftsSnapshot = await db.collection('gifts').where('partyId', '==', partyId).get();
  for (const giftDoc of allGiftsSnapshot.docs) {
    const giftId = giftDoc.id;
    if (assignedGiftIds.has(giftId)) {
      const assignment = giftsToUpdate.find((g) => g.giftId === giftId);
      await db.collection('gifts').doc(giftId).update({
        winnerId: assignment.winnerId,
        updatedAt: new Date(),
      });
    } else if (giftDoc.data().winnerId) {
      await db.collection('gifts').doc(giftId).update({
        winnerId: null,
        updatedAt: new Date(),
      });
    }
  }

  // Persist ENDED state and the fulfillment snapshot before flipping party.status, so a
  // client that opens the end screen on that status flip can already load the address.
  // Pass the ENDED TTL explicitly: party status is still pre-end when this runs.
  // Redis TTL still resolves to 30 days because gameState.phase is ENDED.
  finalState.state.config = config;
  finalState.state.partyId = partyId;
  finalState.state.finalOwnership = finalOwnership;
  try {
    await saveGameState(partyId, finalState.state, redisTtlSecondsForPartyStatus('ENDED'));
  } catch (error) {
    console.error('Failed to save ended game state', {
      code: error?.code ?? 'n/a',
      name: error?.name ?? 'Error',
    });
  }
  try {
    await saveShippingFulfillmentSnapshot(partyId, finalOwnership, db);
  } catch (error) {
    console.error('Failed to save shipping fulfillment snapshot', {
      code: error?.code ?? 'n/a',
      name: error?.name ?? 'Error',
    });
  }

  const endedAt = admin.firestore.Timestamp.now();
  await db.collection('parties').doc(partyId).update({
    status: 'ENDED',
    endedAt, // retention timestamp for data cleanup
    gameHistory: finalState.state.history || [],
    updatedAt: new Date(),
  });

  const giftsForRetentionSnapshot = await db.collection('gifts').where('partyId', '==', partyId).get();
  if (giftsForRetentionSnapshot.docs.length > 0) {
    const giftRetentionBatch = db.batch();
    giftsForRetentionSnapshot.docs.forEach((giftDoc) => {
      giftRetentionBatch.update(giftDoc.ref, { partyEndedAt: endedAt, updatedAt: new Date() });
    });
    await giftRetentionBatch.commit();
  }

  io.to(`party:${partyId}`).emit('game-ended', finalState);
  return finalState;
}
