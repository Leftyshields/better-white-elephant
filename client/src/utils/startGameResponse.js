/** Shown when start-game API fails without a server error message. */
export const START_GAME_GENERIC_ERROR = "We couldn't start the game. Try again in a moment.";

/**
 * Normalize start-game API responses for user-visible errors.
 * HTTP 4xx responses do not include `success: false`, so callers must check `response.ok`.
 */
export function getStartGameFailureMessage(response, data) {
  if (response?.ok) {
    return null;
  }
  const payload = data && typeof data === 'object' ? data : {};
  return payload.error || payload.message || START_GAME_GENERIC_ERROR;
}