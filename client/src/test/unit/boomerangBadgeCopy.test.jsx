import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const gameBoardSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../components/GameBoard.jsx'),
  'utf8',
);

describe('Boomerang badge copy', () => {
  it('uses a short badge and separate explanation text', () => {
    expect(gameBoardSource).toContain('Boomerang is on');
    expect(gameBoardSource).toContain('You can swap even if you already have a gift.');
    expect(gameBoardSource).not.toMatch(/Boomerang is on: you can swap/i);
  });
});
