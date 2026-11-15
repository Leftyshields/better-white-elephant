import { describe, expect, it } from 'vitest';
import { getStartGameFailureMessage } from '../../utils/startGameResponse.js';

describe('getStartGameFailureMessage', () => {
  it('returns server error text when HTTP status is not ok', () => {
    const message = getStartGameFailureMessage(
      { ok: false, status: 400 },
      { code: 'GIFT_PLAYER_COUNT_MISMATCH', error: '[PLACEHOLDER] Gift and player counts must match.' }
    );
    expect(message).toBe('[PLACEHOLDER] Gift and player counts must match.');
  });

  it('returns null when the response succeeded', () => {
    expect(
      getStartGameFailureMessage({ ok: true, status: 200 }, { success: true })
    ).toBeNull();
  });

  it('uses fallback copy when the error body is empty', () => {
    const message = getStartGameFailureMessage({ ok: false, status: 500 }, {});
    expect(message).toMatch(/PLACEHOLDER/);
  });
});