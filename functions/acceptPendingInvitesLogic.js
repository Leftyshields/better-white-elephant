/**
 * When someone joins a party, match their pending invite(s) and mark ACCEPTED.
 */

export {
  inviteDocIdFromEmail,
  inviteMatchesJoiningUser,
  filterVisiblePendingInvites,
  canResendPartyInvite,
} from './pendingInvitesLogic.js';

import { inviteMatchesJoiningUser } from './pendingInvitesLogic.js';

/**
 * @param {string} partyId
 * @param {string} participantId
 * @param {unknown} error
 */
export function logAcceptInviteOnParticipantJoinFailure(partyId, participantId, error) {
  const err = /** @type {{ code?: string | number; name?: string }} */ (error);
  console.error(
    `acceptInviteOnParticipantJoin failed partyId=${partyId} participantId=${participantId} code=${err?.code ?? 'unknown'} name=${err?.name ?? 'Error'}`
  );
}

/**
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {import('firebase-admin/auth').Auth} auth
 * @param {string} partyId
 * @param {string} participantId
 */
export async function markPendingInvitesAcceptedForParticipantJoin(
  db,
  auth,
  partyId,
  participantId
) {
  if (!partyId || !participantId || participantId.startsWith('bot_')) {
    return { updated: 0 };
  }

  let userEmail = null;
  try {
    const userRecord = await auth.getUser(participantId);
    if (userRecord.emailVerified === true && typeof userRecord.email === 'string') {
      userEmail = userRecord.email;
    }
  } catch (error) {
    console.warn(`acceptInviteOnJoin: could not load auth user ${participantId}:`, error.message);
  }

  if (!userEmail) {
    return { updated: 0 };
  }

  const invitesRef = db.collection('parties').doc(partyId).collection('pendingInvites');
  const invitesSnapshot = await invitesRef.get();
  if (invitesSnapshot.empty) {
    return { updated: 0 };
  }

  const now = new Date();
  let updated = 0;

  for (const inviteDoc of invitesSnapshot.docs) {
    const invite = { id: inviteDoc.id, ...inviteDoc.data() };
    if (!inviteMatchesJoiningUser(invite, participantId, userEmail)) {
      continue;
    }

    try {
      await inviteDoc.ref.update({
        status: 'ACCEPTED',
        userId: participantId,
        acceptedAt: now,
        updatedAt: now,
      });
      updated += 1;
    } catch (error) {
      const code = error?.code;
      if (code === 5 || code === 'not-found' || code === 'NOT_FOUND') {
        console.warn(
          `acceptInviteOnJoin: invite was removed before accept partyId=${partyId} participantId=${participantId} reason=stale_invite_removed code=${code ?? 'unknown'}`
        );
        continue;
      }
      throw error;
    }
  }

  if (updated > 0) {
    console.log(
      `acceptInviteOnJoin: marked ${updated} invite(s) ACCEPTED for ${participantId} in party ${partyId}`
    );
  }

  return { updated };
}
