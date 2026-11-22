/**
 * Sender-scoped access to a winner's shipping address after game end.
 * Reads the per-game doc parties/{partyId}/shipping/{winnerId} (A0). The doc existing is the share.
 */
import { pickStoredShipping, shippingDocRef } from '../lib/party-shipping.js';

function resolveWinnerFromGameState(gameState, giftId) {
  if (!gameState || !giftId) {
    return null;
  }
  if (gameState.finalOwnership && gameState.finalOwnership[giftId]) {
    return gameState.finalOwnership[giftId];
  }
  const unwrapped = gameState.unwrappedGifts;
  if (!unwrapped) {
    return null;
  }
  if (Array.isArray(unwrapped)) {
    for (const entry of unwrapped) {
      if (!Array.isArray(entry) || entry.length < 2) {
        continue;
      }
      const [gid, giftData] = entry;
      if (gid === giftId && giftData?.ownerId) {
        return giftData.ownerId;
      }
    }
    return null;
  }
  if (typeof unwrapped === 'object' && unwrapped[giftId]?.ownerId) {
    return unwrapped[giftId].ownerId;
  }
  return null;
}

async function participantExists(db, partyId, userId) {
  const doc = await db
    .collection('parties')
    .doc(partyId)
    .collection('participants')
    .doc(userId)
    .get();
  return doc.exists;
}

/**
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {{ callerUid: string, partyId: string, giftId: string }} params
 * @param {{ loadGameState?: (partyId: string) => Promise<object|null>, loadFulfillmentSnapshot?: (partyId: string) => Promise<object|null> }} [deps]
 * @returns {Promise<{ status: number, error?: string, shippingAddress?: object }>}
 */
export async function fetchWinnerShippingAddressForSender(
  db,
  { callerUid, partyId, giftId },
  deps = {},
) {
  const loadState =
    deps.loadGameState ??
    (await import('./game-state-persistence.js')).loadGameState;
  const loadFulfillment =
    deps.loadFulfillmentSnapshot ??
    (await import('./shipping-fulfillment-snapshot.js')).loadShippingFulfillmentSnapshot;

  if (!callerUid) {
    return { status: 401, error: 'Authentication required' };
  }

  if (
    !partyId ||
    typeof partyId !== 'string' ||
    partyId.length === 0 ||
    partyId.length > 128 ||
    !giftId ||
    typeof giftId !== 'string' ||
    giftId.length === 0 ||
    giftId.length > 128
  ) {
    return { status: 400, error: 'Valid partyId and giftId are required' };
  }

  const partyDoc = await db.collection('parties').doc(partyId).get();
  if (!partyDoc.exists) {
    return { status: 404, error: 'Party not found' };
  }

  const gameState = await loadState(partyId);
  if (!gameState || gameState.phase !== 'ENDED') {
    return { status: 403, error: 'Game has not ended', code: 'GAME_NOT_ENDED' };
  }

  const fulfillment = await loadFulfillment(partyId);
  if (!fulfillment || !fulfillment[giftId]) {
    return { status: 403, error: 'Gift fulfillment record not found', code: 'FULFILLMENT_NOT_FOUND' };
  }

  const { submitterId, winnerId } = fulfillment[giftId];
  if (!submitterId || !winnerId) {
    return { status: 403, error: 'Gift fulfillment record not found', code: 'FULFILLMENT_NOT_FOUND' };
  }

  if (submitterId !== callerUid) {
    return { status: 403, error: 'Only the assigned sender can view this address' };
  }

  const gameStateWinner = resolveWinnerFromGameState(gameState, giftId);
  if (gameStateWinner && gameStateWinner !== winnerId) {
    return { status: 403, error: 'Gift winner does not match game outcome' };
  }

  const giftDoc = await db.collection('gifts').doc(giftId).get();
  if (!giftDoc.exists || giftDoc.data()?.partyId !== partyId) {
    return { status: 404, error: 'Gift not found' };
  }

  const [callerIsParticipant, winnerIsParticipant] = await Promise.all([
    participantExists(db, partyId, callerUid),
    participantExists(db, partyId, winnerId),
  ]);

  if (!callerIsParticipant || !winnerIsParticipant) {
    return { status: 403, error: 'Invalid party participation' };
  }

  if (winnerId === callerUid) {
    return { status: 403, error: 'No shipping address needed for your own gift' };
  }

  // Every access gate above has passed: this caller is the assigned sender of an ended game.
  // "No address yet" answers 200 with no address (not an error), so the sender's card can tell
  // "not added yet" from a real failure.
  const shippingDoc = await shippingDocRef(db, partyId, winnerId).get();
  const shippingAddress = shippingDoc.exists ? pickStoredShipping(shippingDoc.data()) : null;
  return { status: 200, shippingAddress };
}
