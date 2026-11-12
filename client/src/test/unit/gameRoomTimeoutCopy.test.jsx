import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const gameRoomSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../pages/GameRoom.jsx'),
  'utf8',
);

describe('GameRoom timeout card copy (live path, H5)', () => {
  it('uses approved error title and body when the active game does not load', () => {
    expect(gameRoomSource).toContain("Couldn&apos;t load the game");
    expect(gameRoomSource).toContain('Refresh the page and try again.');
    expect(gameRoomSource).toContain('gameLoadTimedOut');
    expect(gameRoomSource).not.toMatch(/Still loading/i);
  });
});
