import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const gameRoomSource = readFileSync(join(root, 'pages/GameRoom.jsx'), 'utf8');
const gameBoardSource = readFileSync(join(root, 'components/GameBoard.jsx'), 'utf8');

function badgeShowsBoomerangCopy(source) {
  return source.includes('Boomerang round') && source.includes('Boomerang is on');
}

describe('Boomerang phase honesty (live UI)', () => {
  it('keeps signed boomerang badge strings in GameRoom and GameBoard', () => {
    expect(badgeShowsBoomerangCopy(gameRoomSource)).toBe(true);
    expect(badgeShowsBoomerangCopy(gameBoardSource)).toBe(true);
    expect(gameRoomSource).toContain('You can swap even if you already have a gift.');
    expect(gameBoardSource).toContain('You can swap even if you already have a gift.');
  });

  it('does not show the boomerang badge when only server isBoomerangPhase is true (GameRoom)', () => {
    expect(gameRoomSource).not.toMatch(
      /returnToStart\s*\|\|\s*state\.gameState\?\.isBoomerangPhase/,
    );
    expect(gameRoomSource).toContain('returnToStartEnabled &&');
  });

  it('does not show the boomerang badge when only server isBoomerangPhase is true (GameBoard)', () => {
    expect(gameBoardSource).not.toMatch(
      /returnToStart\s*\|\|\s*gameState\.isBoomerangPhase/,
    );
    expect(gameBoardSource).toMatch(/\{returnToStart &&/);
  });
});
