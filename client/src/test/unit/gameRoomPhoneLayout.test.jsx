/**
 * BUG-19 (ledger A13) and batch-1 item 1: on phones the Live Feed is a collapsed row after the
 * gifts (never an overlay), Skip only takes space when usable, and one toast region sits above the
 * reaction bar with no "Action Failed" title. Copy is Copywriter's signed batch-1 strings.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { GamePlayByPlay } from '../../components/GamePlayByPlay.jsx';
import { latestActivityLine } from '../../components/GameTicker.jsx';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const gameRoomSource = readFileSync(join(root, 'pages/GameRoom.jsx'), 'utf8');
const tickerSource = readFileSync(join(root, 'components/GameTicker.jsx'), 'utf8');

const gifts = { g1: { id: 'g1', title: 'Candle', isWrapped: false }, g2: { id: 'g2', title: 'Mug', isWrapped: false } };
const userNames = { a: 'Alex', b: 'Bo' };

function playingState(activities) {
  return { status: 'PLAYING', gifts, activities };
}

describe('Live Feed on phones', () => {
  beforeEach(() => window.sessionStorage.clear());

  it('collapsed row shows "Live Feed" and "Latest: " plus the newest line, and toggles inline', () => {
    render(
      <GamePlayByPlay
        partyId="p1"
        userNames={userNames}
        state={playingState([
          { type: 'PICK', playerId: 'a', giftId: 'g1' },
          { type: 'STEAL', playerId: 'b', giftId: 'g1', previousOwnerId: 'a' },
        ])}
      />,
    );
    const toggle = screen.getByTestId('live-feed-toggle');
    expect(toggle.textContent).toContain('Live Feed');
    expect(toggle.textContent).toContain('Latest: Bo stole Candle from Alex');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    const list = document.getElementById(toggle.getAttribute('aria-controls'));
    expect(list.className).toMatch(/(^|\s)hidden(\s|$)/);

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(list.className).not.toMatch(/(^|\s)hidden(\s|$)/);
    expect(window.sessionStorage.getItem('sor-live-feed:p1')).toBe('open');

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('empty feed: a plain row with the empty line, no prefix and nothing to expand', () => {
    render(<GamePlayByPlay partyId="p2" userNames={userNames} state={playingState([])} />);
    expect(screen.queryByTestId('live-feed-toggle')).toBeNull();
    const row = screen.getByTestId('live-feed-empty-row');
    expect(row.textContent).toContain('Game activity will appear here...');
    expect(row.textContent).not.toContain('Latest:');
  });

  it('header has no emoji and the toggle is a 44px target', () => {
    render(
      <GamePlayByPlay
        partyId="p3"
        userNames={userNames}
        state={playingState([{ type: 'PICK', playerId: 'a', giftId: 'g2' }])}
      />,
    );
    expect(document.body.textContent).not.toContain('⚡');
    expect(screen.getByTestId('live-feed-toggle').className).toContain('min-h-11');
    expect(latestActivityLine([{ type: 'PICK', playerId: 'a', giftId: 'g2' }], Object.values(gifts), userNames)).toBe(
      'Alex picked Mug',
    );
  });
});

describe('GameRoom phone layout and toast region (source checks)', () => {
  it('has no fixed-height clipped grid below lg', () => {
    expect(gameRoomSource).not.toContain('h-[calc(100vh-96px)] overflow-hidden');
    expect(gameRoomSource).toContain('flex flex-col lg:grid lg:grid-cols-4 lg:h-[calc(100dvh-96px)] lg:overflow-hidden');
  });

  it('renders the Skip wrapper only when Skip can be used (no empty 44px band)', () => {
    expect(gameRoomSource).not.toContain('mt-4 min-h-11 flex justify-center');
    expect(gameRoomSource).toMatch(/\{derived\.canSkipTurn && \(\s*<div className="mt-4 flex justify-center">/);
  });

  it('toast region sits above the reaction bar, with no title and a 44px "Dismiss" button', () => {
    expect(gameRoomSource).toContain('bottom-[calc(96px+env(safe-area-inset-bottom))]');
    expect(gameRoomSource).not.toContain('Action Failed');
    expect(gameRoomSource).not.toContain('Dismiss error');
    expect(gameRoomSource).toContain('aria-label="Dismiss"');
    expect(gameRoomSource).toContain('min-h-11 min-w-11');
    expect(gameRoomSource).not.toContain('fixed top-4 right-4');
    expect(gameRoomSource).not.toContain('fixed bottom-4 right-4');
  });

  it('keeps the 11px text floor in the feed rows', () => {
    expect(tickerSource).not.toContain('text-[10px]');
  });
});

describe('Gift card text floor', () => {
  it('has no text below 11px', () => {
    const giftCardSource = readFileSync(join(root, 'components/GiftCard.jsx'), 'utf8');
    expect(giftCardSource).not.toMatch(/text-\[(?:[0-9]|10)px\]/);
  });
});
