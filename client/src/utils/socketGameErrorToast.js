import { GAME_USER_COPY } from './gameUserCopy.js';
import { formatSocketErrorForToast } from '../../../server/shared/socket-error-copy.mjs';

export const PLAYER_ACTION_VALIDATION_TOAST_MESSAGES = new Set([
  GAME_USER_COPY.cannotStealGift,
  GAME_USER_COPY.cannotOpenGift,
  GAME_USER_COPY.stealBackSameTurn,
]);

export const PLAYER_ACTION_VALIDATION_RAW_MESSAGES = [
  'Cannot steal gift: invalid action',
  'Cannot pick gift: invalid action',
  'Cannot steal back a gift immediately after losing it on the same turn',
];

export const DEFAULT_SOCKET_TOAST_DEDUPE_MS = 3000;

export function isPlayerActionValidationToast(safePlayerCopy) {
  return PLAYER_ACTION_VALIDATION_TOAST_MESSAGES.has(safePlayerCopy);
}

/** Silent for automatic/background conditions, not the three player validation toasts. */
export function isBackgroundExpectedSilentSocketError(message) {
  return (
    message?.includes('No stealable gifts available') || message?.includes('already acted this turn')
  );
}

export function shouldDedupeSocketToast(message, lastToastMessage, lastToastAtMs, nowMs, dedupeMs) {
  if (!message || !lastToastMessage || lastToastAtMs == null) {
    return false;
  }
  if (message !== lastToastMessage) {
    return false;
  }
  return nowMs - lastToastAtMs < dedupeMs;
}

/**
 * @param {object} input
 * @param {string | null | undefined} input.message
 * @param {string | undefined} input.code
 * @param {boolean} input.hasPendingPlayerAction
 * @param {string | null | undefined} input.lastToastMessage
 * @param {number | null | undefined} input.lastToastAtMs
 * @param {number} [input.nowMs]
 * @param {number} [input.dedupeMs]
 */
export function planSocketGameErrorHandling({
  message,
  code,
  hasPendingPlayerAction,
  lastToastMessage,
  lastToastAtMs,
  nowMs = Date.now(),
  dedupeMs = DEFAULT_SOCKET_TOAST_DEDUPE_MS,
}) {
  const safePlayerCopy = formatSocketErrorForToast(message, code);
  const dedupe = shouldDedupeSocketToast(
    safePlayerCopy,
    lastToastMessage,
    lastToastAtMs,
    nowMs,
    dedupeMs,
  );

  if (isBackgroundExpectedSilentSocketError(message)) {
    return {
      safePlayerCopy,
      showToast: false,
      toastMessage: null,
      consoleLevel: 'log',
      trackAnalytics: true,
      rollbackOptimistic: true,
    };
  }

  if (isPlayerActionValidationToast(safePlayerCopy)) {
    if (!hasPendingPlayerAction) {
      return {
        safePlayerCopy,
        showToast: false,
        toastMessage: null,
        consoleLevel: 'none',
        trackAnalytics: false,
        rollbackOptimistic: true,
      };
    }
    if (dedupe) {
      return {
        safePlayerCopy,
        showToast: false,
        toastMessage: null,
        consoleLevel: 'none',
        trackAnalytics: true,
        rollbackOptimistic: true,
      };
    }
    return {
      safePlayerCopy,
      showToast: true,
      toastMessage: safePlayerCopy,
      consoleLevel: 'none',
      trackAnalytics: true,
      rollbackOptimistic: true,
    };
  }

  if (dedupe) {
    return {
      safePlayerCopy,
      showToast: false,
      toastMessage: null,
      consoleLevel: 'error',
      trackAnalytics: true,
      rollbackOptimistic: true,
    };
  }

  return {
    safePlayerCopy,
    showToast: true,
    toastMessage: safePlayerCopy,
    consoleLevel: 'error',
    trackAnalytics: true,
    rollbackOptimistic: true,
  };
}