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
import { GamePlayByPlay } from '../components/GamePlayByPlay.jsx';
import { SimulationControls } from '../components/dev/SimulationControls.jsx';
import { ReactionBar } from '../components/ReactionBar.jsx';
import { ReactionOverlay } from '../components/ReactionOverlay.jsx';
import { GiftToSendCard } from '../components/GiftToSendCard.jsx';
import { GiftIcon } from '@heroicons/react/24/outline';
import confetti from 'canvas-confetti';
import { apiRequest } from '../utils/api.js';

export function GameRoom({ partyId }) {
  const { user } = useAuth();
  const { party } = useParty(partyId);
  const { state, actions, derived, socket, emitReaction } = useGameEngine(partyId);
  const { playTurnNotification, playSteal, playUnwrap } = useGameSounds();
  const [userNames, setUserNames] = useState({});
  const [userEmails, setUserEmails] = useState({});
  const [revealingGiftId, setRevealingGiftId] = useState(null);
  const [prizeImageError, setPrizeImageError] = useState(false);
  const prevIsMyTurnRef = useRef(false);

  // Function to trigger confetti
  const triggerConfetti = () => {
    confetti({
      spread: 70,
      origin: { y: 0.6 }
    });
  };

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
    const getWinnerName = (ownerId) => {
      if (!ownerId) return 'No Winner';
      if (ownerId === user?.uid) return 'You';
      return userNames[ownerId] || userEmails[ownerId] || `User ${ownerId?.slice(0, 8)}`;
    };

    // Get all gifts as array
    const allGifts = Object.values(state.gifts || {});
    
    // Build a map to ensure each winner only gets ONE gift (first one encountered)
    // Use winnerId from Firestore (gifts that have been persisted with winners)
    const winnerGiftMap = new Map();
    allGifts.forEach((gift) => {
      if (gift.winnerId && !winnerGiftMap.has(gift.winnerId)) {
        winnerGiftMap.set(gift.winnerId, gift);
      }
    });

    // Also check unwrapped gifts from gameState if available (for games that just ended)
    if (state.gameState?.unwrappedGifts) {
      const unwrappedMap = new Map(
        Array.isArray(state.gameState.unwrappedGifts)
          ? state.gameState.unwrappedGifts
          : []
      );
      
      unwrappedMap.forEach((giftData, giftId) => {
        if (giftData?.ownerId && !winnerGiftMap.has(giftData.ownerId)) {
          const gift = allGifts.find(g => g.id === giftId);
          if (gift) {
            winnerGiftMap.set(giftData.ownerId, gift);
          }
        }
      });
    }

    // Identify the user's prize and obligation
    const myPrize = winnerGiftMap.get(user?.uid); // Gift where winnerId === user?.uid
    const myObligation = allGifts.find((gift) => gift.submitterId === user?.uid); // Gift where submitterId === user?.uid
    const isSelfWin = myPrize?.id === myObligation?.id; // Check if user won their own gift

    return (
      <>
        {/* Reaction Overlay - Full screen layer for flying emojis */}
        {socket && <ReactionOverlay socket={socket} />}
        
        <div className="max-w-6xl mx-auto p-6 pt-24">
          {/* Celebration Header */}
          <div className="text-center mb-12">
            <div 
              className="text-7xl mb-4 cursor-pointer hover:scale-110 transition-transform"
              onClick={triggerConfetti}
            >
              🎉
            </div>
            <h1 className="text-5xl font-bold mb-3 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Game Over!
            </h1>
            <p className="text-xl text-slate-300">Time to see what you won and send your gifts!</p>
          </div>

          {/* What You Won Section */}
          {myPrize && (
            <div className="mb-12">
              <div className="flex items-center gap-3 mb-6">
                <div className="bg-yellow-500/20 text-yellow-300 ring-1 ring-yellow-500/50 p-3 rounded-full">
                  <svg className="w-8 h-8 text-yellow-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-white mb-6">What You Won</h2>
              </div>
              <div className="space-y-6">
                <div
                  key={myPrize.id}
                  className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-[0_0_30px_-10px_rgba(234,179,8,0.3)] hover:border-white/20 transition-all"
                >
                  <div className="flex gap-6">
                    <div className="relative w-32 h-32 rounded-lg overflow-hidden bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex-shrink-0">
                      {myPrize.image && !prizeImageError ? (
                        <img
                          src={myPrize.image}
                          alt={myPrize.title || 'Gift'}
                          className="w-full h-full object-cover"
                          onError={() => setPrizeImageError(true)}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <GiftIcon className="w-12 h-12 text-white opacity-50" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-white text-3xl font-bold mb-2">{myPrize.title || 'Gift'}</h3>
                      {myPrize.url && (
                        <a
                          href={myPrize.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-300 hover:text-white underline underline-offset-4 text-sm mb-4 inline-block"
                        >
                          View Gift Link ↗
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* What You Need to Send Section */}
          {myObligation && (
            <div className="mb-12">
              <div className="flex items-center gap-3 mb-6">
                <div className="bg-blue-500/20 text-blue-300 ring-1 ring-blue-500/50 p-3 rounded-full">
                  <svg className="w-8 h-8 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-white mb-6">What You Need to Send</h2>
              </div>
              <div className="space-y-6">
                <GiftToSendCard
                  key={myObligation.id}
                  gift={myObligation}
                  winnerId={myObligation.winnerId || (state.gameState?.unwrappedGifts 
                    ? new Map(Array.isArray(state.gameState.unwrappedGifts) ? state.gameState.unwrappedGifts : []).get(myObligation.id)?.ownerId
                    : null)}
                  winnerName={getWinnerName(myObligation.winnerId || (state.gameState?.unwrappedGifts 
                    ? new Map(Array.isArray(state.gameState.unwrappedGifts) ? state.gameState.unwrappedGifts : []).get(myObligation.id)?.ownerId
                    : null))}
                  userNames={userNames}
                  userEmails={userEmails}
                  isSelfWin={isSelfWin}
                />
              </div>
            </div>
          )}

          {/* No gifts message */}
          {!myPrize && !myObligation && (
            <div className="text-center py-12">
              <p className="text-slate-400 text-lg">No gifts assigned to you this game.</p>
            </div>
          )}

          {/* Developer Simulation Controls (includes Audit Trail & Reset) - Only visible when ?sim=true */}
          <SimulationControls socket={socket} partyId={partyId} gameState={state.gameState} />
        </div>

        {/* Reaction Bar - Fixed at bottom for sending reactions */}
        {socket && state.ui.isSocketConnected && <ReactionBar onReaction={emitReaction} />}
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
      
      {/* Connection Health Toast */}
      {!state.ui.isSocketConnected && (
        <div className="fixed bottom-4 right-4 bg-amber-500/10 text-amber-300 border border-amber-500/20 rounded-lg px-4 py-2 text-sm z-50">
          Reconnecting...
        </div>
      )}

      {/* Error Toast */}
      {state.ui.lastError && (
        <div className="fixed top-4 right-4 bg-red-500/10 text-red-300 border border-red-500/20 rounded-lg px-4 py-2 text-sm z-50 animate-fade-in max-w-md">
          <div className="flex items-start justify-between gap-2">
            <span>{state.ui.lastError}</span>
            <a
              href={`/contact?type=bug&message=${encodeURIComponent(`Error: ${state.ui.lastError}\n\nPage: ${window.location.href}\n\nTimestamp: ${new Date().toISOString()}`)}`}
              className="text-blue-400 hover:text-blue-300 underline text-xs whitespace-nowrap ml-2"
            >
              Report
            </a>
          </div>
        </div>
      )}

      {/* Developer Simulation Controls (includes Audit Trail) - Only visible when ?sim=true */}
      <SimulationControls socket={socket} partyId={partyId} gameState={state.gameState} />
      
      {/* Main Dashboard Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 h-[calc(100vh-96px)] overflow-hidden">
        {/* Left Column: Game Board (3 columns on large screens) */}
        <div className="lg:col-span-3 flex flex-col h-full overflow-hidden relative">
          {/* Turn Bar - Sticky at top with transparent/glass effect */}
          <div className="sticky top-0 z-10 bg-transparent backdrop-blur-sm pt-4 pb-4 border-b border-white/5">
            {/* Unified HUD Container */}
            <div className="w-full max-w-5xl mx-auto px-4 p-4 rounded-2xl bg-slate-900/20 backdrop-blur-xl border border-white/10 grid grid-cols-1 md:grid-cols-[auto_minmax(0,1fr)_350px] gap-6 items-center">
              {/* Left Section: Game Status */}
              <div className="flex flex-col gap-2 items-start flex-shrink-0 min-w-[200px]">
                {/* Rounds Remaining */}
                {state.status === 'PLAYING' && (
                  <div className="bg-slate-700/50 text-slate-300 border border-white/10 px-3 py-1 rounded-full text-xs font-mono mb-2 inline-block">
                    {roundsInfo.roundsRemaining} turn{roundsInfo.roundsRemaining !== 1 ? 's' : ''} remaining
                  </div>
                )}
                {/* Boomerang Badge */}
                {(party?.config?.returnToStart || state.gameState?.isBoomerangPhase) && (
                  <div className="bg-indigo-500/20 text-indigo-300 text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border border-indigo-500/30">
                    {state.gameState?.isBoomerangPhase ? '🔄 Boomerang Round!' : '🔄 Boomerang Rule Active'}
                  </div>
                )}
              </div>

              {/* Center Section: Turn Indicator */}
              <div className="text-center min-w-0">
                {derived.isMyTurn ? (
                  <>
                    <p className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-white to-purple-300 drop-shadow-[0_0_10px_rgba(255,255,255,0.5)] animate-pulse">
                      Your Turn!
                    </p>
                    {/* Action Buttons */}
                    {state.gameState?.turnAction && state.gameState.turnAction.some(([id]) => id === currentPlayerId) ? (
                      <div className="mt-4">
                        <Button onClick={actions.endTurn} variant="primary" className="px-8">
                          End Turn
                        </Button>
                      </div>
                    ) : (
                      <div className="mt-4">
                        <Button 
                          onClick={actions.endTurn} 
                          variant="secondary" 
                          className="px-6"
                        >
                          Skip Turn
                        </Button>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xl text-slate-300 animate-pulse whitespace-nowrap truncate">
                    Waiting for <span className="text-white font-semibold truncate">{getCurrentPlayerName()}</span>...
                  </p>
                )}
              </div>

              {/* Right Section: Player Queue */}
              {state.participants.length > 0 && (
                <div className="flex overflow-x-auto gap-2 py-4 max-w-full md:max-w-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] [mask-image:linear-gradient(to_right,transparent_0px,black_40px,black_calc(100%_-_40px),transparent_100%)]">
                  <div className="flex gap-2 px-12 items-center">
                    {state.participants.map((participant, index) => {
                      const isCurrent = participant.id === state.activePlayerId;
                      const playerName = participant.id === user?.uid 
                        ? 'You' 
                        : (userNames[participant.id] || userEmails[participant.id] || `Player ${participant.id.slice(0, 8)}`);
                      const participantTurnIndex = state.turnQueue?.indexOf(participant.id) ?? index;
                      const isPast = state.gameState?.isBoomerangPhase 
                        ? participantTurnIndex > state.currentTurnIndex
                        : participantTurnIndex < state.currentTurnIndex;
                      
                      return (
                        <div
                          key={participant.id}
                          className={`px-3 py-2 rounded-lg text-sm font-medium transition-all flex-shrink-0 whitespace-nowrap ${
                            isCurrent
                              ? 'bg-indigo-600 text-white border border-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.4)] scale-125'
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
            </div>

            {/* Show message to non-admins when all gifts are frozen */}
            {state.status === 'PLAYING' && !isAdmin && allGiftsFrozen && (
              <div className="mt-4 px-4">
                <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-4">
                  <p className="text-sm font-semibold text-orange-300 mb-2">
                    🎉 All gifts are frozen! Waiting for admin to end the game.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Scrollable Gift Container */}
          <div className="flex-1 overflow-y-auto p-6">
            <GiftGrid
              gifts={state.gifts}
              isMyTurn={derived.isMyTurn}
              canSteal={derived.canSteal}
              getStealBlockReason={derived.getStealBlockReason}
              actions={actions}
              currentPlayerId={currentPlayerId}
              userId={user?.uid}
              userNames={userNames}
              userEmails={userEmails}
              revealingGiftId={revealingGiftId}
            />
          </div>
        </div>

        {/* Right Column: Live Feed (1 column on large screens) */}
        {state.status === 'PLAYING' && (
          <div className="lg:col-span-1 border-l border-white/10 h-full flex flex-col bg-slate-900/20 overflow-y-auto">
            <GamePlayByPlay
              state={state}
              userNames={userNames}
              userEmails={userEmails}
            />
          </div>
        )}
      </div>

      {/* Reaction Bar - Fixed at bottom for sending reactions */}
      {socket && state.ui.isSocketConnected && <ReactionBar onReaction={emitReaction} />}
    </>
  );
}

