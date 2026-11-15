export const GAME_START_ERROR_CODES = {
  INSUFFICIENT_PARTICIPANTS: 'INSUFFICIENT_PARTICIPANTS',
  GIFT_PLAYER_COUNT_MISMATCH: 'GIFT_PLAYER_COUNT_MISMATCH',
};

export const GAME_START_USER_MESSAGES = {
  INSUFFICIENT_PARTICIPANTS: 'You need at least 2 players to start.',
  GIFT_PLAYER_COUNT_MISMATCH:
    "To start, you need one gift for each player who's going. Check who still needs to add a gift, or update who's going.",
};

/**
 * Validates participant and gift counts before initializing game state.
 * @param {{ participantCount: number, giftCount: number }} counts
 * @returns {{ valid: true } | { valid: false, code: string, error: string }}
 */
export function validateGameStartCounts({ participantCount, giftCount }) {
  if (participantCount < 2) {
    return {
      valid: false,
      code: GAME_START_ERROR_CODES.INSUFFICIENT_PARTICIPANTS,
      error: GAME_START_USER_MESSAGES.INSUFFICIENT_PARTICIPANTS,
    };
  }

  if (giftCount !== participantCount) {
    return {
      valid: false,
      code: GAME_START_ERROR_CODES.GIFT_PLAYER_COUNT_MISMATCH,
      error: GAME_START_USER_MESSAGES.GIFT_PLAYER_COUNT_MISMATCH,
    };
  }

  return { valid: true };
}