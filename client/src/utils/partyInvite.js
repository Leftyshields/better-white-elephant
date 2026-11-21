/**
 * Rules-only party invite token (item 1).
 *
 * parties/{id}/private/invite {token, code} is readable only by the Google host; the game server
 * issues and rotates the token and party code together (server/lib/party-code.js).
 * The share link carries the token in the URL fragment (#t=...), which browsers never send to servers.
 * A join is one batch: the participant seat, a write-only join proof holding the token, and
 * participantCount + 1 on the party. Firestore rules check the token, LOBBY status and the 30-seat cap.
 */
import {
  collection,
  doc,
  increment,
  writeBatch,
} from 'firebase/firestore';

const INVITE_TOKEN_RE = /^[0-9a-f]{32}$/;

export function isValidInviteToken(token) {
  return typeof token === 'string' && INVITE_TOKEN_RE.test(token);
}

/** 128 random bits as 32 lowercase hex chars (matches firestore.rules validInviteToken). */
export function generateInviteToken(cryptoImpl = globalThis.crypto) {
  const bytes = new Uint8Array(16);
  cryptoImpl.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Reads `t` from a location hash like "#t=abc". Returns null unless it is a well-formed token. */
export function readInviteTokenFromHash(hash) {
  if (typeof hash !== 'string' || !hash.startsWith('#')) {
    return null;
  }
  const token = new URLSearchParams(hash.slice(1)).get('t');
  return isValidInviteToken(token) ? token : null;
}

export function buildPartyShareLink(origin, partyId, token) {
  const base = `${origin}/party/${partyId}`;
  return isValidInviteToken(token) ? `${base}#t=${token}` : base;
}

function inviteTokenRef(db, partyId) {
  return doc(db, 'parties', partyId, 'private', 'invite');
}

/**
 * Host creates the party, their own seat (count 1) and the invite token in one batch.
 * @returns {Promise<string>} new party id
 */
export async function createPartyWithInviteToken(db, hostUid, partyPayload, participantData) {
  const partyRef = doc(collection(db, 'parties'));
  const batch = writeBatch(db);
  batch.set(partyRef, { ...partyPayload, participantCount: 1 });
  batch.set(inviteTokenRef(db, partyRef.id), {
    token: generateInviteToken(),
    updatedAt: new Date(),
  });
  batch.set(doc(db, 'parties', partyRef.id, 'participants', hostUid), participantData);
  await batch.commit();
  return partyRef.id;
}

/** Guest joins with the token from the share link. Rules reject a bad token, non-LOBBY, or a full party. */
export async function joinPartyWithInviteToken(db, partyId, uid, token, participantData) {
  const batch = writeBatch(db);
  batch.set(doc(db, 'parties', partyId, 'participants', uid), participantData);
  batch.set(doc(db, 'parties', partyId, 'joinProofs', uid), { token });
  batch.update(doc(db, 'parties', partyId), { participantCount: increment(1) });
  await batch.commit();
}

/** Host removes a participant and frees the seat in the same batch (legacy parties have no counter). */
export async function removeParticipantSeat(db, party, participantId) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'parties', party.id, 'participants', participantId));
  if (typeof party.participantCount === 'number') {
    batch.update(doc(db, 'parties', party.id), { participantCount: increment(-1) });
  }
  await batch.commit();
}
