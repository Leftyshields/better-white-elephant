/**
 * Sender-scoped access to a winner's shipping address after game end.
 */
const SHIPPING_ADDRESS_KEYS = ['name', 'street', 'city', 'state', 'zip', 'country'];

function pickShippingAddress(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const picked = {};
  for (const key of SHIPPING_ADDRESS_KEYS) {
    if (raw[key] == null) {
      continue;
    }
    const trimmed = String(raw[key]).trim();
    if (trimmed) {
      picked[key] = trimmed;
    }
  }
  const hasStreet = picked.street && picked.city;
  return hasStreet ? picked : null;
}

function hasSenderShareConsent(userData) {
  const consentAt = userData?.shippingAddressSenderShareConsentAt;
  if (!consentAt) {
    return false;
  }
  if (consentAt instanceof Date) {
    return !Number.isNaN(consentAt.getTime());
  }
  if (typeof consentAt === 'object' && typeof consentAt.toDate === 'function') {
    return true;
  }
  if (typeof consentAt === 'string' || typeof consentAt === 'number') {
    const d = new Date(consentAt);
    return !Number.isNaN(d.getTime());
  }
  return false;
}

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
    return { status: 403, error: 'Game has not ended' };
  }

  const fulfillment = await loadFulfillment(partyId);
  if (!fulfillment || !fulfillment[giftId]) {
    return { status: 403, error: 'Gift fulfillment record not found' };
  }

  const { submitterId, winnerId } = fulfillment[giftId];
  if (!submitterId || !winnerId) {
    return { status: 403, error: 'Gift fulfillment record not found' };
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

  const winnerDoc = await db.collection('users').doc(winnerId).get();
  if (!winnerDoc.exists) {
    return { status: 404, error: 'Winner has not added a shipping address yet' };
  }

  const winnerData = winnerDoc.data();
  const shippingAddress = pickShippingAddress(winnerData?.shippingAddress);
  if (!shippingAddress) {
    return { status: 404, error: 'Winner has not added a shipping address yet' };
  }

  if (!hasSenderShareConsent(winnerData)) {
    return { status: 403, error: 'Winner has not consented to share their address' };
  }

  return { status: 200, shippingAddress };
}
