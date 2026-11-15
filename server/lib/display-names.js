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
export function pickHostNameForInvite(adminId, hostNameCandidate, ownerEmail) {
  let candidate = hostNameCandidate;
  if (displayNameMatchesEmailLocalPart(candidate, ownerEmail)) {
    candidate = null;
  }
  return pickDisplayName(adminId, candidate);
}

/**
 * Firestore user sync: Auth profile first, then existing doc — never email local-part.
 */
export function resolveSyncedFirestoreDisplayName(authDisplayName, existingDisplayName) {
  const fromAuth = typeof authDisplayName === 'string' ? authDisplayName.trim() : '';
  if (fromAuth) {
    return fromAuth;
  }
  const fromExisting =
    typeof existingDisplayName === 'string' ? existingDisplayName.trim() : '';
  if (fromExisting) {
    return fromExisting;
  }
  return '';
}