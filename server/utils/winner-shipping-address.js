/**
 * Sender-scoped access to a winner's shipping address after game end.
 */
import { partyConverter, giftConverter } from './firestore-converters.js';

const SHIPPING_ADDRESS_KEYS = ['name', 'street', 'city', 'state', 'zip', 'country'];

function pickShippingAddress(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const picked = {};
  for (const key of SHIPPING_ADDRESS_KEYS) {
    if (raw[key] != null && raw[key] !== '') {
      picked[key] = String(raw[key]);
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

/**
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {{ callerUid: string, partyId: string, giftId: string }} params
 * @returns {Promise<{ status: number, error?: string, shippingAddress?: object }>}
 */
export async function fetchWinnerShippingAddressForSender(db, { callerUid, partyId, giftId }) {
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

  const party = partyConverter.fromFirestore(partyDoc);
  if (party.status !== 'ENDED') {
    return { status: 403, error: 'Game has not ended' };
  }

  const giftDoc = await db.collection('gifts').doc(giftId).get();
  if (!giftDoc.exists) {
    return { status: 404, error: 'Gift not found' };
  }

  const gift = giftConverter.fromFirestore(giftDoc);
  if (gift.partyId !== partyId) {
    return { status: 403, error: 'Gift does not belong to this party' };
  }

  if (gift.submitterId !== callerUid) {
    return { status: 403, error: 'Only the assigned sender can view this address' };
  }

  const winnerId = gift.winnerId;
  if (!winnerId) {
    return { status: 404, error: 'Winner not assigned for this gift' };
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
