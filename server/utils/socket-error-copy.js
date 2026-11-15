/**
 * User-facing socket error text (must match client/src/utils/gameUserCopy.js literals).
 */
import {
  PICK_GIFT_ALREADY_HOLDING,
  PICK_GIFT_ALREADY_OPEN,
  PICK_GIFT_NOT_IN_WRAPPED_PILE,
  PICK_GIFT_NOT_ON_TURN,
} from './pick-gift-guards.js';
import {
  END_TURN_GAME_ALREADY_ENDED,
  END_TURN_GAME_NOT_FOUND,
  END_TURN_SOCKET_ERROR,
} from './end-turn-guards.js';

export const SOCKET_GAME_STATE_LOADING_MESSAGE =
  "We're still loading the game. Refresh if this doesn't clear.";

export const SOCKET_GAME_STATE_STALE_MOVE_MESSAGE =
  "That move didn't go through because the game just changed. Check the board and try again.";

export const SOCKET_GAME_STATE_LOAD_FAILED_MESSAGE =
  "We couldn't load the latest game. Refresh the page and try again.";

/** @deprecated Use SOCKET_GAME_STATE_LOADING_MESSAGE */
export const SOCKET_GAME_STATE_RETRY_MESSAGE = SOCKET_GAME_STATE_LOADING_MESSAGE;

const GAME_STATE_CONFLICT_MESSAGES = new Set(['Game state conflict; please retry']);

const GAME_STATE_LOAD_FAILED_MESSAGES = new Set([
  'Corrupted game state',
  'Mutation did not return game state',
]);

const CLIENT_SAFE_USER_MESSAGES = new Set([
  PICK_GIFT_NOT_ON_TURN,
  PICK_GIFT_NOT_IN_WRAPPED_PILE,
  PICK_GIFT_ALREADY_HOLDING,
  PICK_GIFT_ALREADY_OPEN,
  END_TURN_GAME_NOT_FOUND,
  END_TURN_GAME_ALREADY_ENDED,
  END_TURN_SOCKET_ERROR,
  'Cannot steal back a gift immediately after losing it on the same turn',
  "You already have a gift, so you can't open another one. Steal one instead, or skip your turn.",
  'Cannot pick gift: invalid action',
  'Cannot steal gift: invalid action',
  "The game hasn't started, or it has already ended.",
  'Game is not active',
  'Not your turn',
  'Gift not found in wrapped pile',
  "That gift is already open, so you can't open it again.",
]);

/**
 * @param {string} message
 * @param {string} [code]
 */
export function clientSafeSocketGameErrorMessage(message, code) {
  if (code === 'GAME_STATE_CONFLICT' || GAME_STATE_CONFLICT_MESSAGES.has(message)) {
    return SOCKET_GAME_STATE_STALE_MOVE_MESSAGE;
  }
  if (GAME_STATE_LOAD_FAILED_MESSAGES.has(message)) {
    return SOCKET_GAME_STATE_LOAD_FAILED_MESSAGE;
  }
  if (CLIENT_SAFE_USER_MESSAGES.has(message)) {
    return message;
  }
  return SOCKET_GAME_STATE_LOADING_MESSAGE;
}