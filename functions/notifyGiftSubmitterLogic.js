import {
  buildGiftSubmitterNotifyHtml,
  GIFT_SUBMITTER_NOTIFY_WITH_ADDRESS_SUBJECT,
  hostDisplayNameForInvite,
} from './sendPartyInviteLogic.js';
import { pickShippingAddress } from './winnerShippingAddressConsent.js';

/**
 * @param {unknown} error
 */
export function logNotifyGiftSubmitterFailure(error) {
  const err = /** @type {{ code?: string | number; name?: string }} */ (error);
  console.error({
    code: err?.code ?? 'unknown',
    name: err?.name ?? 'Error',
  });
}

/**
 * A0: runs when parties/{partyId}/shipping/{userId} is CREATED (saving is the share). Emails each
 * assigned sender of a gift this user won in THIS party, once per sender. Edits and deletes do not
 * send. Logs ids and counts only.
 *
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {{
 *   partyId: string,
 *   userId: string,
 *   shippingDoc: object,
 *   getResend: () => { emails: { send: (payload: object) => Promise<unknown> } },
 *   resolveFromEmail: () => string,
 * }} params
 */
export async function notifyGiftSubmittersForPartyShipping(db, params) {
  const { partyId, userId, shippingDoc, getResend, resolveFromEmail } = params;

  const shippingAddress = pickShippingAddress(shippingDoc);
  if (!shippingAddress) {
    return { sentCount: 0, reason: 'no_address' };
  }

  // Single-field query (no composite index); the party filter is applied here.
  const giftsSnapshot = await db.collection('gifts').where('winnerId', '==', userId).get();
  const submitterIds = new Set();
  for (const giftDoc of giftsSnapshot.docs) {
    const gift = giftDoc.data();
    if (gift?.partyId === partyId && gift.submitterId && gift.submitterId !== userId) {
      submitterIds.add(gift.submitterId);
    }
  }
  if (submitterIds.size === 0) {
    return { sentCount: 0, reason: 'no_gifts' };
  }

  const winnerDoc = await db.collection('users').doc(userId).get();
  const winnerDisplayName = hostDisplayNameForInvite(userId, winnerDoc.data() ?? {});
  const html = buildGiftSubmitterNotifyHtml({
    winnerDisplayName,
    shippingAddressJson: JSON.stringify(shippingAddress, null, 2),
  });
  const resendClient = getResend();
  const fromEmail = resolveFromEmail();

  let sentCount = 0;
  let failedCount = 0;
  for (const submitterId of submitterIds) {
    const submitterDoc = await db.collection('users').doc(submitterId).get();
    const submitter = submitterDoc.data();
    if (!submitter?.email) {
      continue;
    }
    try {
      await resendClient.emails.send({
        from: fromEmail,
        to: submitter.email,
        subject: GIFT_SUBMITTER_NOTIFY_WITH_ADDRESS_SUBJECT,
        html,
      });
      sentCount += 1;
    } catch (error) {
      logNotifyGiftSubmitterFailure(error);
      failedCount += 1;
    }
  }

  return { sentCount, failedCount };
}
