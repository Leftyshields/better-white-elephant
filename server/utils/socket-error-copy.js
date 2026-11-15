/**
 * User-facing socket error text (must match client/src/utils/gameUserCopy.js literals).
 */
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

/** Known gameplay validation copy (must stay in sync with pick-gift-guards.js and end-turn-guards.js). */
const CLIENT_SAFE_USER_MESSAGES = new Set([
  'You can only open a gift on your own turn while the game is running.',
  "That gift isn't available to open. Pick a wrapped gift.",
  "You already have a gift, so you can't open another one. Steal one instead, or skip your turn.",
  "That gift is already open, so you can't open it again.",
  "We couldn't find this game. Refresh the page and try again.",
  "This game is over, so there's no turn to skip.",
  'You can only skip on your own turn while the game is running.',
  'Cannot steal back a gift immediately after losing it on the same turn',
  "You already have a gift, so you can't open another one. Steal one instead, or skip your turn.",
  'Cannot pick gift: invalid action',
  'Cannot steal gift: invalid action',
  "The game hasn't started, or it has already ended.",
  'Game is not active',
  'Not your turn',
  'Gift not found in wrapped pile',
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