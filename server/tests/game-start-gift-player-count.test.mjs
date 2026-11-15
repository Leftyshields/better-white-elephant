import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateGameStartGiftAssignment,
  GAME_START_ERROR_CODES,
  GAME_START_USER_MESSAGES,
} from '../utils/game-start-validation.js';

function giftsForSubmitters(submitterIds) {
  return submitterIds.map((submitterId, index) => ({
    id: `gift-${index}`,
    submitterId,
  }));
}

test('rejects start when there are more gifts than going participants', () => {
  const going = ['a', 'b', 'c'];
  const gifts = giftsForSubmitters(['a', 'b', 'c', 'd', 'e']);
  const result = validateGameStartGiftAssignment({ goingParticipantIds: going, gifts });
  assert.equal(result.valid, false);
  assert.equal(result.code, GAME_START_ERROR_CODES.GIFT_PLAYER_COUNT_MISMATCH);
  assert.equal(result.error, GAME_START_USER_MESSAGES.GIFT_PLAYER_COUNT_MISMATCH);
});

test('rejects start when there are fewer gifts than going participants', () => {
  const going = ['a', 'b', 'c', 'd'];
  const gifts = giftsForSubmitters(['a', 'b']);
  const result = validateGameStartGiftAssignment({ goingParticipantIds: going, gifts });
  assert.equal(result.valid, false);
  assert.equal(result.code, GAME_START_ERROR_CODES.GIFT_PLAYER_COUNT_MISMATCH);
});

test('allows start when each going participant has exactly one gift', () => {
  const going = ['a', 'b', 'c', 'd'];
  const gifts = giftsForSubmitters(['a', 'b', 'c', 'd']);
  const result = validateGameStartGiftAssignment({ goingParticipantIds: going, gifts });
  assert.equal(result.valid, true);
});

test('still rejects fewer than two participants', () => {
  const result = validateGameStartGiftAssignment({
    goingParticipantIds: ['solo'],
    gifts: giftsForSubmitters(['solo']),
  });
  assert.equal(result.valid, false);
  assert.equal(result.code, GAME_START_ERROR_CODES.INSUFFICIENT_PARTICIPANTS);
  assert.equal(result.error, GAME_START_USER_MESSAGES.INSUFFICIENT_PARTICIPANTS);
});

test('rejects duplicate submitter with another going player missing a gift', () => {
  const going = ['player-a', 'player-b', 'player-c'];
  const gifts = giftsForSubmitters(['player-a', 'player-a', 'player-b']);
  const result = validateGameStartGiftAssignment({ goingParticipantIds: going, gifts });
  assert.equal(result.valid, false);
  assert.equal(result.code, GAME_START_ERROR_CODES.GIFT_PLAYER_COUNT_MISMATCH);
});

test('rejects gift from participant who is not GOING', () => {
  const going = ['player-a', 'player-b'];
  const gifts = giftsForSubmitters(['player-a', 'removed-player']);
  const result = validateGameStartGiftAssignment({ goingParticipantIds: going, gifts });
  assert.equal(result.valid, false);
  assert.equal(result.code, GAME_START_ERROR_CODES.GIFT_PLAYER_COUNT_MISMATCH);
});

test('allows bots when each bot participant id matches gift submitterId', () => {
  const botOne = 'bot_party123_1_0_x7k9m';
  const botTwo = 'bot_party123_2_1_p4q8r';
  const going = [botOne, botTwo];
  const gifts = giftsForSubmitters([botOne, botTwo]);
  const result = validateGameStartGiftAssignment({ goingParticipantIds: going, gifts });
  assert.equal(result.valid, true);
});