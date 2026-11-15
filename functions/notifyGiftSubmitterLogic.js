import {
  buildGiftSubmitterNotifyHtml,
  buildGiftSubmitterNotifyNoAddressSharedHtml,
  GIFT_SUBMITTER_NOTIFY_NO_ADDRESS_SHARED_SUBJECT,
  GIFT_SUBMITTER_NOTIFY_WITH_ADDRESS_SUBJECT,
  hostDisplayNameForInvite,
} from './sendPartyInviteLogic.js';
import { hasSenderShareConsent, pickShippingAddress } from './winnerShippingAddressConsent.js';

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
 * @param {object | undefined} before
 * @param {object | undefined} after
 * @returns {{ shouldNotify: boolean, emailMode?: 'with_address' | 'no_address_shared' }}
 */
export function resolveGiftSubmitterNotifyUpdate(before, after) {
  const addressJustSet = !before?.shippingAddress && after?.shippingAddress;
  const consentJustSet =
    !hasSenderShareConsent(before) && hasSenderShareConsent(after);
  const hasConsent = hasSenderShareConsent(after);
  const shippingAddress = pickShippingAddress(after?.shippingAddress);

  if (addressJustSet) {
    if (hasConsent && shippingAddress) {
      return { shouldNotify: true, emailMode: 'with_address' };
    }
    return { shouldNotify: true, emailMode: 'no_address_shared' };
  }

  if (consentJustSet && shippingAddress) {
    return { shouldNotify: true, emailMode: 'with_address' };
  }

  return { shouldNotify: false };
}

/**
 * @param {object | undefined} before
 * @param {object | undefined} after
 */
export function shouldNotifyGiftSubmittersOnUserUpdate(before, after) {
  return resolveGiftSubmitterNotifyUpdate(before, after).shouldNotify;
}

/**
 * Notify each gift submitter assigned to a gift this user won (gift.submitterId).
 *
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {{
 *   userId: string,
 *   winnerUser: object,
 *   shippingAddressRaw: object,
 *   emailMode: 'with_address' | 'no_address_shared',
 *   getResend: () => { emails: { send: (payload: object) => Promise<unknown> } },
 *   resolveFromEmail: () => string,
 * }} params
 */
export async function notifyGiftSubmittersForWinnerAddress(db, params) {
  const {
    userId,
    winnerUser,
    shippingAddressRaw,
    emailMode,
    getResend,
    resolveFromEmail,
  } = params;

  const giftsSnapshot = await db
    .collection('gifts')
    .where('winnerId', '==', userId)
    .get();

  if (giftsSnapshot.empty) {
    return { sentCount: 0, reason: 'no_gifts', emailMode };
  }

  const resendClient = getResend();
  const fromEmail = resolveFromEmail();
  const winnerDisplayName = hostDisplayNameForInvite(userId, winnerUser ?? {});

  let html;
  const subject =
    emailMode === 'with_address'
      ? GIFT_SUBMITTER_NOTIFY_WITH_ADDRESS_SUBJECT
      : GIFT_SUBMITTER_NOTIFY_NO_ADDRESS_SHARED_SUBJECT;
  if (emailMode === 'with_address') {
    const shippingAddress = pickShippingAddress(shippingAddressRaw);
    if (!shippingAddress || !hasSenderShareConsent(winnerUser)) {
      return { sentCount: 0, reason: 'cannot_send_address', emailMode };
    }
    html = buildGiftSubmitterNotifyHtml({
      winnerDisplayName,
      shippingAddressJson: JSON.stringify(shippingAddress, null, 2),
    });
  } else {
    html = buildGiftSubmitterNotifyNoAddressSharedHtml({ winnerDisplayName, winnerUid: userId });
  }

  let sentCount = 0;
  let failedCount = 0;
  for (const giftDoc of giftsSnapshot.docs) {
    const gift = giftDoc.data();
    const submitterId = gift?.submitterId;
    if (!submitterId || submitterId === userId) {
      continue;
    }

    const submitterDoc = await db.collection('users').doc(submitterId).get();
    const submitter = submitterDoc.data();
    if (!submitter?.email) {
      continue;
    }

    try {
      await resendClient.emails.send({
        from: fromEmail,
        to: submitter.email,
        subject,
        html,
      });
      sentCount += 1;
    } catch (error) {
      logNotifyGiftSubmitterFailure(error);
      failedCount += 1;
    }
  }

  return { sentCount, failedCount, emailMode };
}