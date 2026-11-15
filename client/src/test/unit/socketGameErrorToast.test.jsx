import { describe, expect, it } from 'vitest';
import { GAME_USER_COPY } from '../../utils/gameUserCopy.js';
import { planSocketGameErrorHandling } from '../../utils/socketGameErrorToast.js';

const actingPlayer = { hasPendingPlayerAction: true };
const observingPlayer = { hasPendingPlayerAction: false };

const BASE = {
  lastToastMessage: null,
  lastToastAtMs: null,
  nowMs: 1_700_000_000_000,
  dedupeMs: 3000,
};

describe('player action validation toasts', () => {
  it.each([
    ['Cannot steal gift: invalid action', GAME_USER_COPY.cannotStealGift],
    ['Cannot pick gift: invalid action', GAME_USER_COPY.cannotOpenGift],
    [
      'Cannot steal back a gift immediately after losing it on the same turn',
      GAME_USER_COPY.stealBackSameTurn,
    ],
  ])('shows toast to acting player for raw %s', (rawMessage, expectedCopy) => {
    const plan = planSocketGameErrorHandling({
      ...BASE,
      ...actingPlayer,
      message: rawMessage,
    });
    expect(plan.showToast).toBe(true);
    expect(plan.toastMessage).toBe(expectedCopy);
    expect(plan.consoleLevel).toBe('none');
  });

  it.each([
    ['Cannot steal gift: invalid action', GAME_USER_COPY.cannotStealGift],
    ['Cannot pick gift: invalid action', GAME_USER_COPY.cannotOpenGift],
    [
      'Cannot steal back a gift immediately after losing it on the same turn',
      GAME_USER_COPY.stealBackSameTurn,
    ],
  ])('does not show toast to non-acting player for %s', (rawMessage, expectedCopy) => {
    const plan = planSocketGameErrorHandling({
      ...BASE,
      ...observingPlayer,
      message: rawMessage,
    });
    expect(plan.showToast).toBe(false);
    expect(plan.safePlayerCopy).toBe(expectedCopy);
    expect(plan.consoleLevel).toBe('none');
    expect(plan.trackAnalytics).toBe(false);
  });
});

describe('socket toast dedupe', () => {
  it('suppresses repeating the same validation toast within the dedupe window', () => {
    const first = planSocketGameErrorHandling({
      ...BASE,
      ...actingPlayer,
      message: 'Cannot pick gift: invalid action',
    });
    expect(first.showToast).toBe(true);

    const second = planSocketGameErrorHandling({
      ...BASE,
      ...actingPlayer,
      message: 'Cannot pick gift: invalid action',
      lastToastMessage: GAME_USER_COPY.cannotOpenGift,
      lastToastAtMs: BASE.nowMs,
      nowMs: BASE.nowMs + 1500,
    });
    expect(second.showToast).toBe(false);
    expect(second.consoleLevel).toBe('none');
  });

  it('allows the same validation toast again after the dedupe window', () => {
    const plan = planSocketGameErrorHandling({
      ...BASE,
      ...actingPlayer,
      message: 'Cannot steal gift: invalid action',
      lastToastMessage: GAME_USER_COPY.cannotStealGift,
      lastToastAtMs: BASE.nowMs,
      nowMs: BASE.nowMs + 3000,
    });
    expect(plan.showToast).toBe(true);
    expect(plan.toastMessage).toBe(GAME_USER_COPY.cannotStealGift);
  });
});