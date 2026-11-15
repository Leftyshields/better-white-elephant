import {
  looksLikeEmail,
  playerFallbackForUserId,
} from '../../../server/lib/display-names.js';

/**
 * Lobby-safe display name (never email-shaped; fallback Player {id8}).
 */
export function resolveLobbyParticipantDisplayName(userId, namesFromBatch) {
  const raw = namesFromBatch?.[userId];
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed && !looksLikeEmail(trimmed) && trimmed !== userId) {
      return trimmed;
    }
  }
  return playerFallbackForUserId(userId);
}