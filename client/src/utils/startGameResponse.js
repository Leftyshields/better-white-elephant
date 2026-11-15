/**
 * Normalize start-game API responses for user-visible errors.
 * HTTP 4xx responses do not include `success: false`, so callers must check `response.ok`.
 */
export function getStartGameFailureMessage(response, data) {
  if (response?.ok) {
    return null;
  }
  const payload = data && typeof data === 'object' ? data : {};
  return (
    payload.error ||
    payload.message ||
    '[PLACEHOLDER] Could not start the game. Please try again in a moment.'
  );
}