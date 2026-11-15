/**
 * One-time backfill: records whose displayName equals the email local-part.
 */

import {
  displayNameMatchesEmailLocalPart,
  looksLikeEmail,
  pickDisplayName,
  playerFallbackForUserId,
} from './display-names.js';

/**
 * @param {{ displayName?: unknown, email?: unknown, name?: unknown }} record
 * @returns {boolean}
 */
export function isLeakedDisplayNameRecord(record) {
  if (!record || typeof record !== 'object') {
    return false;
  }
  const displayName = record.displayName;
  if (typeof displayName !== 'string') {
    return false;
  }
  const trimmed = displayName.trim();
  if (!trimmed) {
    return false;
  }
  if (looksLikeEmail(trimmed)) {
    return true;
  }
  return displayNameMatchesEmailLocalPart(trimmed, record.email);
}

/**
 * @param {string} userId
 * @param {{ displayName?: unknown, email?: unknown, name?: unknown }} record
 * @returns {{ displayName: string } | null}
 */
export function planLeakedDisplayNameFix(userId, record) {
  if (!isLeakedDisplayNameRecord(record)) {
    return null;
  }

  const replacement = pickDisplayName(
    userId,
    typeof record.name === 'string' ? record.name : null,
  );

  const leakedTrimmed =
    typeof record.displayName === 'string' ? record.displayName.trim() : '';

  if (replacement === leakedTrimmed || replacement === playerFallbackForUserId(userId)) {
    return { displayName: '' };
  }

  return { displayName: replacement };
}