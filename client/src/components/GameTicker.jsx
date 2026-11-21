/**
 * Game Ticker Component
 * Shows the last 15 game moves in real-time in a compact format
 */
import { useState, useEffect, useRef } from 'react';
import { GAME_USER_COPY } from '../utils/gameUserCopy.js';
import { lookupNameState } from '../utils/seatDisplayName.js';
import { NameLoadingSkeleton, PlayerName } from './PlayerName.jsx';

function nameStateFromProps(playerId, nameStates, userNames) {
  if (nameStates) {
    return lookupNameState(nameStates, playerId, 'pending', GAME_USER_COPY.unnamedPlayer);
  }
  if (userNames && playerId && userNames[playerId] && typeof userNames[playerId] === 'object' && userNames[playerId].status) {
    return userNames[playerId];
  }
  if (userNames && playerId && typeof userNames[playerId] === 'string' && userNames[playerId]) {
    return { status: 'ready', name: userNames[playerId] };
  }
  if (!playerId) {
    return { status: 'failed', name: GAME_USER_COPY.unnamedPlayer };
  }
  return { status: 'loading', name: null };
}

function playerNameFor(playerId, nameStates, userNames) {
  const state = nameStateFromProps(playerId, nameStates, userNames);
  if (state.status === 'loading') return null;
  return state.name || GAME_USER_COPY.unnamedPlayer;
}

function giftNameFor(giftId, gifts) {
  const gift = Array.isArray(gifts) ? gifts.find((g) => g.id === giftId) : null;
  return gift?.title || 'Mystery Gift';
}

/**
 * Plain one-line text for the newest PICK or STEAL, using the same words as the ticker rows.
 * Used by the collapsed Live Feed row on phones. Returns null when there is nothing to show.
 */
export function latestActivityLine(activities, gifts, userNames, nameStates = null) {
  const latest = [...(activities || [])].reverse().find((a) => a.type === 'PICK' || a.type === 'STEAL');
  if (!latest) return null;
  const player = playerNameFor(latest.playerId, nameStates, userNames);
  const from = playerNameFor(latest.previousOwnerId, nameStates, userNames);
  if (player == null || (latest.type === 'STEAL' && from == null)) return null;
  const gift = giftNameFor(latest.giftId, gifts);
  if (latest.type === 'PICK') return `${player} picked ${gift}`;
  return `${player} stole ${gift} from ${from}`;
}

export function latestActivityIsLoading(activities, userNames, nameStates = null) {
  const latest = [...(activities || [])].reverse().find((a) => a.type === 'PICK' || a.type === 'STEAL');
  if (!latest) return false;
  if (nameStateFromProps(latest.playerId, nameStates, userNames).status === 'loading') return true;
  if (latest.type === 'STEAL' && nameStateFromProps(latest.previousOwnerId, nameStates, userNames).status === 'loading') {
    return true;
  }
  return false;
}

export function GameTicker({ activities, gifts, userNames, nameStates = null }) {
  const [animatedItems, setAnimatedItems] = useState(new Set());
  const prevActivitiesRef = useRef([]);

  // Don't render if no activities
  if (!activities || activities.length === 0) {
    // Debug: Log when component doesn't render
    if (process.env.NODE_ENV === 'development') {
      console.log('GameTicker: No activities to display', { activities, activitiesLength: activities?.length });
    }
    return null;
  }

  // Get the last 15 activities (most recent first)
  const recentActivities = activities.slice(-15).reverse();

  // Debug: Log when component renders
  if (process.env.NODE_ENV === 'development') {
    console.log('GameTicker: Rendering', { activitiesCount: activities.length, recentCount: recentActivities.length });
  }

  const renderPlayerName = (playerId) => (
    <PlayerName nameState={nameStateFromProps(playerId, nameStates, userNames)} id={playerId} />
  );
  const getGiftName = (giftId) => giftNameFor(giftId, gifts);
  
  // Track new items for animation
  useEffect(() => {
    const prevActivities = prevActivitiesRef.current;
    const currentActivities = activities;
    
    // Check if new activities were added
    if (currentActivities.length > prevActivities.length) {
      // Get the new activities (the ones that weren't in the previous array)
      const newActivityKeys = new Set();
      currentActivities.slice(prevActivities.length).forEach((activity) => {
        const key = `${activity.playerId}-${activity.giftId}-${activity.timestamp || ''}`;
        newActivityKeys.add(key);
      });
      
      setAnimatedItems(newActivityKeys);
      
      // Remove animation class after animation completes
      setTimeout(() => {
        setAnimatedItems(new Set());
      }, 500);
    }
    
    prevActivitiesRef.current = currentActivities;
  }, [activities]);

  return (
    <div className="w-full">
      <div className="space-y-1.5">
        {recentActivities.map((event, index) => {
          const playerName = renderPlayerName(event.playerId);
          const giftName = getGiftName(event.giftId);
          const eventKey = `${event.playerId}-${event.giftId}-${event.timestamp || index}`;
          const isAnimated = animatedItems.has(eventKey);
          
          if (event.type === 'PICK') {
            return (
              <div
                key={eventKey}
                className={`bg-slate-800/40 border border-white/5 rounded-lg p-2 hover:border-white/10 transition-all ${
                  isAnimated ? 'animate-fade-in-slide-down' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="bg-blue-500/20 border border-blue-500/30 rounded-full p-1 flex-shrink-0">
                    <svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap text-xs">
                      <span className="font-semibold text-white">{playerName}</span>
                      <span className="text-slate-300">picked</span>
                      <span className="font-semibold text-white truncate">{giftName}</span>
                      <span className="text-slate-500 text-[11px]">🎁</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          } else if (event.type === 'STEAL') {
            const previousOwnerName = renderPlayerName(event.previousOwnerId);
            const isFrozen = event.isFrozen;
            
            return (
              <div
                key={eventKey}
                className={`bg-slate-800/40 border rounded-lg p-2 hover:border-white/10 transition-all ${
                  isFrozen
                    ? 'border-red-500/30'
                    : 'border-white/5'
                } ${isAnimated ? 'animate-fade-in-slide-down' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <div className={`rounded-full p-1 border flex-shrink-0 ${
                    isFrozen 
                      ? 'bg-red-500/20 border-red-500/30' 
                      : 'bg-amber-500/20 border-amber-500/30'
                  }`}>
                    <svg className={`w-3.5 h-3.5 ${isFrozen ? 'text-red-400' : 'text-amber-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap text-xs">
                      <span className="font-semibold text-white">{playerName}</span>
                      <span className="text-slate-300">stole</span>
                      <span className="font-semibold text-white truncate">{giftName}</span>
                      <span className="text-slate-300">from</span>
                      <span className="font-semibold text-white">{previousOwnerName}</span>
                      {event.stealCount > 1 && (
                        <span className="inline-block bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-semibold px-1 py-0.5 rounded">
                          #{event.stealCount}
                        </span>
                      )}
                      {isFrozen && (
                        <span className="text-red-400 text-[11px]">🔒</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}

