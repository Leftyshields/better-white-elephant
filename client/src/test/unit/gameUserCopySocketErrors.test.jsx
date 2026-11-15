import { describe, expect, it } from 'vitest';
import { GAME_USER_COPY } from '../../utils/gameUserCopy.js';

describe('gameUserCopy socket game errors', () => {
  it('exposes copywriter-approved stale-move message', () => {
    expect(GAME_USER_COPY.gameStateStaleMove).toBe(
      "That move didn't go through because the game just changed. Check the board and try again.",
    );
  });

  it('exposes copywriter-approved load-failed message', () => {
    expect(GAME_USER_COPY.gameStateLoadFailed).toBe(
      "We couldn't load the latest game. Refresh the page and try again.",
    );
  });

  it('keeps gameStateLoading for genuine load messaging', () => {
    expect(GAME_USER_COPY.gameStateLoading).toBe(
      "We're still loading the game. Refresh if this doesn't clear.",
    );
  });

  it('exposes generic action-failed fallback', () => {
    expect(GAME_USER_COPY.actionFailedGeneric).toBe("That didn't work. Try again in a moment.");
  });

  it('exposes mapped raw-server copy strings', () => {
    expect(GAME_USER_COPY.stealBackSameTurn).toBe(
      "You can't steal back a gift right after it was taken from you. Pick a different one.",
    );
    expect(GAME_USER_COPY.cannotOpenGift).toBe("You can't open that gift right now.");
    expect(GAME_USER_COPY.cannotStealGift).toBe("You can't steal that gift right now.");
    expect(GAME_USER_COPY.gameInactive).toBe("The game hasn't started, or it has already ended.");
    expect(GAME_USER_COPY.notYourTurn).toBe("It's not your turn yet.");
    expect(GAME_USER_COPY.giftNotInWrappedPile).toBe(
      "That gift isn't available to open. Pick a wrapped gift.",
    );
  });
});