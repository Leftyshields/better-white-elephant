import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clientSafeSocketGameErrorMessage,
  SOCKET_GAME_STATE_LOAD_FAILED_MESSAGE,
  SOCKET_GAME_STATE_LOADING_MESSAGE,
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

test('unknown technical errors map to gameStateLoading copy', () => {
  assert.equal(
    clientSafeSocketGameErrorMessage('Duplicate ownership detected after steal'),
    SOCKET_GAME_STATE_LOADING_MESSAGE,
  );
});

test('known user copy passes through unchanged', () => {
  const userCopy = 'You can only open a gift on your own turn while the game is running.';
  assert.equal(clientSafeSocketGameErrorMessage(userCopy), userCopy);
});