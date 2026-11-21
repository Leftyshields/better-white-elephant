import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { areAllGiftsFrozenWithNoLegalAction } from '../../utils/allGiftsFrozen.js';
import { GAME_USER_COPY } from '../../utils/gameUserCopy.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const gameRoomSource = readFileSync(join(root, 'pages/GameRoom.jsx'), 'utf8');
const gameBoardSource = readFileSync(join(root, 'components/GameBoard.jsx'), 'utf8');

/** The GameRoom predicate on main (ce0ecab). Kept here to document the BUG-12 regression. */
function mainAllGiftsFrozenPredicate(gifts) {
  return Object.values(gifts).filter((g) => !g.isWrapped).every((g) => g.isFrozen);
}

const startOfGame = {
  w1: { isWrapped: true, isFrozen: false },
  w2: { isWrapped: true, isFrozen: false },
  w3: { isWrapped: true, isFrozen: false },
};

const midGameFrozenPlusWrapped = {
  u1: { isWrapped: false, isFrozen: true },
  w1: { isWrapped: true, isFrozen: false },
};

const trulyAllFrozen = {
  u1: { isWrapped: false, isFrozen: true },
  u2: { isWrapped: false, isFrozen: true },
};

describe('areAllGiftsFrozenWithNoLegalAction (G1 / BUG-12)', () => {
  it('is false at the start of the game, when nothing has been unwrapped', () => {
    expect(areAllGiftsFrozenWithNoLegalAction(startOfGame)).toBe(false);
  });

  it('is false mid-game when unwrapped gifts are frozen but wrapped gifts remain', () => {
    expect(areAllGiftsFrozenWithNoLegalAction(midGameFrozenPlusWrapped)).toBe(false);
  });

  it('is true only when no wrapped gifts remain and every unwrapped gift is frozen', () => {
    expect(areAllGiftsFrozenWithNoLegalAction(trulyAllFrozen)).toBe(true);
  });

  it('is false when unwrapped gifts remain that can still be stolen', () => {
    expect(
      areAllGiftsFrozenWithNoLegalAction({
        u1: { isWrapped: false, isFrozen: true },
        u2: { isWrapped: false, isFrozen: false },
      }),
    ).toBe(false);
  });

  it('is false for an empty gift set', () => {
    expect(areAllGiftsFrozenWithNoLegalAction({})).toBe(false);
  });
});

describe('main predicate regression (fails on ce0ecab GameRoom logic)', () => {
  it('start of game: main [].every() is true, the fix is false', () => {
    expect(mainAllGiftsFrozenPredicate(startOfGame)).toBe(true);
    expect(areAllGiftsFrozenWithNoLegalAction(startOfGame)).toBe(false);
  });

  it('mid-game frozen plus wrapped: main is true, the fix is false', () => {
    expect(mainAllGiftsFrozenPredicate(midGameFrozenPlusWrapped)).toBe(true);
    expect(areAllGiftsFrozenWithNoLegalAction(midGameFrozenPlusWrapped)).toBe(false);
  });

  it('truly all frozen: main and the fix agree', () => {
    expect(mainAllGiftsFrozenPredicate(trulyAllFrozen)).toBe(true);
    expect(areAllGiftsFrozenWithNoLegalAction(trulyAllFrozen)).toBe(true);
  });
});

describe('GameRoom and GameBoard use the helper and signed copy', () => {
  it('GameRoom calls the helper and renders GAME_USER_COPY.waitingForHostEnd', () => {
    expect(gameRoomSource).toContain('areAllGiftsFrozenWithNoLegalAction');
    expect(gameRoomSource).toContain('GAME_USER_COPY.waitingForHostEnd');
    expect(gameRoomSource).not.toContain(".filter(g => !g.isWrapped).every(g => g.isFrozen)");
    expect(gameRoomSource).not.toContain('All gifts are frozen! Waiting for the host to end the game.');
  });

  it('GameBoard calls the helper and renders GAME_USER_COPY.waitingForHostEnd', () => {
    expect(gameBoardSource).toContain('areAllGiftsFrozenWithNoLegalAction');
    expect(gameBoardSource).toContain('GAME_USER_COPY.waitingForHostEnd');
  });

  it('does not change the waiting-for-host copy', () => {
    expect(GAME_USER_COPY.waitingForHostEnd).toBe(
      '🎉 All gifts are frozen! Waiting for the host to end the game.',
    );
  });
});
