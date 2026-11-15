/**
 * When someone joins a party, match their pending invite(s) and mark ACCEPTED.
 */

export {
  inviteDocIdFromEmail,
  inviteMatchesJoiningUser,
  filterVisiblePendingInvites,
  canResendPartyInvite,
} from '../lib/pendingInvitesLogic.mjs';

import { inviteMatchesJoiningUser } from '../lib/pendingInvitesLogic.mjs';

/**
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {string} partyId
 * @param {string} participantId
 */
export async function markPendingInvitesAcceptedForParticipantJoin(db, partyId, participantId) {
  if (!partyId || !participantId || participantId.startsWith('bot_')) {
    return { updated: 0 };
  }

  let userEmail = null;
  try {
    const userDoc = await db.collection('users').doc(participantId).get();
    if (userDoc.exists) {
      const data = userDoc.data();
      userEmail = typeof data?.email === 'string' ? data.email : null;
    }
  } catch (error) {
    console.warn(`acceptInviteOnJoin: could not load user ${participantId}:`, error.message);
  }

  const invitesRef = db.collection('parties').doc(partyId).collection('pendingInvites');
  const invitesSnapshot = await invitesRef.get();
  if (invitesSnapshot.empty) {
    return { updated: 0 };
  }

  const now = new Date();
  const batch = db.batch();
  let updated = 0;

  for (const inviteDoc of invitesSnapshot.docs) {
    const invite = { id: inviteDoc.id, ...inviteDoc.data() };
    if (!inviteMatchesJoiningUser(invite, participantId, userEmail)) {
      continue;
    }
    batch.update(inviteDoc.ref, {
      status: 'ACCEPTED',
      userId: participantId,
      acceptedAt: now,
      updatedAt: now,
    });
    updated += 1;
  }

  if (updated > 0) {
    await batch.commit();
    console.log(`acceptInviteOnJoin: marked ${updated} invite(s) ACCEPTED for ${participantId} in party ${partyId}`);
  }

  return { updated };
}