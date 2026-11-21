/**
 * Game Room Component - Performance Optimized with useGameEngine Hook
 * 
 * Uses the new reducer-based state management with optimistic updates
 */
import { useState, useEffect, useRef, useMemo } from 'react';
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
import { isPlayerActionValidationToast } from '../utils/socketGameErrorToast.js';
import { GAME_USER_COPY } from '../utils/gameUserCopy.js';
import { areAllGiftsFrozenWithNoLegalAction } from '../utils/allGiftsFrozen.js';
import {
  effectiveGameRoomBatchStatus,
  gameRoomNameStates,
  lookupNameState,
  participantNeedsBatchName,
  rosterDisplayNames,
} from '../utils/seatDisplayName.js';
import { PlayerName } from '../components/PlayerName.jsx';
import { LateInviteCard, LateInvitePage, shouldShowLateSignIn } from '../components/LateInviteCard.jsx';
import { hostFirstNameFromParty } from '../components/PartyInviteLanding.jsx';
import { lateVisitorState } from '../utils/lateInvite.js';

/**
 * One shared toast region above the reaction bar (BUG-19 / batch 1 item 1 D). It never sits in the
 * top of the screen, so it can't cover the header or the HUD. At most one toast shows at a time.
 * Rule reminders (steal-back, can't open, can't steal) are polite notices; anything else is an error
 * with a Report link. Hover or keyboard focus pauses the auto-dismiss timer.
 */
function GameToast({ message, onDismiss }) {
  const isNotice = isPlayerActionValidationToast(message);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return undefined;
    const timer = setTimeout(onDismiss, isNotice ? 6000 : 8000);
    return () => clearTimeout(timer);
  }, [onDismiss, isNotice, paused, message]);

  return (
    <div
      role={isNotice ? 'status' : 'alert'}
      aria-live={isNotice ? 'polite' : 'assertive'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={`pointer-events-auto flex items-center gap-2 bg-slate-900/95 border border-white/10 border-l-4 ${
        isNotice ? 'border-l-amber-400' : 'border-l-red-500'
      } rounded-lg pl-4 pr-1 py-1 text-sm text-slate-100 shadow-lg motion-safe:animate-[fadeInUp_0.3s_ease-out]`}
      data-testid="game-toast"
    >
      <span className="flex-1 py-2">{message}</span>
      {!isNotice && (
        <a
          href={`/contact?type=bug&message=${encodeURIComponent(`Error: ${message}\n\nPage: ${window.location.href}\n\nTimestamp: ${new Date().toISOString()}`)}`}
          className="inline-flex items-center min-h-11 px-2 text-blue-300 hover:text-blue-200 underline text-sm whitespace-nowrap rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
        >
          Report
        </a>
      )}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="inline-flex items-center justify-center min-h-11 min-w-11 px-2 text-slate-300 hover:text-white text-sm rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
      >
        Dismiss
      </button>
    </div>
  );
}

export function GameRoom({ partyId }) {
  const { user } = useAuth();
  const { party, participants: liveParticipants } = useParty(partyId);
  const { state, actions, derived, socket, emitReaction, dispatch, joinDeniedAsNonParticipant } = useGameEngine(partyId);
  const { playTurnNotification, playSteal, playUnwrap } = useGameSounds();
  const [batchNames, setBatchNames] = useState({});
  const [batchStatus, setBatchStatus] = useState('idle');
  const [batchSettledKey, setBatchSettledKey] = useState('');
  const [revealingGiftId, setRevealingGiftId] = useState(null);
  const [prizeImageError, setPrizeImageError] = useState(false);
  const prevIsMyTurnRef = useRef(false);
  const hudRef = useRef(null);
  const [gameLoadTimedOut, setGameLoadTimedOut] = useState(false);

  const isWaitingForLiveGame = useMemo(() => {
    if (party?.status !== 'ACTIVE') {
      return false;
    }
    return state.status === 'LOBBY' || !state.ui.isSocketConnected || !state.gameState;
  }, [party?.status, state.gameState, state.status, state.ui.isSocketConnected]);

  useEffect(() => {
    if (!isWaitingForLiveGame) {
      setGameLoadTimedOut(false);
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setGameLoadTimedOut(true);
    }, 5000);
    return () => window.clearTimeout(timeoutId);
  }, [isWaitingForLiveGame]);

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
      // Phones: if the HUD scrolled fully off screen, bring it back so the turn isn't missed.
      const hud = hudRef.current;
      if (hud) {
        const rect = hud.getBoundingClientRect();
        if (rect.bottom <= 0 || rect.top >= window.innerHeight) {
          const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
          hud.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
        }
      }
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

  // Seat names first; /api/users/batch is only a fallback for seats without a valid
  // displayName, keyed on the sorted participant id list (not on state.gifts).
  const rosterParticipants = useMemo(() => {
    const liveById = new Map((liveParticipants || []).map((p) => [p.id, p]));
    const ordered = (state.participants || []).map((p) => ({
      ...p,
      ...(liveById.get(p.id) || {}),
    }));
    return ordered.length > 0 ? ordered : (liveParticipants || []);
  }, [liveParticipants, state.participants]);

  const participantIdsKey = rosterParticipants
    .map((p) => p.id)
    .filter(Boolean)
    .slice()
    .sort()
    .join(',');

  const needingNames = useMemo(
    () => rosterParticipants.filter(participantNeedsBatchName),
    [rosterParticipants],
  );

  // A previous empty roster (typical first frame after refresh/rejoin) must not
  // count as a settled lookup. Otherwise nameless seats flash "Player".
  const effectiveBatchStatus = effectiveGameRoomBatchStatus({
    participantIdsKey,
    settledKey: batchSettledKey,
    batchStatus,
    needingCount: needingNames.length,
    participantCount: rosterParticipants.length,
  });

  useEffect(() => {
    if (!partyId) return undefined;
    if (needingNames.length === 0) {
      // Leave an empty roster idle so arriving seats stay in the loading state
      // until their batch (or seat names) actually settles.
      if (rosterParticipants.length > 0) {
        setBatchStatus('success');
        setBatchSettledKey(participantIdsKey);
      }
      return undefined;
    }

    let cancelled = false;
    setBatchStatus('pending');
    (async () => {
      try {
        const response = await apiRequest('/api/users/batch', {
          method: 'POST',
          body: JSON.stringify({
            partyId,
            userIds: [...new Set(needingNames.map((p) => p.id))],
          }),
        });
        if (cancelled) return;
        if (response.users) setBatchNames(response.users);
        setBatchStatus('success');
        setBatchSettledKey(participantIdsKey);
      } catch (error) {
        console.error('Error fetching user names:', error);
        if (!cancelled) {
          setBatchStatus('failed');
          setBatchSettledKey(participantIdsKey);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // participantIdsKey is the sorted participant id list; names come from live seats.
  }, [partyId, participantIdsKey, rosterParticipants, needingNames]);

  const names = rosterDisplayNames(rosterParticipants, batchNames);
  const nameStates = useMemo(
    () => gameRoomNameStates(
      rosterParticipants,
      batchNames,
      effectiveBatchStatus,
      GAME_USER_COPY.unnamedPlayer,
    ),
    [rosterParticipants, batchNames, effectiveBatchStatus],
  );

  // Calculate rounds remaining
  const calculateRoundsRemaining = () => {
    if (!state.gameState || state.status === 'FINISHED') {
      return { roundsRemaining: 0, totalRounds: 0, currentRound: 0 };
    }
    
    const { turnQueue, currentTurnIndex, stealStack, isBoomerangPhase: serverBoomerangPhase, config } = state.gameState;
    const returnToStart = config?.returnToStart ?? false;
    const isBoomerangPhase = returnToStart && (
      serverBoomerangPhase ||
      (currentTurnIndex >= (state.gameState?.turnOrder?.length || 0))
    );
    
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
  const returnToStartEnabled =
    party?.config?.returnToStart ?? state.gameState?.config?.returnToStart ?? false;
  const isBoomerangPhaseForUi =
    returnToStartEnabled &&
    (state.gameState?.isBoomerangPhase ||
      (state.gameState?.currentTurnIndex >= (state.gameState?.turnOrder?.length || 0)));
  const isAdmin = !!user && !!party && party.adminId === user.uid;
  // Use activePlayerId from state machine (accounts for pendingVictimId)
  const currentPlayerId = state.activePlayerId;
  const allGiftsFrozen = areAllGiftsFrozenWithNoLegalAction(state.gifts);

  const currentPlayerNameState = currentPlayerId
    ? lookupNameState(nameStates, currentPlayerId, effectiveBatchStatus, GAME_USER_COPY.unnamedPlayer)
    : null;

  // Socket confirmed this session has no seat. Show the late card at once (no 5s timeout, no toast).
  if (joinDeniedAsNonParticipant) {
    const late = lateVisitorState(party, 'not-seated') || 'started';
    return (
      <LateInvitePage>
        <LateInviteCard
          state={late}
          partyTitle={party?.title || 'White Elephant Party'}
          hostFirstName={hostFirstNameFromParty(party)}
          showSignIn={shouldShowLateSignIn(user)}
        />
      </LateInvitePage>
    );
  }

  // Loading state
  if (state.status === 'LOBBY' || !state.ui.isSocketConnected) {
    if (gameLoadTimedOut && isWaitingForLiveGame) {
      return (
        <>
          <ReactionBar onReaction={emitReaction} />
          <div className="min-h-[50vh] flex items-center justify-center p-6">
            <div className="max-w-md w-full bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-8 text-center">
              <h2 className="text-2xl font-bold mb-4 text-red-400">Couldn&apos;t load the game</h2>
              <p className="text-slate-300 mb-6">Refresh the page and try again.</p>
              <Button type="button" onClick={() => window.location.reload()} className="w-full">
                Refresh
              </Button>
            </div>
          </div>
        </>
      );
    }

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
      const resolved = lookupNameState(
        nameStates,
        ownerId,
        effectiveBatchStatus,
        GAME_USER_COPY.unnamedPlayer,
      );
      if (resolved.status === 'loading') return null;
      return resolved.name || GAME_USER_COPY.unnamedPlayer;
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
            <p className="text-xl text-slate-300">Here&apos;s what you won, and what you need to ship.</p>
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
                  nameStates={nameStates}
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
      
      {/* Shared toast region: centered above the reaction bar, one toast at a time */}
      <div
        className="fixed left-1/2 -translate-x-1/2 z-[101] w-[min(calc(100vw-32px),28rem)] bottom-[calc(96px+env(safe-area-inset-bottom))] pointer-events-none"
        data-testid="game-toast-region"
      >
        {state.ui.lastError ? (
          <GameToast
            message={state.ui.lastError}
            onDismiss={() => {
              if (dispatch) {
                dispatch({ type: 'ERROR_CLEARED' });
              }
            }}
          />
        ) : (
          !state.ui.isSocketConnected && (
            <div
              role="status"
              aria-live="polite"
              className="bg-slate-900/95 border border-white/10 border-l-4 border-l-amber-400 rounded-lg px-4 py-3 text-sm text-slate-100 shadow-lg"
            >
              Reconnecting...
            </div>
          )
        )}
      </div>

      {/* Developer Simulation Controls (includes Audit Trail) - Only visible when ?sim=true */}
      <SimulationControls socket={socket} partyId={partyId} gameState={state.gameState} />
      
      {/* Main Dashboard Grid Layout */}
      {/* Below lg the page scrolls as one document (HUD, gifts, Live Feed); lg and up keeps the 3+1 grid */}
      <div className="flex flex-col lg:grid lg:grid-cols-4 lg:h-[calc(100dvh-96px)] lg:overflow-hidden">
        {/* Left Column: Game Board (3 columns on large screens) */}
        <div className="lg:col-span-3 flex flex-col lg:h-full lg:overflow-hidden relative">
          {/* Turn Bar - in normal flow on phones, sticky at the top of the board column on desktop */}
          <div ref={hudRef} className="lg:sticky lg:top-0 z-10 bg-transparent backdrop-blur-sm pt-4 pb-4 border-b border-white/5">
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
                {returnToStartEnabled && (
                  <div className="flex flex-col items-start gap-1">
                    <div className="bg-indigo-500/20 text-indigo-300 text-xs font-semibold px-2 py-1 rounded-full border border-indigo-500/30">
                      {isBoomerangPhaseForUi ? 'Boomerang round' : 'Boomerang is on'}
                    </div>
                    {!isBoomerangPhaseForUi && (
                      <p className="text-xs text-indigo-200/90 leading-snug">
                        You can swap even if you already have a gift.
                      </p>
                    )}
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
                    {derived.canSkipTurn && (
                      <div className="mt-4 flex justify-center">
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
                ) : currentPlayerId ? (
                  <p className="text-xl text-slate-300 animate-pulse flex items-center justify-center gap-1 min-w-0">
                    <span className="shrink-0">Waiting for</span>
                    <PlayerName
                      nameState={currentPlayerNameState}
                      id={currentPlayerId}
                      showBotTag
                      className="text-white font-semibold"
                    />
                    <span className="shrink-0">...</span>
                  </p>
                ) : null}
              </div>

              {/* Right Section: Player Queue */}
              {state.participants.length > 0 && (
                <div className="flex overflow-x-auto gap-2 py-4 max-w-full md:max-w-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] [mask-image:linear-gradient(to_right,transparent_0px,black_40px,black_calc(100%_-_40px),transparent_100%)]">
                  <div className="flex gap-2 px-12 items-center">
                    {rosterParticipants.map((participant, index) => {
                      const isCurrent = participant.id === state.activePlayerId;
                      const participantTurnIndex = state.turnQueue?.indexOf(participant.id) ?? index;
                      const isPast = isBoomerangPhaseForUi 
                        ? participantTurnIndex > state.currentTurnIndex
                        : participantTurnIndex < state.currentTurnIndex;
                      const chipNameState = lookupNameState(
                        nameStates,
                        participant.id,
                        effectiveBatchStatus,
                        GAME_USER_COPY.unnamedPlayer,
                      );
                      
                      return (
                        <div
                          key={participant.id}
                          title={chipNameState.status === 'ready' ? (names[participant.id] || chipNameState.name) : undefined}
                          className={`px-3 py-2 rounded-lg text-sm font-medium transition-all flex-shrink-0 max-w-[10rem] ${
                            isCurrent
                              ? 'bg-indigo-600 text-white border border-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.4)] scale-125'
                              : isPast
                              ? 'bg-slate-800/30 border border-white/5 text-slate-500'
                              : 'bg-slate-800/50 border border-white/10 text-slate-400'
                          }`}
                        >
                          <span className="inline-flex items-center gap-1 min-w-0">
                            <span className="font-bold shrink-0">{index + 1}.</span>
                            <PlayerName
                              nameState={chipNameState}
                              id={participant.id}
                              showBotTag
                              className="min-w-0"
                            />
                            {isCurrent && <span className="ml-1 shrink-0">👈</span>}
                          </span>
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
                    {GAME_USER_COPY.waitingForHostEnd}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Gift Container: scrolls on its own only on desktop */}
          <div className="lg:flex-1 lg:overflow-y-auto p-6 lg:pb-[calc(96px+env(safe-area-inset-bottom))]">
            <GiftGrid
              gifts={state.gifts}
              isMyTurn={derived.isMyTurn}
              canPick={derived.canPick}
              canSteal={derived.canSteal}
              getStealBlockReason={derived.getStealBlockReason}
              isOwnGiftLocked={derived.isOwnGiftLocked}
              actions={actions}
              currentPlayerId={currentPlayerId}
              userId={user?.uid}
              nameStates={nameStates}
              revealingGiftId={revealingGiftId}
            />
          </div>
        </div>

        {/* Right Column: Live Feed (1 column on large screens; after the gifts on phones).
            Bottom padding lets the last row clear the fixed reaction bar. */}
        {state.status === 'PLAYING' && (
          <div className="lg:col-span-1 lg:border-l border-white/10 lg:h-full flex flex-col bg-slate-900/20 lg:overflow-y-auto px-4 lg:px-0 pb-[calc(96px+env(safe-area-inset-bottom))]">
            <GamePlayByPlay
              state={state}
              nameStates={nameStates}
              partyId={partyId}
            />
          </div>
        )}
      </div>

      {/* Reaction Bar - Fixed at bottom for sending reactions */}
      {socket && state.ui.isSocketConnected && <ReactionBar onReaction={emitReaction} />}
    </>
  );
}

