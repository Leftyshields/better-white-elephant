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