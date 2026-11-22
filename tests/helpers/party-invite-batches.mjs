/**
 * Emulator mirrors of client/src/utils/partyInvite.js write batches.
 * The client bundles its own firebase SDK (client/node_modules), so rules tests cannot pass a
 * root-SDK Firestore into the client helpers; these keep the exact same document shapes.
 * client/src/test/unit/partyInviteBatches.test.jsx pins the client side to the same shapes.
 */
import { randomBytes } from 'node:crypto';
import { collection, doc, increment, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';

export function generateInviteToken() {
  return randomBytes(16).toString('hex');
}

/** Home.jsx handleCreateParty -> createPartyWithInviteToken */
export async function createPartyWithInviteToken(db, hostUid, partyPayload, participantData) {
  const partyRef = doc(collection(db, 'parties'));
  const batch = writeBatch(db);
  batch.set(partyRef, { ...partyPayload, participantCount: 1 });
  batch.set(doc(db, 'parties', partyRef.id, 'private', 'invite'), {
    token: generateInviteToken(),
    updatedAt: new Date(),
  });
  batch.set(doc(db, 'parties', partyRef.id, 'participants', hostUid), participantData);
  await batch.commit();
  return partyRef.id;
}

/** PartyInviteLanding.jsx handleJoin -> joinPartyWithInviteToken */
export async function joinPartyWithInviteToken(db, partyId, uid, token, participantData) {
  const batch = writeBatch(db);
  batch.set(doc(db, 'parties', partyId, 'participants', uid), participantData);
  batch.set(doc(db, 'parties', partyId, 'joinProofs', uid), { token });
  batch.update(doc(db, 'parties', partyId), { participantCount: increment(1) });
  await batch.commit();
}

/** PartyLobby.jsx / PartyManagement.jsx handleRemoveParticipant -> removeParticipantSeat */
export async function removeParticipantSeat(db, party, participantId) {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'parties', party.id, 'participants', participantId));
  batch.set(doc(db, 'parties', party.id, 'removedSeats', participantId), { removedAt: serverTimestamp() });
  if (typeof party.participantCount === 'number') {
    batch.update(doc(db, 'parties', party.id), { participantCount: increment(-1) });
  }
  await batch.commit();
}

/** PartyLobby.jsx share modal -> ensureInviteToken / rotateInviteToken */
export async function rotateInviteToken(db, partyId) {
  const token = generateInviteToken();
  await setDoc(doc(db, 'parties', partyId, 'private', 'invite'), { token, updatedAt: new Date() });
  return token;
}
