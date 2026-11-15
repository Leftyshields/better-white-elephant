/**
 * Pure logic for sendContactEmail (unit-tested without Firebase).
 */

import { createHash } from 'node:crypto';
import { getRateLimitBuckets, nextRateLimitState, sanitizeEmailSubjectPart } from './sendPartyInviteLogic.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

export const CONTACT_FIELD_LIMITS = {
  name: 100,
  email: 254,
  subject: 200,
  message: 10_000,
};

/** Per-IP and global contact form limits (fixed hour/day buckets). */
export const CONTACT_RATE_LIMITS = {
  ipPerHour: 5,
  ipPerDay: 20,
  globalPerHour: 100,
  globalPerDay: 500,
};

export const CONTACT_HONEYPOT_FIELD = 'company';

export const SEND_CONTACT_GENERIC_ERROR =
  "We couldn't send your message. Try again in a few minutes.";

const CONTACT_TYPES = new Set(['general', 'account', 'security', 'bug']);

export function normalizeContactEmail(email) {
  if (typeof email !== 'string') {
    return null;
  }
  const stripped = email.replace(/[\x00-\x1f\x7f\r\n]/g, '').trim();
  if (!stripped || stripped.includes(',') || stripped.includes(' ')) {
    return null;
  }
  const lowered = stripped.toLowerCase();
  if (!EMAIL_RE.test(lowered) || lowered.length > CONTACT_FIELD_LIMITS.email) {
    return null;
  }
  return lowered;
}

export function clipField(value, maxLen) {
  if (value == null) {
    return '';
  }
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  if (trimmed.length <= maxLen) {
    return trimmed;
  }
  return trimmed.slice(0, maxLen);
}

export function normalizeContactType(type) {
  const value = typeof type === 'string' ? type.trim().toLowerCase() : 'general';
  return CONTACT_TYPES.has(value) ? value : 'general';
}

export function contactSubjectPrefix(contactType) {
  if (contactType === 'security') {
    return '[SECURITY]';
  }
  if (contactType === 'bug') {
    return '[BUG REPORT]';
  }
  if (contactType === 'account') {
    return '[ACCOUNT]';
  }
  return '[CONTACT]';
}

export function buildContactEmailSubject({ contactType, subject, name, email }) {
  const prefix = contactSubjectPrefix(contactType);
  const safeSubject = sanitizeEmailSubjectPart(subject);
  if (safeSubject) {
    return sanitizeEmailSubjectPart(`${prefix} ${safeSubject}`);
  }
  const safeName = sanitizeEmailSubjectPart(name) || 'Anonymous';
  return sanitizeEmailSubjectPart(`${prefix} Contact from ${safeName} (${email})`);
}

/**
 * Neutralize angle brackets so notification is plain text only (no HTML part).
 */
export function escapePlainTextUserContent(text) {
  if (text == null) {
    return '';
  }
  return String(text).replace(/</g, '\uFF1C').replace(/>/g, '\uFF1E');
}

/**
 * Plain-text body only; user content is not interpreted as HTML.
 */
export function buildContactNotificationText({ contactType, name, email, subject, message }) {
  const safeName = escapePlainTextUserContent(name || 'Anonymous');
  const safeEmail = escapePlainTextUserContent(email);
  const safeSubject = subject ? escapePlainTextUserContent(subject) : '';
  const safeMessage = escapePlainTextUserContent(message);
  const safeType = escapePlainTextUserContent(contactType);

  const lines = [
    'Contact form submission',
    '',
    `Type: ${safeType}`,
    `From: ${safeName} (${safeEmail})`,
  ];
  if (safeSubject) {
    lines.push(`Subject: ${safeSubject}`);
  }
  lines.push('', 'Message:', safeMessage);
  return lines.join('\n');
}

export function hashIpForRateLimit(ip) {
  return createHash('sha256').update(String(ip || 'unknown')).digest('hex');
}

export { getRateLimitBuckets, nextRateLimitState };

export function isEnforceContactAppCheckEnabled(flagValue) {
  if (flagValue == null) {
    return false;
  }
  const normalized = String(flagValue).trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

export function resolveContactRecipient(rawInput) {
  const raw = (rawInput ?? '').trim();
  if (!raw || !EMAIL_RE.test(raw) || raw.includes(',') || /\s/.test(raw)) {
    return null;
  }
  return raw.toLowerCase();
}