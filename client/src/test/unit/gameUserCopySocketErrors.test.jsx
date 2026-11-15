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

  it('keeps gameStateLoading for other cases', () => {
    expect(GAME_USER_COPY.gameStateLoading).toBe(
      "We're still loading the game. Refresh if this doesn't clear.",
    );
  });
});