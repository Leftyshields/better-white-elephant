import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateGameStartCounts,
  GAME_START_ERROR_CODES,
} from '../utils/game-start-validation.js';

test('rejects start when there are more gifts than going participants', () => {
  const result = validateGameStartCounts({ participantCount: 3, giftCount: 5 });
  assert.equal(result.valid, false);
  assert.equal(result.code, GAME_START_ERROR_CODES.GIFT_PLAYER_COUNT_MISMATCH);
  assert.match(result.error, /PLACEHOLDER/);
});

test('rejects start when there are fewer gifts than going participants', () => {
  const result = validateGameStartCounts({ participantCount: 4, giftCount: 2 });
  assert.equal(result.valid, false);
  assert.equal(result.code, GAME_START_ERROR_CODES.GIFT_PLAYER_COUNT_MISMATCH);
});

test('allows start when gift count equals going participant count', () => {
  const result = validateGameStartCounts({ participantCount: 4, giftCount: 4 });
  assert.equal(result.valid, true);
});

test('still rejects fewer than two participants', () => {
  const result = validateGameStartCounts({ participantCount: 1, giftCount: 1 });
  assert.equal(result.valid, false);
  assert.equal(result.code, GAME_START_ERROR_CODES.INSUFFICIENT_PARTICIPANTS);
});