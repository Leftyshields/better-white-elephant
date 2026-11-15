import test from 'node:test';
import assert from 'node:assert/strict';
import { clientSafeSocketGameErrorMessage, SOCKET_GAME_STATE_RETRY_MESSAGE } from '../utils/socket-error-copy.js';

test('technical game errors map to existing retry copy', () => {
  assert.equal(
    clientSafeSocketGameErrorMessage('Game state conflict; please retry', 'GAME_STATE_CONFLICT'),
    SOCKET_GAME_STATE_RETRY_MESSAGE,
  );
  assert.equal(clientSafeSocketGameErrorMessage('Corrupted game state'), SOCKET_GAME_STATE_RETRY_MESSAGE);
  assert.equal(clientSafeSocketGameErrorMessage('Mutation did not return game state'), SOCKET_GAME_STATE_RETRY_MESSAGE);
});

test('known user copy passes through unchanged', () => {
  const userCopy = 'You can only open a gift on your own turn while the game is running.';
  assert.equal(clientSafeSocketGameErrorMessage(userCopy), userCopy);
});