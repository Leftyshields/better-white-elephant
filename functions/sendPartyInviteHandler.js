/**
 * sendPartyInvite orchestration (Firebase Admin + Resend).
 */

import { FieldValue } from 'firebase-admin/firestore';
import {
  PARTY_INVITE_RATE_LIMITS,
  SEND_PARTY_INVITE_ERRORS,
  assertCallerIsPartyHost,
  buildInviteEmailHtml,
  inviteEmailSubject,
  getRateLimitBuckets,
  hashRecipientForRateLimit,
  hostDisplayNameForInvite,
  inviteDocIdForEmail,
  isValidPartyId,
  nextRateLimitState,
  normalizeInviteEmail,
  pendingInviteBlocksSend,
  recipientIsExistingParticipant,
  resolveClientUrl,
} from './sendPartyInviteLogic.js';

/** Rate-limit docs: Admin SDK only; Firestore rules deny all client access to `_rateLimits`. */

/** Host invite counters keyed by host user id (shared across every party they host). */
function rateLimitHostRef(db, uid) {
  return db.collection('_rateLimits').doc('partyInviteHosts').collection('records').doc(uid);
}

function rateLimitRecipientRef(db, hash) {
  return db
    .collection('_rateLimits')
    .doc('partyInviteRecipients')
    .collection('records')
    .doc(hash);
}

/**
 * @param {import('firebase-admin/firestore').Firestore} db
 */
async function consumeRateLimit(db, ref, buckets, limits) {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const stored = snap.exists ? snap.data() : {};
    const result = nextRateLimitState(stored, buckets, limits);
    if (!result.allowed) {
      return result;
    }
    tx.set(
      ref,
      {
        hourBucket: result.hourBucket,
        hourCount: result.hourCount,
        dayBucket: result.dayBucket,
        dayCount: result.dayCount,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return result;
  });
}

/**
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {string} partyId
 * @param {string} normalizedEmail
 */
async function loadParticipantEmailsForParty(db, partyId, normalizedEmail) {
  const emails = new Set();

  const usersByEmail = await db
    .collection('users')
    .where('email', '==', normalizedEmail)
    .limit(5)
    .get();

  for (const userDoc of usersByEmail.docs) {
    const participantSnap = await db
      .collection('parties')
      .doc(partyId)
      .collection('participants')
      .doc(userDoc.id)
      .get();
    if (participantSnap.exists) {
      const userEmail = (userDoc.data()?.email || '').trim().toLowerCase();
      if (userEmail) {
        emails.add(userEmail);
      }
    }
  }

  const participantsSnap = await db
    .collection('parties')
    .doc(partyId)
    .collection('participants')
    .get();

  const userLoads = participantsSnap.docs.map(async (participantDoc) => {
    const userSnap = await db.collection('users').doc(participantDoc.id).get();
    if (!userSnap.exists) {
      return;
    }
    const userEmail = (userSnap.data()?.email || '').trim().toLowerCase();
    if (userEmail) {
      emails.add(userEmail);
    }
  });
  await Promise.all(userLoads);

  return emails;
}

/**
 * @param {object} deps
 * @param {import('firebase-admin/firestore').Firestore} deps.db
 * @param {import('firebase-admin/auth').Auth} deps.auth
 * @param {() => import('resend').Resend} deps.getResend
 * @param {() => string} deps.getFromEmail
 */
export async function handleSendPartyInviteRequest(req, deps) {
  const { db, auth, getResend, getFromEmail } = deps;

  const authHeader = req.headers.authorization || req.get?.('Authorization');
  const token =
    typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length).trim()
      : null;

  if (!token) {
    return {
      status: 401,
      body: { error: 'Unauthorized', message: SEND_PARTY_INVITE_ERRORS.missingAuth },
    };
  }

  let callerUid;
  try {
    const decoded = await auth.verifyIdToken(token);
    callerUid = decoded.uid;
  } catch {
    return {
      status: 401,
      body: { error: 'Unauthorized', message: SEND_PARTY_INVITE_ERRORS.invalidAuth },
    };
  }

  const { email, partyId } = req.body ?? {};
  if (!email || !partyId) {
    return {
      status: 400,
      body: { error: SEND_PARTY_INVITE_ERRORS.missingFields },
    };
  }

  if (!isValidPartyId(partyId)) {
    return {
      status: 400,
      body: { error: SEND_PARTY_INVITE_ERRORS.invalidPartyId },
    };
  }

  const normalizedEmail = normalizeInviteEmail(email);
  if (!normalizedEmail) {
    return {
      status: 400,
      body: { error: SEND_PARTY_INVITE_ERRORS.invalidEmail },
    };
  }

  const partyDoc = await db.collection('parties').doc(partyId).get();
  if (!partyDoc.exists) {
    return {
      status: 404,
      body: { error: SEND_PARTY_INVITE_ERRORS.partyNotFound },
    };
  }

  const party = partyDoc.data();
  if (!assertCallerIsPartyHost(party, callerUid)) {
    return {
      status: 403,
      body: { error: 'Forbidden', message: SEND_PARTY_INVITE_ERRORS.notHost },
    };
  }

  const inviteId = inviteDocIdForEmail(normalizedEmail);
  const pendingInviteSnap = await db
    .collection('parties')
    .doc(partyId)
    .collection('pendingInvites')
    .doc(inviteId)
    .get();

  if (pendingInviteBlocksSend(pendingInviteSnap.exists ? pendingInviteSnap.data() : null)) {
    return {
      status: 409,
      body: { error: SEND_PARTY_INVITE_ERRORS.inviteAccepted },
    };
  }

  const participantEmails = await loadParticipantEmailsForParty(
    db,
    partyId,
    normalizedEmail,
  );
  if (recipientIsExistingParticipant(normalizedEmail, participantEmails)) {
    return {
      status: 409,
      body: { error: SEND_PARTY_INVITE_ERRORS.alreadyParticipant },
    };
  }

  const buckets = getRateLimitBuckets();

  const recipientHash = hashRecipientForRateLimit(normalizedEmail);
  const recipientLimit = await consumeRateLimit(
    db,
    rateLimitRecipientRef(db, recipientHash),
    buckets,
    {
      perHour: PARTY_INVITE_RATE_LIMITS.recipientPerHour,
      perDay: PARTY_INVITE_RATE_LIMITS.recipientPerDay,
    },
  );
  if (!recipientLimit.allowed) {
    const message =
      recipientLimit.reason === 'day'
        ? SEND_PARTY_INVITE_ERRORS.rateLimitRecipientDay
        : SEND_PARTY_INVITE_ERRORS.rateLimitRecipientHour;
    return { status: 429, body: { error: 'Too many requests', message } };
  }

  const hostLimit = await consumeRateLimit(
    db,
    rateLimitHostRef(db, callerUid),
    buckets,
    {
      perHour: PARTY_INVITE_RATE_LIMITS.hostPerHour,
      perDay: PARTY_INVITE_RATE_LIMITS.hostPerDay,
    },
  );
  if (!hostLimit.allowed) {
    const message =
      hostLimit.reason === 'day'
        ? SEND_PARTY_INVITE_ERRORS.rateLimitHostDay
        : SEND_PARTY_INVITE_ERRORS.rateLimitHostHour;
    return { status: 429, body: { error: 'Too many requests', message } };
  }

  const hostUserSnap = await db.collection('users').doc(callerUid).get();
  const hostDisplayName = hostDisplayNameForInvite(
    callerUid,
    hostUserSnap.exists ? hostUserSnap.data() : {},
  );

  const clientUrl = resolveClientUrl(req.get?.('origin'), req.get?.('referer'));
  const inviteLink = `${clientUrl}/party/${partyId}`;
  const partyTitle = party.title || 'Steal or Reveal party';
  const partyDateLabel = party.date?.toDate
    ? party.date.toDate().toLocaleDateString()
    : 'TBD';

  const html = buildInviteEmailHtml({
    hostUid: callerUid,
    hostDisplayName,
    partyTitle,
    partyDateLabel,
    inviteLink,
  });

  const resendClient = getResend();
  let fromEmail = getFromEmail();
  fromEmail = fromEmail.trim();
  if (!fromEmail.includes('@')) {
    fromEmail = 'onboarding@resend.dev';
  }

  const { data, error } = await resendClient.emails.send({
    from: fromEmail,
    to: normalizedEmail,
    subject: inviteEmailSubject(partyTitle, hostDisplayName),
    html,
  });

  if (error) {
    console.error('Resend error:', {
      code: error.statusCode ?? error.code,
      name: error.name,
    });

    return {
      status: 500,
      body: { error: SEND_PARTY_INVITE_ERRORS.sendInviteServerError },
    };
  }

  return {
    status: 200,
    body: { success: true, messageId: data?.id },
  };
}