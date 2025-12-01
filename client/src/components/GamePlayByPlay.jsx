/**
 * Game Play-By-Play Component
 * Shows detailed real-time narrative of game state transitions and actions
 * Uses GameTicker component for activity display
 */
import { GameTicker } from './GameTicker.jsx';
import { ChatBubbleLeftEllipsisIcon } from '@heroicons/react/24/outline';

export function GamePlayByPlay({ state, userNames, userEmails }) {
  // Always render when status is PLAYING, even if no entries yet
  if (!state) {
    return null;
  }

  if (state.status === 'LOBBY') {
    return null;
  }

  // Convert gifts object to array for GameTicker
  const giftsArray = state.gifts ? Object.values(state.gifts) : [];

  return (
    <div className="flex flex-col h-full bg-slate-900/40 rounded-xl border border-white/5" data-component="game-play-by-play">
      {/* Sticky Title Header */}
      <div className="p-4 border-b border-white/5 font-bold text-slate-300">
        Live Feed ⚡️
      </div>

      {/* Scrolling Content Area */}
      <div className="flex-1 overflow-y-auto p-4">
        {state.activities && state.activities.length > 0 ? (
          <GameTicker
            activities={state.activities}
            gifts={giftsArray}
            userNames={userNames}
            userEmails={userEmails}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-48 text-center px-6">
            <ChatBubbleLeftEllipsisIcon className="w-12 h-12 text-slate-700 mb-3" />
            <p className="text-slate-500 font-medium">
              Game activity will appear here...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
