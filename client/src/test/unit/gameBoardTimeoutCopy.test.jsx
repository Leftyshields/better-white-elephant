import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const gameBoardSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../components/GameBoard.jsx'),
  'utf8',
);

describe('GameBoard timeout card copy', () => {
  it('uses approved error title and body when game state times out', () => {
    expect(gameBoardSource).toContain("Couldn&apos;t load the game");
    expect(gameBoardSource).toContain('Refresh the page and try again.');
    expect(gameBoardSource).not.toContain('Still loading');
  });
});
