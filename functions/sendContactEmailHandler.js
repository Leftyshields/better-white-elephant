/**
 * sendContactEmail orchestration (Firestore rate limits + Resend).
 */

import { FieldValue } from 'firebase-admin/firestore';
import { buildAllowedOrigins, isOriginAllowed } from './corsAllowedOrigins.js';
import {
  CONTACT_FIELD_LIMITS,
  CONTACT_HONEYPOT_FIELD,
  CONTACT_RATE_LIMITS,
  SEND_CONTACT_GENERIC_ERROR,
  buildContactEmailSubject,
  buildContactNotificationText,
  clipField,
  getRateLimitBuckets,
  hashIpForRateLimit,
  isEnforceContactAppCheckEnabled,
  normalizeContactEmail,
  normalizeContactType,
  nextRateLimitState,
  resolveContactRecipient,
} from './sendContactEmailLogic.js';

function rateLimitIpRef(db, hash) {
  return db.collection('_rateLimits').doc('contactFormIp').collection('records').doc(hash);
}

function rateLimitGlobalRef(db) {
  return db.collection('_rateLimits').doc('contactFormGlobal').collection('records').doc('global');
}

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

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

/**
 * @param {object} deps
 * @param {import('firebase-admin/firestore').Firestore} deps.db
 * @param {() => import('resend').Resend} deps.getResend
 * @param {() => string} deps.getFromEmail
 * @param {() => string} deps.getContactRecipient
 * @param {() => string} deps.getEnforceAppCheck
 * @param {() => string[] | undefined} [deps.getAllowedOrigins]
 * @param {import('firebase-admin/app-check').AppCheck | null} [deps.appCheck]
 * @param {() => string} [deps.getAllowedOriginsCsv]
 */
export async function handleSendContactEmailRequest(req, deps) {
  const {
    db,
    getResend,
    getFromEmail,
    getContactRecipient,
    getEnforceAppCheck,
    appCheck = null,
    getAllowedOrigins,
    getAllowedOriginsCsv,
  } = deps;

  const allowedOrigins =
    getAllowedOrigins?.() ??
    buildAllowedOrigins({
      allowedOriginsCsv: getAllowedOriginsCsv?.(),
    });

  const origin = req.headers.origin;
  const originAllowed = isOriginAllowed(origin, allowedOrigins);

  if (req.method === 'OPTIONS') {
    if (!originAllowed) {
      return { status: 403, body: { error: SEND_CONTACT_GENERIC_ERROR }, corsOrigin: null };
    }
    return { status: 204, body: null, corsOrigin: origin };
  }

  if (req.method !== 'POST') {
    return {
      status: 405,
      body: { error: SEND_CONTACT_GENERIC_ERROR },
      corsOrigin: originAllowed ? origin : null,
    };
  }

  if (!originAllowed) {
    return { status: 403, body: { error: SEND_CONTACT_GENERIC_ERROR }, corsOrigin: null };
  }

  const body = req.body ?? {};
  const honeypot = body[CONTACT_HONEYPOT_FIELD];
  if (typeof honeypot === 'string' && honeypot.trim().length > 0) {
    return { status: 200, body: { success: true }, corsOrigin: origin };
  }

  if (isEnforceContactAppCheckEnabled(getEnforceAppCheck?.())) {
    const appCheckToken = req.get?.('X-Firebase-AppCheck') ?? req.headers['x-firebase-appcheck'];
    if (!appCheckToken || !appCheck) {
      return { status: 403, body: { error: SEND_CONTACT_GENERIC_ERROR }, corsOrigin: origin };
    }
    try {
      await appCheck.verifyToken(appCheckToken);
    } catch (error) {
      console.error('contact app check failed:', { code: error?.code, name: error?.name });
      return { status: 403, body: { error: SEND_CONTACT_GENERIC_ERROR }, corsOrigin: origin };
    }
  }

  const recipient = resolveContactRecipient(getContactRecipient());
  if (!recipient) {
    console.error('contact misconfigured:', { code: 'missing_contact_recipient', name: 'ConfigError' });
    return { status: 500, body: { error: SEND_CONTACT_GENERIC_ERROR }, corsOrigin: origin };
  }

  const email = normalizeContactEmail(body.email);
  const message = clipField(body.message, CONTACT_FIELD_LIMITS.message);
  const name = clipField(body.name, CONTACT_FIELD_LIMITS.name);
  const subject = clipField(body.subject, CONTACT_FIELD_LIMITS.subject);
  const contactType = normalizeContactType(body.type);

  if (!email || !message) {
    return { status: 400, body: { error: SEND_CONTACT_GENERIC_ERROR }, corsOrigin: origin };
  }

  const buckets = getRateLimitBuckets();
  const ipHash = hashIpForRateLimit(clientIp(req));

  const ipResult = await consumeRateLimit(db, rateLimitIpRef(db, ipHash), buckets, {
    perHour: CONTACT_RATE_LIMITS.ipPerHour,
    perDay: CONTACT_RATE_LIMITS.ipPerDay,
  });
  if (!ipResult.allowed) {
    return { status: 429, body: { error: SEND_CONTACT_GENERIC_ERROR }, corsOrigin: origin };
  }

  const globalResult = await consumeRateLimit(db, rateLimitGlobalRef(db), buckets, {
    perHour: CONTACT_RATE_LIMITS.globalPerHour,
    perDay: CONTACT_RATE_LIMITS.globalPerDay,
  });
  if (!globalResult.allowed) {
    return { status: 429, body: { error: SEND_CONTACT_GENERIC_ERROR }, corsOrigin: origin };
  }

  let fromEmail = getFromEmail();
  fromEmail = typeof fromEmail === 'string' ? fromEmail.trim() : 'onboarding@resend.dev';
  const emailMatch = fromEmail.match(/<(.+?)>/) || fromEmail.match(/^(.+?@.+?)$/);
  if (emailMatch) {
    const emailOnly = emailMatch[1];
    if (fromEmail.includes('<') && fromEmail.includes('>')) {
      fromEmail = fromEmail.replace(/\s+/g, ' ').trim();
    } else {
      fromEmail = emailOnly;
    }
  } else {
    fromEmail = 'onboarding@resend.dev';
  }

  const text = buildContactNotificationText({
    contactType,
    name,
    email,
    subject,
    message,
  });
  const emailSubject = buildContactEmailSubject({ contactType, subject, name, email });

  const resendClient = getResend();
  const { error } = await resendClient.emails.send({
    from: fromEmail,
    to: recipient,
    replyTo: email,
    subject: emailSubject,
    text,
  });

  if (error) {
    console.error('contact send failed:', { code: error?.statusCode, name: error?.name });
    return { status: 500, body: { error: SEND_CONTACT_GENERIC_ERROR }, corsOrigin: origin };
  }

  return { status: 200, body: { success: true }, corsOrigin: origin };
}