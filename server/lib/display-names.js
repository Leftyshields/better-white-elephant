/**
 * Shared display-name helpers (client, server, functions, scripts).
 * Never use an email local-part as a visible name.
 */

export function looksLikeEmail(value) {
  return typeof value === 'string' && value.includes('@');
}

export function playerFallbackForUserId(userId) {
  if (typeof userId !== 'string' || !userId) {
    return 'Player unknown';
  }
  if (userId.startsWith('bot_')) {
    const parts = userId.split('_');
    if (parts.length >= 2) {
      const suffix = parts[parts.length - 1];
      return `Player ${suffix.slice(0, 8)}`;
    }
    return `Player ${userId.slice(4, 12)}`;
  }
  return `Player ${userId.slice(0, 8)}`;
}

export function pickDisplayName(userId, ...candidates) {
  for (const name of candidates) {
    if (typeof name !== 'string') {
      continue;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      continue;
    }
    if (looksLikeEmail(trimmed)) {
      continue;
    }
    return trimmed;
  }
  return playerFallbackForUserId(userId);
}

export function emailLocalPart(email) {
  if (typeof email !== 'string' || !email.includes('@')) {
    return '';
  }
  return email.split('@')[0];
}

/**
 * True when a stored or proposed display name is exactly the local-part of an email.
 */
export function displayNameMatchesEmailLocalPart(displayName, email) {
  if (typeof displayName !== 'string' || typeof email !== 'string') {
    return false;
  }
  const trimmed = displayName.trim();
  if (!trimmed) {
    return false;
  }
  const local = emailLocalPart(email);
  if (!local) {
    return false;
  }
  return trimmed === local;
}

/**
 * Host line in invite emails — never falls back to the email local-part.
 */
export const MAX_PUBLIC_HOST_DISPLAY_NAME_LENGTH = 64;

export function pickHostNameForInvite(adminId, hostNameCandidate, ownerEmail) {
  let candidate = hostNameCandidate;
  if (displayNameMatchesEmailLocalPart(candidate, ownerEmail)) {
    candidate = null;
  }
  return pickDisplayName(adminId, candidate);
}

/** Copywriter-approved invite intro when the host has no usable public name. */
export const PARTY_INVITE_INTRO_ANONYMOUS =
  'Your host invited you to a Steal or Reveal game.';

/** User-entered profile / signup display name — never persist an email string. */
export function sanitizeUserChosenDisplayName(value) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed || looksLikeEmail(trimmed)) {
    return '';
  }
  return trimmed;
}

/**
 * Trimmed party.hostDisplayName for Firestore writes (invite landing reads this field).
 */
/** Matches firestore.rules validHostDisplayName (trimmed, 1–64, no @, no edge whitespace). */
export function isValidPublicHostDisplayName(value) {
  if (typeof value !== 'string' || looksLikeEmail(value)) {
    return false;
  }
  if (value.length > MAX_PUBLIC_HOST_DISPLAY_NAME_LENGTH) {
    return false;
  }
  return /^\S(.{0,62}\S)?$/.test(value);
}

export function hostDisplayNameForPartyDoc(adminId, displayName, email) {
  let value = pickHostNameForInvite(adminId, displayName, email).trim();
  if (value.length > MAX_PUBLIC_HOST_DISPLAY_NAME_LENGTH) {
    value = value.slice(0, MAX_PUBLIC_HOST_DISPLAY_NAME_LENGTH);
  }
  return value;
}

/**
 * Firestore user sync: Auth profile first, then existing doc — never email-shaped.
 */
export function resolveSyncedFirestoreDisplayName(authDisplayName, existingDisplayName) {
  const fromAuth = sanitizeUserChosenDisplayName(authDisplayName);
  if (fromAuth) {
    return fromAuth;
  }
  return sanitizeUserChosenDisplayName(existingDisplayName);
}

/** True when the value is only the synthetic Player-id fallback (not for public email copy). */
export function isSyntheticPlayerDisplayName(hostName, userId) {
  if (hostName === 'Player unknown') {
    return true;
  }
  if (typeof hostName !== 'string' || !hostName.trim()) {
    return true;
  }
  return hostName === playerFallbackForUserId(userId);
}

/**
 * Party invite email intro: named host when possible; otherwise anonymous Copywriter line.
 */
export function buildPartyInviteIntroParagraph(safeHostName, adminId) {
  if (isSyntheticPlayerDisplayName(safeHostName, adminId)) {
    return `<p>${PARTY_INVITE_INTRO_ANONYMOUS}</p>`;
  }
  return `<p>${safeHostName} has invited you to a White Elephant gift exchange party.</p>`;
}