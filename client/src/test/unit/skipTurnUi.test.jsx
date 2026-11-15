import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { canPlayerSkipTurn } from '../../utils/skipTurnEligibility.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const gameRoomSource = readFileSync(join(root, 'pages/GameRoom.jsx'), 'utf8');
const gameBoardSource = readFileSync(join(root, 'components/GameBoard.jsx'), 'utf8');

describe('Skip turn UI (issues #39 / #40)', () => {
  it('hides skip when the active player has no gift and is not in victim deadlock', () => {
    const canSkip = canPlayerSkipTurn({
      gifts: {
        w1: { isWrapped: true, ownerId: null },
        u1: { isWrapped: false, ownerId: 'other', isFrozen: false, lastOwnerId: null },
      },
      gameState: {
        config: { returnToStart: false },
        turnOrder: ['me', 'other'],
        currentVictim: null,
      },
      currentTurnIndex: 0,
      turnQueue: ['me', 'other', 'me'],
      userId: 'me',
      activePlayerId: 'me',
    });
    expect(canSkip).toBe(false);
  });

  it('allows skip when the player holds a gift', () => {
    expect(
      canPlayerSkipTurn({
        gifts: {
          u1: { isWrapped: false, ownerId: 'me', isFrozen: false, lastOwnerId: null },
        },
        gameState: { config: { returnToStart: false }, turnOrder: ['me', 'other'] },
        currentTurnIndex: 0,
        turnQueue: ['me', 'other'],
        userId: 'me',
        activePlayerId: 'me',
      }),
    ).toBe(true);
  });

  it('GameRoom gates the skip button on canSkipTurn and does not offer End Turn', () => {
    expect(gameRoomSource).toContain('derived.canSkipTurn');
    expect(gameRoomSource).not.toContain('End Turn');
    expect(gameRoomSource).toContain('Skip Turn');
  });

  it('GameBoard gates the skip button on canSkipTurn and does not offer End Turn', () => {
    expect(gameBoardSource).toMatch(/canSkipTurn/);
    expect(gameBoardSource).not.toContain('End Turn');
    expect(gameBoardSource).toContain('Skip Turn');
  });
});