/**
 * Display-name helpers for Firebase Functions deploy bundle only.
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

export function pickHostNameForInvite(adminId, hostNameCandidate, ownerEmail) {
  let candidate = hostNameCandidate;
  if (displayNameMatchesEmailLocalPart(candidate, ownerEmail)) {
    candidate = null;
  }
  return pickDisplayName(adminId, candidate);
}

/** Invite emails: Auth/Firestore user doc shape (displayName, name, email). */
export function pickHostNameForInviteFromProfile(adminId, hostUserProfile) {
  const profile = hostUserProfile ?? {};
  const ownerEmail = typeof profile.email === 'string' ? profile.email : '';
  let displayCandidate = profile.displayName;
  if (displayNameMatchesEmailLocalPart(displayCandidate, ownerEmail)) {
    displayCandidate = null;
  }
  return pickDisplayName(adminId, displayCandidate, profile.name);
}

/** Copywriter-approved invite intro when the host has no usable public name. */
export const PARTY_INVITE_INTRO_ANONYMOUS =
  'Your host invited you to a Steal or Reveal game.';

const UNICODE_HEADER_NAME_SEPARATORS = /\u2028|\u2029|\u0085/g;

export function sanitizeUserChosenDisplayName(value) {
  const trimmed =
    typeof value === 'string'
      ? value.replace(UNICODE_HEADER_NAME_SEPARATORS, '').trim()
      : '';
  if (!trimmed || looksLikeEmail(trimmed)) {
    return '';
  }
  return trimmed;
}

export function resolveSyncedFirestoreDisplayName(authDisplayName, existingDisplayName) {
  const fromAuth = sanitizeUserChosenDisplayName(authDisplayName);
  if (fromAuth) {
    return fromAuth;
  }
  return sanitizeUserChosenDisplayName(existingDisplayName);
}

export function isSyntheticPlayerDisplayName(hostName, userId) {
  if (hostName === 'Player unknown') {
    return true;
  }
  if (typeof hostName !== 'string' || !hostName.trim()) {
    return true;
  }
  return hostName === playerFallbackForUserId(userId);
}

export function buildPartyInviteIntroParagraph(safeHostName, adminId) {
  if (isSyntheticPlayerDisplayName(safeHostName, adminId)) {
    return `<p>${PARTY_INVITE_INTRO_ANONYMOUS}</p>`;
  }
  return `<p>${safeHostName} invited you to a Steal or Reveal game.</p>`;
}