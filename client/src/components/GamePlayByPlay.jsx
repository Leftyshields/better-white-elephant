/**
 * Game Play-By-Play Component
 * Shows detailed real-time narrative of game state transitions and actions
 * Uses GameTicker component for activity display.
 *
 * Desktop (lg and up): always-open column with the "Live Feed" header.
 * Phones and tablets (below lg, BUG-19): one collapsed 44px row after the gifts showing the newest
 * line; tapping it expands the feed inline (pushes content down, never overlays). The open or
 * closed choice is remembered for this game in sessionStorage.
 */
import { useId, useState } from 'react';
import { GameTicker, latestActivityLine } from './GameTicker.jsx';
import { ChatBubbleLeftEllipsisIcon, ChevronDownIcon } from '@heroicons/react/24/outline';

const LIVE_FEED_LABEL = 'Live Feed';
const LIVE_FEED_LATEST_PREFIX = 'Latest:';
const LIVE_FEED_EMPTY = 'Game activity will appear here...';

function readFeedOpen(storageKey) {
  try {
    return window.sessionStorage.getItem(storageKey) === 'open';
  } catch {
    return false;
  }
}

export function GamePlayByPlay({ state, userNames, partyId }) {
  const listId = useId();
  const storageKey = `sor-live-feed:${partyId || 'game'}`;
  const [isOpen, setIsOpen] = useState(() => readFeedOpen(storageKey));

  // Always render when status is PLAYING, even if no entries yet
  if (!state || state.status === 'LOBBY') {
    return null;
  }

  // Convert gifts object to array for GameTicker
  const giftsArray = state.gifts ? Object.values(state.gifts) : [];
  const hasActivity = Boolean(state.activities && state.activities.length > 0);
  const latestLine = hasActivity ? latestActivityLine(state.activities, giftsArray, userNames) : null;

  const toggle = () => {
    const next = !isOpen;
    setIsOpen(next);
    try {
      window.sessionStorage.setItem(storageKey, next ? 'open' : 'closed');
    } catch {
      // Private mode or storage full: the toggle still works for this page view.
    }
  };

  return (
    <div className="flex flex-col lg:h-full bg-slate-900/40 rounded-xl border border-white/5" data-component="game-play-by-play">
      {/* Desktop header */}
      <div className="hidden lg:block p-4 border-b border-white/5 font-bold text-slate-300">
        {LIVE_FEED_LABEL}
      </div>

      {/* Phone row: the whole row is the toggle once there is activity */}
      {hasActivity ? (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={isOpen}
          aria-controls={listId}
          className="lg:hidden flex items-center gap-3 w-full min-h-11 px-4 py-2 text-left rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          data-testid="live-feed-toggle"
        >
          <span className="font-bold text-slate-300 text-sm flex-shrink-0">{LIVE_FEED_LABEL}</span>
          <span className="flex-1 min-w-0 truncate text-sm text-slate-400">
            {latestLine ? `${LIVE_FEED_LATEST_PREFIX} ${latestLine}` : ''}
          </span>
          <ChevronDownIcon
            aria-hidden="true"
            className={`w-5 h-5 text-slate-400 flex-shrink-0 motion-safe:transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>
      ) : (
        <div className="lg:hidden flex items-center gap-3 min-h-11 px-4 py-2" data-testid="live-feed-empty-row">
          <span className="font-bold text-slate-300 text-sm flex-shrink-0">{LIVE_FEED_LABEL}</span>
          <span className="flex-1 min-w-0 truncate text-sm text-slate-500">{LIVE_FEED_EMPTY}</span>
        </div>
      )}

      {/* Feed list: inline on phones when open, always shown on desktop */}
      <div
        id={listId}
        className={`${hasActivity && isOpen ? 'block' : 'hidden'} lg:block lg:flex-1 lg:overflow-y-auto p-4 pt-0 lg:pt-4`}
      >
        {hasActivity ? (
          <GameTicker
            activities={state.activities}
            gifts={giftsArray}
            userNames={userNames}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-48 text-center px-6">
            <ChatBubbleLeftEllipsisIcon className="w-12 h-12 text-slate-700 mb-3" />
            <p className="text-slate-500 font-medium">
              {LIVE_FEED_EMPTY}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
