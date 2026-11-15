export const GAME_START_ERROR_CODES = {
  INSUFFICIENT_PARTICIPANTS: 'INSUFFICIENT_PARTICIPANTS',
  GIFT_PLAYER_COUNT_MISMATCH: 'GIFT_PLAYER_COUNT_MISMATCH',
};

/** User-facing copy; placeholders until Copywriter finalizes (see PR TODO-COPY). */
export const GAME_START_USER_MESSAGES = {
  INSUFFICIENT_PARTICIPANTS: 'Need at least 2 participants to start',
  GIFT_PLAYER_COUNT_MISMATCH:
    '[PLACEHOLDER] This party cannot start until the number of gifts matches the number of players who are going. Each player should bring one gift.',
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