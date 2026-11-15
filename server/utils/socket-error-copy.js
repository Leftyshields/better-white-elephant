/**
 * User-facing socket error text (must match client/src/utils/gameUserCopy.js literals).
 */
export const SOCKET_GAME_STATE_LOADING_MESSAGE =
  "We're still loading the game. Refresh if this doesn't clear.";

export const SOCKET_GAME_STATE_STALE_MOVE_MESSAGE =
  "That move didn't go through because the game just changed. Check the board and try again.";

export const SOCKET_GAME_STATE_LOAD_FAILED_MESSAGE =
  "We couldn't load the latest game. Refresh the page and try again.";

export const SOCKET_ACTION_FAILED_GENERIC_MESSAGE = "That didn't work. Try again in a moment.";

/** @deprecated Use SOCKET_GAME_STATE_LOADING_MESSAGE */
export const SOCKET_GAME_STATE_RETRY_MESSAGE = SOCKET_GAME_STATE_LOADING_MESSAGE;

const GAME_STATE_CONFLICT_MESSAGES = new Set(['Game state conflict; please retry']);

const GAME_STATE_LOAD_FAILED_MESSAGES = new Set([
  'Corrupted game state',
  'Mutation did not return game state',
]);

/**
 * Raw server/engine strings → copywriter-approved player copy
 * (must stay in sync with client/src/utils/gameUserCopy.js).
 */
const RAW_SERVER_MESSAGE_COPY = new Map([
  [
    'Cannot steal back a gift immediately after losing it on the same turn',
    "You can't steal back a gift right after it was taken from you. Pick a different one.",
  ],
  ['Cannot pick gift: invalid action', "You can't open that gift right now."],
  ['Cannot steal gift: invalid action', "You can't steal that gift right now."],
  ['Game is not active', "The game hasn't started, or it has already ended."],
  ['Not your turn', "It's not your turn yet."],
  ['Gift not found in wrapped pile', "That gift isn't available to open. Pick a wrapped gift."],
]);

/** Already player-facing; pass through unchanged. */
const CLIENT_SAFE_USER_MESSAGES = new Set([
  'You can only open a gift on your own turn while the game is running.',
  "That gift isn't available to open. Pick a wrapped gift.",
  "You already have a gift, so you can't open another one. Steal one instead, or skip your turn.",
  "That gift is already open, so you can't open it again.",
  "We couldn't find this game. Refresh the page and try again.",
  "This game is over, so there's no turn to skip.",
  'You can only skip on your own turn while the game is running.',
  "The game hasn't started, or it has already ended.",
  SOCKET_GAME_STATE_LOADING_MESSAGE,
  SOCKET_GAME_STATE_STALE_MOVE_MESSAGE,
  SOCKET_GAME_STATE_LOAD_FAILED_MESSAGE,
  SOCKET_ACTION_FAILED_GENERIC_MESSAGE,
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
  if (RAW_SERVER_MESSAGE_COPY.has(message)) {
    return RAW_SERVER_MESSAGE_COPY.get(message);
  }
  if (CLIENT_SAFE_USER_MESSAGES.has(message)) {
    return message;
  }
  return SOCKET_ACTION_FAILED_GENERIC_MESSAGE;
}