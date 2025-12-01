/**
 * Game Room Component - Performance Optimized with useGameEngine Hook
 * 
 * Uses the new reducer-based state management with optimistic updates
 */
import { useState, useEffect, useRef } from 'react';
import { useGameEngine } from '../hooks/useGameEngine.js';
import { useAuth } from '../hooks/useAuth.js';
import { useParty } from '../hooks/useParty.js';
import { useGameSounds } from '../hooks/useGameSounds.js';
import { GiftGrid } from '../components/GiftGrid.jsx';
import { Button } from '../components/ui/Button.jsx';
import { GameAuditTrail } from '../components/GameAuditTrail.jsx';
import { GameTicker } from '../components/GameTicker.jsx';
import { GamePlayByPlay } from '../components/GamePlayByPlay.jsx';
import { SimulationControls } from '../components/dev/SimulationControls.jsx';
import { ReactionBar } from '../components/ReactionBar.jsx';
import { ReactionOverlay } from '../components/ReactionOverlay.jsx';
import { apiRequest } from '../utils/api.js';

export function GameRoom({ partyId }) {
  const { user } = useAuth();
  const { party } = useParty(partyId);
  const { state, actions, derived, socket, emitReaction } = useGameEngine(partyId);
  const { playTurnNotification, playSteal, playUnwrap } = useGameSounds();
  const [userNames, setUserNames] = useState({});
  const [userEmails, setUserEmails] = useState({});
  const [revealingGiftId, setRevealingGiftId] = useState(null);
  const prevIsMyTurnRef = useRef(false);

  // Debug: Log socket and connection status
  useEffect(() => {
    console.log('🔍 GameRoom Debug:', {
      socket: !!socket,
      isSocketConnected: state.ui.isSocketConnected,
      status: state.status,
    });
  }, [socket, state.ui.isSocketConnected, state.status]);

  // Play turn notification sound when it becomes user's turn
  useEffect(() => {
    const isMyTurn = derived.isMyTurn;
    const wasMyTurn = prevIsMyTurnRef.current;
    
    // Only play sound when transitioning from not my turn to my turn
    if (isMyTurn && !wasMyTurn && state.status === 'PLAYING') {
      playTurnNotification();
    }
    
    prevIsMyTurnRef.current = isMyTurn;
  }, [derived.isMyTurn, state.status, playTurnNotification]);

  // Listen for action_started events to trigger reveal animations and auto-scroll
  // CRITICAL: Only trigger "Drumroll" animation for PICK (Unwrap) events, not STEAL
  useEffect(() => {
    if (!socket) return;

    const handleActionStarted = ({ type, giftId, playerId }) => {
      // Only trigger reveal animation for PICK (unwrap) events
      // STEAL events should happen immediately without the shake/drumroll animation
      if (type === 'pick') {
        // Set revealing gift ID to trigger animation
        setRevealingGiftId(giftId);
        
        // Auto-scroll to gift immediately
        setTimeout(() => {
          const giftElement = document.getElementById(`gift-${giftId}`);
          if (giftElement) {
            giftElement.scrollIntoView({ 
              behavior: 'smooth', 
              block: 'center' 
            });
          }
        }, 100); // Small delay to ensure DOM is ready
        
        // Clear revealing state after 3s (when reveal completes)
        setTimeout(() => {
          setRevealingGiftId(null);
        }, 3000);
      } else if (type === 'steal') {
        // For STEAL events, just auto-scroll (no animation)
        // The gift is already known, so no need for reveal animation
        setTimeout(() => {
          const giftElement = document.getElementById(`gift-${giftId}`);
          if (giftElement) {
            giftElement.scrollIntoView({ 
              behavior: 'smooth', 
              block: 'center' 
            });
          }
        }, 100);
      }
    };

    socket.on('action_started', handleActionStarted);

    return () => {
      socket.off('action_started', handleActionStarted);
    };
  }, [socket]);

  // Listen for game actions to play appropriate sounds
  useEffect(() => {
    if (!socket) return;

    const handleGameAction = (actionData) => {
      // Check if this is a steal or unwrap action
      // This would need to be adapted based on your actual socket event structure
      if (actionData?.type === 'steal') {
        playSteal();
      } else if (actionData?.type === 'pick' || actionData?.type === 'unwrap') {
        playUnwrap();
      }
    };

    // Listen for game-updated events which may contain action info
    socket.on('game-updated', (gameState) => {
      // Check activities for recent actions
      if (gameState?.activities && Array.isArray(gameState.activities)) {
        const lastActivity = gameState.activities[gameState.activities.length - 1];
        if (lastActivity) {
          if (lastActivity.type === 'STEAL') {
            playSteal();
          } else if (lastActivity.type === 'PICK') {
            playUnwrap();
          }
        }
      }
    });

    return () => {
      socket.off('game-updated');
    };
  }, [socket, playSteal, playUnwrap]);

  // Fetch user names for display
  useEffect(() => {
    const fetchUserNames = async () => {
      if (!state.participants || state.participants.length === 0) {
        setUserNames({});
        setUserEmails({});
        return;
      }

      try {
        const allUserIds = [
          ...state.participants.map(p => p.id),
          ...Object.values(state.gifts).map(g => g.ownerId).filter(Boolean),
        ].filter(Boolean);

        if (allUserIds.length === 0) return;

        const response = await apiRequest('/api/users/batch', {
          method: 'POST',
          body: JSON.stringify({ userIds: [...new Set(allUserIds)] }),
        });
        
        if (response.users) setUserNames(response.users);
        if (response.emails) setUserEmails(response.emails);
      } catch (error) {
        console.error('Error fetching user names:', error);
      }
    };

    fetchUserNames();
  }, [state.participants, state.gifts]);

  // Calculate rounds remaining
  const calculateRoundsRemaining = () => {
    if (!state.gameState || state.status === 'FINISHED') {
      return { roundsRemaining: 0, totalRounds: 0, currentRound: 0 };
    }
    
    const { turnQueue, currentTurnIndex, stealStack, isBoomerangPhase, config } = state.gameState;
    
    if (!turnQueue || turnQueue.length === 0) {
      return { roundsRemaining: 0, totalRounds: 0, currentRound: 0 };
    }
    
    const totalTurns = turnQueue.length;
    // Clamp currentTurnIndex to valid range (0 to turnQueue.length)
    // This handles cases where index goes out of bounds due to steals not advancing the index
    const currentIndex = Math.min(currentTurnIndex || 0, totalTurns);
    // Turns remaining should only count the turn queue, not steal chains
    // According to GAME_RULES.md Rule 2: STEAL does NOT increment currentTurnIndex
    const roundsRemaining = Math.max(0, totalTurns - currentIndex);
    
    if (isBoomerangPhase) {
      return {
        roundsRemaining,
        totalRounds: totalTurns,
        currentRound: 2,
        phase: 'boomerang'
      };
    } else {
      return {
        roundsRemaining,
        totalRounds: totalTurns,
        currentRound: 1,
        phase: 'normal'
      };
    }
  };

  const roundsInfo = calculateRoundsRemaining();
  const isAdmin = party?.adminId === user?.uid;
  // Use activePlayerId from state machine (accounts for pendingVictimId)
  const currentPlayerId = state.activePlayerId;
  const allGiftsFrozen = Object.values(state.gifts).filter(g => !g.isWrapped).every(g => g.isFrozen);

  const getCurrentPlayerName = () => {
    if (currentPlayerId === user?.uid) return 'Your Turn!';
    return userNames[currentPlayerId] || userEmails[currentPlayerId] || `Player ${currentPlayerId?.slice(0, 8)}`;
  };

  const handleEndGame = async () => {
    if (!confirm('Are you sure you want to end the game? All current ownership will be final.')) {
      return;
    }

    try {
      const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
      const response = await fetch(`${serverUrl}/api/game/end`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({ partyId }),
      });

      const data = await response.json();
      if (!data.success) {
        alert('Failed to end game: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error ending game:', error);
      alert('Failed to end game: ' + error.message);
    }
  };

  // Loading state
  if (state.status === 'LOBBY' || !state.ui.isSocketConnected) {
    return (
      <>
        {/* Force render ReactionBar even in loading state for debugging */}
        <ReactionBar onReaction={emitReaction} />
        <div className="max-w-6xl mx-auto p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-4 animate-pulse">
                <div className="h-48 bg-slate-700/50 rounded-lg mb-3"></div>
                <div className="h-4 bg-slate-700/50 rounded mb-2"></div>
                <div className="h-3 bg-slate-700/50 rounded w-2/3"></div>
              </div>
            ))}
          </div>
        </div>
      </>
    );
  }

  // Finished state - show ended screen
  if (state.status === 'FINISHED' || party?.status === 'ENDED') {
    // This would need the ended game UI - for now, show a simple message
    // The full ended game UI can be ported from GameBoard if needed
    return (
      <>
        {/* Reaction Overlay - Full screen layer for flying emojis */}
        {socket && <ReactionOverlay socket={socket} />}
        
        <div className="max-w-6xl mx-auto p-6 text-center">
          <div className="text-7xl mb-4">🎉</div>
          <h1 className="text-5xl font-bold mb-3 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Game Over!
          </h1>
          <p className="text-xl text-slate-300">Check the audit trail below to see the full game history.</p>
          <GameAuditTrail
            history={state.activities}
            gifts={Object.values(state.gifts)}
            userNames={userNames}
            userEmails={userEmails}
          />
        </div>

        {/* Reaction Bar - Fixed at bottom for sending reactions */}
        {/* FORCE RENDER FOR DEBUGGING - Remove conditional check */}
        <ReactionBar onReaction={emitReaction} />
      </>
    );
  }

  // Debug state logging
  console.log("DEBUG UI:", { 
    status: state.status, 
    connected: state.ui.isSocketConnected,
    socket: !!socket,
    partyId 
  });

  return (
    <>
      {/* Reaction Overlay - Full screen layer for flying emojis */}
      {socket && <ReactionOverlay socket={socket} />}
      
      {/* FORCE PLAY-BY-PLAY AT TOP - UNCONDITIONAL */}
      <div className="w-full bg-red-600 border-8 border-yellow-400 p-8 mb-4 z-50">
        <h1 className="text-4xl font-bold text-white mb-4">🎬 PLAY-BY-PLAY FEED (FORCED TO TOP)</h1>
        <GamePlayByPlay
          state={state}
          userNames={userNames}
          userEmails={userEmails}
        />
      </div>
      
      {/* Developer Simulation Controls (includes Audit Trail) - Only visible when ?sim=true */}
      <SimulationControls socket={socket} partyId={partyId} gameState={state.gameState} />
      
      <div className="max-w-6xl mx-auto p-6">
        {/* Connection Health Toast */}
        {!state.ui.isSocketConnected && (
          <div className="fixed bottom-4 right-4 bg-amber-500/10 text-amber-300 border border-amber-500/20 rounded-lg px-4 py-2 text-sm z-50">
            Reconnecting...
          </div>
        )}

      {/* Error Toast */}
      {state.ui.lastError && (
        <div className="fixed top-4 right-4 bg-red-500/10 text-red-300 border border-red-500/20 rounded-lg px-4 py-2 text-sm z-50 animate-fade-in">
          {state.ui.lastError}
        </div>
      )}

      <div className="mb-6 text-center">
        <h1 className="text-3xl font-bold mb-4 text-white">White Elephant Game</h1>
        
        {/* Rounds Remaining */}
        {state.status === 'PLAYING' && (
          <div className="mb-4">
            <div className="inline-block bg-slate-800/50 border border-white/10 rounded-full px-5 py-2">
              <span className="text-sm font-semibold text-slate-300">
                {roundsInfo.roundsRemaining} turn{roundsInfo.roundsRemaining !== 1 ? 's' : ''} remaining
                {state.gameState?.isBoomerangPhase && ' (Boomerang)'}
              </span>
            </div>
          </div>
        )}

        {/* Turn Indicator (HUD) */}
        <div className="mb-4">
          <p className={`text-5xl font-extrabold mb-2 ${
            derived.isMyTurn
              ? 'text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400 drop-shadow-[0_0_15px_rgba(168,85,247,0.5)] animate-pulse'
              : 'text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400 drop-shadow-[0_0_15px_rgba(168,85,247,0.5)]'
          }`}>
            {getCurrentPlayerName()}
          </p>
          <p className="text-slate-300 text-lg mt-2 font-medium">Current Turn</p>
        </div>
        
        {/* Boomerang Badges */}
        {party?.config?.returnToStart && (
          <div className="mb-4 flex justify-center">
            <div className="bg-amber-500/10 text-amber-300 border border-amber-500/20 rounded-full px-4 py-1 text-sm">
              🔄 Boomerang Rule Active: After the last player, turns go back in reverse order!
            </div>
          </div>
        )}
        
        {state.gameState?.isBoomerangPhase && (
          <div className="mb-4 flex justify-center">
            <div className="bg-amber-500/10 text-amber-300 border border-amber-500/20 rounded-full px-4 py-1 text-sm">
              🔄 Boomerang Round!
            </div>
          </div>
        )}
        
        {/* Player Queue */}
        {state.participants.length > 0 && (
          <div className="mb-6">
            <div className="flex overflow-x-auto justify-center gap-2 pb-2">
              {state.participants.map((participant, index) => {
                // Use activePlayerId to determine if this participant is currently active
                const isCurrent = participant.id === state.activePlayerId;
                const playerName = participant.id === user?.uid 
                  ? 'You' 
                  : (userNames[participant.id] || userEmails[participant.id] || `Player ${participant.id.slice(0, 8)}`);
                // For past/future indication, use turnQueue index if available, otherwise fall back to participant index
                const participantTurnIndex = state.turnQueue?.indexOf(participant.id) ?? index;
                const isPast = state.gameState?.isBoomerangPhase 
                  ? participantTurnIndex > state.currentTurnIndex
                  : participantTurnIndex < state.currentTurnIndex;
                
                return (
                  <div
                    key={participant.id}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      isCurrent
                        ? 'bg-indigo-600 text-white border border-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.4)] scale-110'
                        : isPast
                        ? 'bg-slate-800/30 border border-white/5 text-slate-500'
                        : 'bg-slate-800/50 border border-white/10 text-slate-400'
                    }`}
                  >
                    <span className="font-bold mr-1">{index + 1}.</span>
                    {playerName}
                    {isCurrent && <span className="ml-2">👈</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* End Game Button - Admin only */}
        {state.status === 'PLAYING' && isAdmin && (
          <div className="mt-4">
            {allGiftsFrozen && (
              <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-4 mb-4">
                <p className="text-sm font-semibold text-orange-300 mb-2">
                  🎉 All gifts are frozen! The game is ready to end.
                </p>
              </div>
            )}
            <div>
              <Button
                onClick={handleEndGame}
                variant={allGiftsFrozen ? "primary" : "secondary"}
                className="px-8 py-3 text-lg"
              >
                {allGiftsFrozen ? 'End Game Now' : 'End Game Manually'}
              </Button>
              <p className="text-xs text-slate-400 mt-2">
                {allGiftsFrozen 
                  ? 'All gifts are frozen. Click to finalize winners and end the game.'
                  : 'As admin, you can manually end the game at any time'}
              </p>
            </div>
          </div>
        )}

        {/* Show message to non-admins when all gifts are frozen */}
        {state.status === 'PLAYING' && !isAdmin && allGiftsFrozen && (
          <div className="mt-4">
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-4">
              <p className="text-sm font-semibold text-orange-300 mb-2">
                🎉 All gifts are frozen! Waiting for admin to end the game.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Debug info - always show */}
      <div className="w-full max-w-4xl mx-auto mb-2 p-2 bg-yellow-500/20 border border-yellow-500/50 rounded text-xs text-yellow-200 font-mono">
        🔍 TICKER DEBUG: status="{state.status}", activities={state.activities?.length || 0}, phase={state.gameState?.phase || 'N/A'}
      </div>

      {/* FORCE TEST: This should ALWAYS be visible */}
      <div className="w-full max-w-4xl mx-auto mb-4 p-4 bg-red-500 border-4 border-red-600 rounded text-white font-bold text-lg">
        🚨 TEST: If you see this, the render is working. Looking for GamePlayByPlay below...
      </div>

      {/* Live Activity Ticker */}
      {state.status === 'PLAYING' ? (
        <div className="w-full max-w-4xl mx-auto mb-6">
          {state.activities.length > 0 ? (
            <GameTicker
              activities={state.activities}
              gifts={Object.values(state.gifts)}
              userNames={userNames}
              userEmails={userEmails}
            />
          ) : (
            <div className="p-4 bg-slate-800/40 border border-white/5 rounded-xl text-center text-slate-400 text-sm">
              📋 Activity feed will appear here after the first move...
            </div>
          )}
        </div>
      ) : (
        <div className="w-full max-w-4xl mx-auto mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-center text-red-300 text-sm">
          ⚠️ Ticker hidden: status is "{state.status}" (needs "PLAYING")
        </div>
      )}

      {/* Play-by-Play Feed - FORCE RENDER FOR TESTING */}
      <div className="w-full max-w-4xl mx-auto mb-4 p-4 bg-purple-500 border-4 border-purple-600 rounded text-white font-bold">
        🟣 BEFORE GamePlayByPlay Component
      </div>
      <GamePlayByPlay
        state={state}
        userNames={userNames}
        userEmails={userEmails}
      />
      <div className="w-full max-w-4xl mx-auto mb-4 p-4 bg-purple-500 border-4 border-purple-600 rounded text-white font-bold">
        🟣 AFTER GamePlayByPlay Component
      </div>

      {/* Gift Grid */}
      <GiftGrid
        gifts={state.gifts}
        isMyTurn={derived.isMyTurn}
        canSteal={derived.canSteal}
        actions={actions}
        currentPlayerId={currentPlayerId}
        userId={user?.uid}
        userNames={userNames}
        userEmails={userEmails}
        revealingGiftId={revealingGiftId}
      />

      {/* End Turn Button */}
      {state.gameState?.turnAction && state.gameState.turnAction.some(([id]) => id === currentPlayerId) && (
        <div className="mt-6 text-center">
          <Button onClick={actions.endTurn} variant="primary" className="px-8">
            End Turn
          </Button>
        </div>
      )}

      {/* Game Audit Trail */}
      {state.activities.length > 0 && (
        <GameAuditTrail
          history={state.activities}
          gifts={Object.values(state.gifts)}
          userNames={userNames}
          userEmails={userEmails}
        />
      )}

      {/* Reaction Bar - Fixed at bottom for sending reactions */}
      {/* FORCE RENDER FOR DEBUGGING - Remove conditional check */}
      <ReactionBar onReaction={emitReaction} />
      
      {/* Debug: Test if fixed positioning works */}
      <div 
        className="fixed bottom-4 right-4 bg-red-500 text-white p-4 z-[200] rounded-lg"
        style={{ zIndex: 200 }}
      >
        DEBUG: If you see this, fixed positioning works
      </div>
    </div>
    </>
  );
}

