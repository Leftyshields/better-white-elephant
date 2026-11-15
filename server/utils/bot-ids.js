/**
 * Bot player identity helpers (no bot-utils dependency).
 */
export function isBot(userId) {
  return typeof userId === 'string' && userId.startsWith('bot_');
}