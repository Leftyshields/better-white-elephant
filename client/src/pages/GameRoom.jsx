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
    
    const { turnOrder, currentPlayerId, stealStack, isBoomerangPhase, config } = state.gameState;
    const currentIndex = turnOrder.indexOf(currentPlayerId);
    const totalPlayers = turnOrder.length;
    
    if (isBoomerangPhase) {
      const remainingInBoomerang = currentIndex + 1;
      return {
        roundsRemaining: remainingInBoomerang + (stealStack?.length || 0),
        totalRounds: totalPlayers * 2,
        currentRound: 2,
        phase: 'boomerang'
      };
    } else {
      const remainingInNormal = (totalPlayers - currentIndex);
      const totalTurns = config?.returnToStart ? totalPlayers * 2 : totalPlayers;
      return {
        roundsRemaining: remainingInNormal + (stealStack?.length || 0),
        totalRounds: totalTurns,
        currentRound: 1,
        phase: 'normal'
      };
    }
  };

  const roundsInfo = calculateRoundsRemaining();
  const isAdmin = party?.adminId === user?.uid;
  const currentPlayerId = state.participants[state.currentTurnIndex]?.id;
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
                const isCurrent = index === state.currentTurnIndex;
                const playerName = participant.id === user?.uid 
                  ? 'You' 
                  : (userNames[participant.id] || userEmails[participant.id] || `Player ${participant.id.slice(0, 8)}`);
                const isPast = state.gameState?.isBoomerangPhase 
                  ? index > state.currentTurnIndex
                  : index < state.currentTurnIndex;
                
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

