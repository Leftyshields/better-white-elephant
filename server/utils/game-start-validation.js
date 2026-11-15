export const GAME_START_ERROR_CODES = {
  INSUFFICIENT_PARTICIPANTS: 'INSUFFICIENT_PARTICIPANTS',
  GIFT_PLAYER_COUNT_MISMATCH: 'GIFT_PLAYER_COUNT_MISMATCH',
};

export const GAME_START_USER_MESSAGES = {
  INSUFFICIENT_PARTICIPANTS: 'You need at least 2 players to start.',
  GIFT_PLAYER_COUNT_MISMATCH:
    "To start, you need one gift for each player who's going. Check who still needs to add a gift, or update who's going.",
};

function mismatchResult() {
  return {
    valid: false,
    code: GAME_START_ERROR_CODES.GIFT_PLAYER_COUNT_MISMATCH,
    error: GAME_START_USER_MESSAGES.GIFT_PLAYER_COUNT_MISMATCH,
  };
}

/**
 * Validates that each GOING participant (including bots) has exactly one gift
 * and every gift submitter is a GOING participant. Gifts use `submitterId`
 * (same field as human-submitted gifts; bot sim sets submitterId to the bot participant id).
 *
 * @param {{ goingParticipantIds: string[], gifts: Array<{ submitterId?: string | null }> }} input
 * @returns {{ valid: true } | { valid: false, code: string, error: string }}
 */
export function validateGameStartGiftAssignment({ goingParticipantIds, gifts }) {
  if (goingParticipantIds.length < 2) {
    return {
      valid: false,
      code: GAME_START_ERROR_CODES.INSUFFICIENT_PARTICIPANTS,
      error: GAME_START_USER_MESSAGES.INSUFFICIENT_PARTICIPANTS,
    };
  }

  const goingSet = new Set(goingParticipantIds);
  const giftsBySubmitter = new Map();

  for (const gift of gifts) {
    const submitterId = gift?.submitterId;
    if (typeof submitterId !== 'string' || submitterId.length === 0) {
      return mismatchResult();
    }
    if (!goingSet.has(submitterId)) {
      return mismatchResult();
    }
    giftsBySubmitter.set(submitterId, (giftsBySubmitter.get(submitterId) || 0) + 1);
  }

  for (const participantId of goingParticipantIds) {
    if (giftsBySubmitter.get(participantId) !== 1) {
      return mismatchResult();
    }
  }

  return { valid: true };
}