import { describe, expect, it } from 'vitest';
import {
  getStartGameFailureMessage,
  START_GAME_GENERIC_ERROR,
} from '../../utils/startGameResponse.js';

const GIFT_MISMATCH_MESSAGE =
  "To start, you need one gift for each player who's going. Check who still needs to add a gift, or update who's going.";

describe('getStartGameFailureMessage', () => {
  it('returns server error text when HTTP status is not ok', () => {
    const message = getStartGameFailureMessage(
      { ok: false, status: 400 },
      { code: 'GIFT_PLAYER_COUNT_MISMATCH', error: GIFT_MISMATCH_MESSAGE }
    );
    expect(message).toBe(GIFT_MISMATCH_MESSAGE);
  });

  it('returns null when the response succeeded', () => {
    expect(
      getStartGameFailureMessage({ ok: true, status: 200 }, { success: true })
    ).toBeNull();
  });

  it('uses generic copy when the error body is empty', () => {
    const message = getStartGameFailureMessage({ ok: false, status: 500 }, {});
    expect(message).toBe(START_GAME_GENERIC_ERROR);
  });
});