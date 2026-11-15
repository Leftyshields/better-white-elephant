/**
 * Display name selection for emails (mirrors server/utils/batch-users.js; functions deploy boundary).
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

export function pickHostNameForInvite(adminId, hostUserProfile) {
  const profile = hostUserProfile ?? {};
  const ownerEmail = typeof profile.email === 'string' ? profile.email : '';
  let displayCandidate = profile.displayName;
  if (displayNameMatchesEmailLocalPart(displayCandidate, ownerEmail)) {
    displayCandidate = null;
  }
  return pickDisplayName(adminId, displayCandidate, profile.name);
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