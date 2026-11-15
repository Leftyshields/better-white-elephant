/**
 * Pure logic and constants for sendPartyInvite (unit-tested without Firebase).
 */

import { createHash } from 'node:crypto';
import { pickDisplayName } from './displayName.js';

/**
 * Documented rate limits (see PR). Fixed hour/day bucket counters (not rolling windows).
 * Host limits apply per host Firebase uid (all parties that user hosts share one quota).
 */
export const PARTY_INVITE_RATE_LIMITS = {
  hostPerHour: 50,
  hostPerDay: 200,
  recipientPerHour: 10,
  recipientPerDay: 25,
};

export const INVITE_EMAIL_SUBJECT_MAX_LENGTH = 120;

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function escapeHtml(text) {
  if (text == null) {
    return '';
  }
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function normalizeInviteEmail(email) {
  if (typeof email !== 'string') {
    return null;
  }
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !EMAIL_RE.test(trimmed)) {
    return null;
  }
  return trimmed;
}

/** Matches client pendingInvites doc ids; do not change without a migration. */
export function inviteDocIdForEmail(normalizedEmail) {
  return normalizedEmail.replace(/[^a-z0-9]/g, '_');
}

export function isValidPartyId(partyId) {
  return (
    typeof partyId === 'string' &&
    partyId.length > 0 &&
    partyId.length <= 128 &&
    /^[a-zA-Z0-9_-]+$/.test(partyId)
  );
}

export function assertCallerIsPartyHost(party, callerUid) {
  return (
    party &&
    typeof callerUid === 'string' &&
    callerUid.length > 0 &&
    party.adminId === callerUid
  );
}

export function getRateLimitBuckets(nowMs = Date.now()) {
  return {
    hourBucket: Math.floor(nowMs / MS_PER_HOUR),
    dayBucket: Math.floor(nowMs / MS_PER_DAY),
  };
}

/**
 * @param {{ hourBucket?: number, hourCount?: number, dayBucket?: number, dayCount?: number }} stored
 */
export function nextRateLimitState(stored, buckets, limits) {
  const hourBucket = buckets.hourBucket;
  const dayBucket = buckets.dayBucket;
  let hourCount =
    stored?.hourBucket === hourBucket ? (stored.hourCount ?? 0) : 0;
  let dayCount = stored?.dayBucket === dayBucket ? (stored.dayCount ?? 0) : 0;

  if (hourCount >= limits.perHour) {
    return { allowed: false, reason: 'hour', hourBucket, hourCount, dayBucket, dayCount };
  }
  if (dayCount >= limits.perDay) {
    return { allowed: false, reason: 'day', hourBucket, hourCount, dayBucket, dayCount };
  }

  hourCount += 1;
  dayCount += 1;
  return {
    allowed: true,
    hourBucket,
    hourCount,
    dayBucket,
    dayCount,
  };
}

export function hashRecipientForRateLimit(normalizedEmail) {
  return createHash('sha256').update(normalizedEmail).digest('hex');
}

/**
 * @param {Array<{ status?: string, email?: string }>} pendingInvites
 */
export function pendingInviteBlocksSend(pendingInviteDoc) {
  return pendingInviteDoc?.status === 'ACCEPTED';
}

/**
 * @param {string} normalizedEmail
 * @param {Set<string>} participantEmailsLower
 */
export function recipientIsExistingParticipant(normalizedEmail, participantEmailsLower) {
  return participantEmailsLower.has(normalizedEmail);
}

export function hostDisplayNameForInvite(hostUid, hostUserProfile) {
  const profile = hostUserProfile ?? {};
  return pickDisplayName(
    hostUid,
    profile.displayName,
    profile.name,
  );
}

export function buildInviteEmailHtml({
  hostDisplayName,
  partyTitle,
  partyDateLabel,
  inviteLink,
}) {
  const safeHost = escapeHtml(hostDisplayName);
  const safeTitle = escapeHtml(partyTitle);
  const safeDate = escapeHtml(partyDateLabel);
  const safeLink = escapeHtml(inviteLink);

  return `
        <h1>You're Invited!</h1>
        <p>${safeHost} has invited you to a White Elephant gift exchange party.</p>
        <div style="background-color: #f3f4f6; padding: 16px; border-radius: 6px; margin: 16px 0;">
          <p style="margin: 0;"><strong>${safeTitle}</strong></p>
          <p style="margin: 8px 0 0 0; color: #6b7280;">Date: ${safeDate}</p>
        </div>
        <p><a href="${safeLink}" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; margin-top: 16px;">Join Party</a></p>
        <p style="margin-top: 16px; color: #6b7280; font-size: 14px;">Or copy this link: <a href="${safeLink}">${safeLink}</a></p>
      `;
}

export function buildGiftSubmitterNotifyHtml({ winnerDisplayName, shippingAddressJson }) {
  const safeName = escapeHtml(winnerDisplayName);
  const safeAddress = escapeHtml(shippingAddressJson);

  return `
              <h1>Shipping Address</h1>
              <p>The winner of your gift has provided their shipping address:</p>
              <div style="background-color: #f3f4f6; padding: 16px; border-radius: 6px; margin: 16px 0;">
                <p><strong>${safeName}</strong></p>
                <pre style="white-space: pre-wrap; font-family: sans-serif;">${safeAddress}</pre>
              </div>
              <p>Please ship the gift to this address.</p>
            `;
}

const PRODUCTION_CLIENT_ORIGIN = 'https://stealorreveal.com';

export function resolveClientUrl(origin, referer, options = {}) {
  const inEmulator =
    options.functionsEmulator === true ||
    process.env.FUNCTIONS_EMULATOR === 'true';

  if (!inEmulator) {
    return PRODUCTION_CLIENT_ORIGIN;
  }

  const source = origin || referer || '';
  if (!source) {
    return PRODUCTION_CLIENT_ORIGIN;
  }

  try {
    const parsed = new URL(source);
    const host = parsed.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return parsed.origin.replace(/\/$/, '');
    }
  } catch {
    return PRODUCTION_CLIENT_ORIGIN;
  }

  return PRODUCTION_CLIENT_ORIGIN;
}

export function sanitizeEmailSubjectPart(value) {
  if (value == null) {
    return '';
  }
  return String(value)
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/[<>]/g, '')
    .trim();
}

export const SEND_PARTY_INVITE_ERRORS = {
  missingAuth: 'Sign in to send invites.',
  invalidAuth: "You've been signed out. Sign in again to send invites.",
  notHost: 'Only the host can send invites for this party.',
  missingFields: 'email and partyId are required',
  invalidEmail: 'Enter a valid email address.',
  invalidPartyId: 'Invalid party id.',
  partyNotFound: "We couldn't find this party. Refresh the page and try again.",
  alreadyParticipant:
    "That person is already in this party, so we didn't send another invite.",
  inviteAccepted:
    "That person already accepted their invite, so we didn't send another one.",
  rateLimitHostHour:
    "You've sent a lot of invites in the last hour. Try again in about an hour.",
  rateLimitHostDay:
    "You've hit today's invite limit for this party. Try again tomorrow.",
  rateLimitRecipientHour:
    'That email address has gotten a lot of invites recently. Try again later.',
  rateLimitRecipientDay:
    'That email address has gotten too many invites today. Try again tomorrow.',
};

/** Email Subject: sanitized partyTitle and hostName; capped length; CRLF/control chars stripped. */
export function inviteEmailSubject(partyTitle, hostDisplayName) {
  sanitizeEmailSubjectPart(hostDisplayName);
  const title = sanitizeEmailSubjectPart(partyTitle) || 'White Elephant Party';
  const prefix = "You're invited to ";
  const suffix = '!';
  let subject = `${prefix}${title}${suffix}`;
  if (subject.length > INVITE_EMAIL_SUBJECT_MAX_LENGTH) {
    const maxTitle =
      INVITE_EMAIL_SUBJECT_MAX_LENGTH - prefix.length - suffix.length - 3;
    const clipped = title.slice(0, Math.max(0, maxTitle));
    subject = `${prefix}${clipped}...${suffix}`;
    if (subject.length > INVITE_EMAIL_SUBJECT_MAX_LENGTH) {
      subject = subject.slice(0, INVITE_EMAIL_SUBJECT_MAX_LENGTH);
    }
  }
  return subject;
}