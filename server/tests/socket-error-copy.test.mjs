import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clientSafeSocketGameErrorMessage,
  SOCKET_ACTION_FAILED_GENERIC_MESSAGE,
  SOCKET_APPROVED_TOAST_MESSAGES,
  SOCKET_GAME_STATE_LOAD_FAILED_MESSAGE,
  SOCKET_GAME_STATE_STALE_MOVE_MESSAGE,
} from '../utils/socket-error-copy.js';

test('state version conflict maps to stale-move copy', () => {
  assert.equal(
    clientSafeSocketGameErrorMessage('Game state conflict; please retry', 'GAME_STATE_CONFLICT'),
    SOCKET_GAME_STATE_STALE_MOVE_MESSAGE,
  );
  assert.equal(
    clientSafeSocketGameErrorMessage('Game state conflict; please retry'),
    SOCKET_GAME_STATE_STALE_MOVE_MESSAGE,
  );
});

test('corrupted or empty mutation state maps to load-failed copy', () => {
  assert.equal(clientSafeSocketGameErrorMessage('Corrupted game state'), SOCKET_GAME_STATE_LOAD_FAILED_MESSAGE);
  assert.equal(
    clientSafeSocketGameErrorMessage('Mutation did not return game state'),
    SOCKET_GAME_STATE_LOAD_FAILED_MESSAGE,
  );
});

test('unknown errors map to generic action-failed copy', () => {
  assert.equal(
    clientSafeSocketGameErrorMessage('Duplicate ownership detected after steal'),
    SOCKET_ACTION_FAILED_GENERIC_MESSAGE,
  );
  assert.equal(clientSafeSocketGameErrorMessage('persist failed'), SOCKET_ACTION_FAILED_GENERIC_MESSAGE);
});

test('raw server strings map to player-facing copy', () => {
  assert.equal(
    clientSafeSocketGameErrorMessage(
      'Cannot steal back a gift immediately after losing it on the same turn',
    ),
    "You can't steal back a gift right after it was taken from you. Pick a different one.",
  );
  assert.equal(
    clientSafeSocketGameErrorMessage('Cannot pick gift: invalid action'),
    "You can't open that gift right now.",
  );
  assert.equal(
    clientSafeSocketGameErrorMessage('Cannot steal gift: invalid action'),
    "You can't steal that gift right now.",
  );
  assert.equal(
    clientSafeSocketGameErrorMessage('Game is not active'),
    "The game hasn't started, or it has already ended.",
  );
  assert.equal(clientSafeSocketGameErrorMessage('Not your turn'), "It's not your turn yet.");
  assert.equal(
    clientSafeSocketGameErrorMessage('Gift not found in wrapped pile'),
    "That gift isn't available to open. Pick a wrapped gift.",
  );
});

test('known user copy passes through unchanged', () => {
  const userCopy = 'You can only open a gift on your own turn while the game is running.';
  assert.equal(clientSafeSocketGameErrorMessage(userCopy), userCopy);
});

test('every approved toast line passes through unchanged from shared list', () => {
  for (const line of SOCKET_APPROVED_TOAST_MESSAGES) {
    assert.equal(clientSafeSocketGameErrorMessage(line), line);
  }
});