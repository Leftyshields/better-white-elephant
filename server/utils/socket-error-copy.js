/**
 * User-facing socket error text (must match client/src/utils/gameUserCopy.js literals).
 */
export const SOCKET_GAME_STATE_RETRY_MESSAGE =
  "We're still loading the game. Refresh if this doesn't clear.";

const INTERNAL_TECHNICAL_MESSAGES = new Set([
  'Game state conflict; please retry',
  'Corrupted game state',
  'Mutation did not return game state',
]);

/**
 * @param {string} message
 * @param {string} [code]
 */
export function clientSafeSocketGameErrorMessage(message, code) {
  if (code === 'GAME_STATE_CONFLICT' || INTERNAL_TECHNICAL_MESSAGES.has(message)) {
    return SOCKET_GAME_STATE_RETRY_MESSAGE;
  }
  return message;
}