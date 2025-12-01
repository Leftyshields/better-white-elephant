/**
 * Game Board Component
 */
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftIcon, GiftIcon } from '@heroicons/react/24/outline';
import confetti from 'canvas-confetti';
import { useGameSocket } from '../hooks/useGameSocket.js';
import { useParty } from '../hooks/useParty.js';
import { useAuth } from '../hooks/useAuth.js';
import { useGameSounds } from '../hooks/useGameSounds.js';
import { GiftCard } from './GiftCard.jsx';
import { Button } from './ui/Button.jsx';
import { AddressModal } from './AddressModal.jsx';
import { ShippingAddressViewModal } from './ShippingAddressViewModal.jsx';
import { GiftToSendCard } from './GiftToSendCard.jsx';
import { GameAuditTrail } from './GameAuditTrail.jsx';
import { GamePlayByPlay } from './GamePlayByPlay.jsx';
import { ReactionBar } from './ReactionBar.jsx';
import { ReactionOverlay } from './ReactionOverlay.jsx';
import { SimulationControls } from './dev/SimulationControls.jsx';
import { GameFooter } from './GameFooter.jsx';
import { apiRequest } from '../utils/api.js';
import { trackGameAction } from '../utils/analytics.js';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../utils/firebase.js';

export function GameBoard({ partyId, onEndTurn }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { gameState, pickGift, stealGift, endTurn, connected, socket, emitReaction, connectionError } = useGameSocket(partyId);
  
  // Use onEndTurn prop if provided, otherwise fall back to endTurn from hook
  const handleEndTurn = onEndTurn || endTurn;
  const { gifts, participants, party } = useParty(partyId);
  const { playTurnNotification, playSteal, playUnwrap, playVictory } = useGameSounds();
  const [userNames, setUserNames] = useState({});
  const [userEmails, setUserEmails] = useState({});
  const [revealingGiftId, setRevealingGiftId] = useState(null);
  const prevIsMyTurnRef = useRef(false);
  const activePlayerRef = useRef(null);
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [prizeImageError, setPrizeImageError] = useState(false);
  const [selectedGift, setSelectedGift] = useState(null);
  const [showAddressViewModal, setShowAddressViewModal] = useState(false);
  const [selectedWinnerAddress, setSelectedWinnerAddress] = useState(null);
  const [winnerAddresses, setWinnerAddresses] = useState({});
  const [gameStateTimeout, setGameStateTimeout] = useState(false);
  const [viewResults, setViewResults] = useState(false);
  const hasCelebratedRef = useRef(false);

  // Timeout if game state doesn't arrive
  useEffect(() => {
    if (connected && !gameState && party?.status === 'ACTIVE') {
      const timeout = setTimeout(() => {
        console.warn('⚠️ Game state timeout - connected but no game state received after 5 seconds');
        setGameStateTimeout(true);
      }, 5000);
      
      return () => clearTimeout(timeout);
    } else {
      setGameStateTimeout(false);
    }
  }, [connected, gameState, party?.status]);

  // Confetti animation on game end (old - keeping for backward compatibility)
  useEffect(() => {
    if (party?.status === 'ENDED' || gameState?.phase === 'ENDED') {
      confetti({
        spread: 70,
        origin: { y: 0.6 }
      });
    }
  }, [party?.status, gameState?.phase]);

  // Celebration effects for Game Over Modal (confetti + victory sound)
  useEffect(() => {
    // Calculate if modal should be shown (same logic as showGameOverModal definition)
    const isGameEnded = gameState?.phase === 'ENDED' || party?.status === 'ENDED';
    const shouldShowModal = isGameEnded && !viewResults;
    
    if (shouldShowModal && !hasCelebratedRef.current) {
      // Small delay to ensure modal is rendered first
      const timer = setTimeout(() => {
        // Trigger confetti with enhanced settings for better visibility
        confetti({
          particleCount: 150,
          spread: 100,
          origin: { y: 0.6 },
          colors: ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8'],
          startVelocity: 30,
          gravity: 0.8,
        });
        
        // Play victory sound
        playVictory();
        
        // Mark as celebrated to prevent multiple triggers
        hasCelebratedRef.current = true;
      }, 100);
      
      return () => clearTimeout(timer);
    }
    
    // Reset celebration flag when modal closes
    if (!shouldShowModal) {
      hasCelebratedRef.current = false;
    }
  }, [gameState?.phase, party?.status, viewResults, playVictory]);

  // Function to trigger confetti
  const triggerConfetti = () => {
    confetti({
      spread: 70,
      origin: { y: 0.6 }
    });
  };

  // Fetch user names
  useEffect(() => {
    const fetchUserNames = async () => {
      // Collect user IDs from all possible sources to ensure persistence
      const allUserIds = new Set();

      // 1. From participants
      if (participants && participants.length > 0) {
        participants.forEach(p => {
          if (p.id) allUserIds.add(p.id);
        });
      }

      // 2. From game state
      if (gameState) {
        if (gameState.currentPlayerId) allUserIds.add(gameState.currentPlayerId);
        if (gameState.currentVictim) allUserIds.add(gameState.currentVictim);
        
        // From turn order and queue
        if (gameState.turnOrder && Array.isArray(gameState.turnOrder)) {
          gameState.turnOrder.forEach(id => {
            if (id) allUserIds.add(id);
          });
        }
        if (gameState.turnQueue && Array.isArray(gameState.turnQueue)) {
          gameState.turnQueue.forEach(id => {
            if (id) allUserIds.add(id);
          });
        }
        
        // From unwrapped gifts (owners)
        if (gameState.unwrappedGifts) {
          const unwrappedMap = new Map(gameState.unwrappedGifts);
          unwrappedMap.forEach((giftData) => {
            if (giftData?.ownerId) allUserIds.add(giftData.ownerId);
            if (giftData?.lastOwnerId) allUserIds.add(giftData.lastOwnerId);
          });
        }
        
        // From game history (all players who participated)
        if (gameState.history && Array.isArray(gameState.history)) {
          gameState.history.forEach((event) => {
            if (event.playerId) allUserIds.add(event.playerId);
            if (event.previousOwnerId) allUserIds.add(event.previousOwnerId);
          });
        }
      }

      // 3. From party game history (if available)
      if (party?.gameHistory && Array.isArray(party.gameHistory)) {
        party.gameHistory.forEach((event) => {
          if (event.playerId) allUserIds.add(event.playerId);
          if (event.previousOwnerId) allUserIds.add(event.previousOwnerId);
        });
      }

      // 4. From gifts (winners)
      if (gifts && Array.isArray(gifts)) {
        gifts.forEach((gift) => {
          if (gift.winnerId) allUserIds.add(gift.winnerId);
        });
      }

      const userIdsArray = Array.from(allUserIds).filter(Boolean);
      
      if (userIdsArray.length === 0) {
        // Don't clear existing names if we have no IDs to fetch
        return;
      }

      try {
        const response = await apiRequest('/api/users/batch', {
          method: 'POST',
          body: JSON.stringify({ userIds: userIdsArray }),
        });
        
        if (response.users) {
          // Merge with existing names to preserve them
          setUserNames(prev => ({ ...prev, ...response.users }));
        }
        if (response.emails) {
          // Merge with existing emails to preserve them
          setUserEmails(prev => ({ ...prev, ...response.emails }));
        }
      } catch (error) {
        console.error('Error fetching user names:', error);
      }
    };

    fetchUserNames();
  }, [gameState, participants, party?.gameHistory, gifts]);

  // Scroll active player into view
  useEffect(() => {
    if (activePlayerRef.current && gameState?.currentPlayerId) {
      activePlayerRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center'
      });
    }
  }, [gameState?.currentPlayerId]);

  // Play turn notification sound when it becomes user's turn
  useEffect(() => {
    if (!gameState || !connected) return;
    
    const isMyTurn = gameState.currentPlayerId === user?.uid;
    const wasMyTurn = prevIsMyTurnRef.current;
    
    // Only play sound when transitioning from not my turn to my turn
    if (isMyTurn && !wasMyTurn && gameState?.phase === 'ACTIVE') {
      playTurnNotification();
    }
    
    prevIsMyTurnRef.current = isMyTurn;
  }, [gameState?.currentPlayerId, user?.uid, gameState?.phase, connected, playTurnNotification]);

  // Listen for action_started events to trigger reveal animations and auto-scroll
  // CRITICAL: Only trigger "Drumroll" animation for PICK (Unwrap) events, not STEAL
  useEffect(() => {
    if (!socket || !connected) return;

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
  }, [socket, connected]);

  // Listen for game actions to play appropriate sounds
  useEffect(() => {
    if (!socket || !connected) return;

    socket.on('game-updated', (updatedState) => {
      // Check activities for recent actions
      if (updatedState?.history && Array.isArray(updatedState.history)) {
        const lastActivity = updatedState.history[updatedState.history.length - 1];
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
  }, [socket, connected, playSteal, playUnwrap]);

  // Check if game is ended from party status - if so, show ended screen using Firestore data
  if (party?.status === 'ENDED') {
    // Use gifts with winnerId from Firestore (persisted when game ended)
    // Ensure each person only shows ONE gift they won (enforce one gift per winner rule)
    const allEndedGifts = gifts.filter(g => g.winnerId);
    const winnerGiftMap = new Map();
    
    // Build map of winnerId -> gift (only keep FIRST gift per winner to enforce one-per-person)
    allEndedGifts.forEach(gift => {
      if (gift.winnerId && !winnerGiftMap.has(gift.winnerId)) {
        winnerGiftMap.set(gift.winnerId, gift);
      }
    });
    
    // Identify the user's prize and obligation
    const myPrize = winnerGiftMap.get(user?.uid); // Gift where winnerId === user?.uid
    const myObligation = allEndedGifts.find(g => g.submitterId === user?.uid); // Gift where submitterId === user?.uid
    const isSelfWin = myPrize?.id === myObligation?.id; // Check if user won their own gift
    
    // Use the same ended screen content below
    const getWinnerName = (ownerId) => {
      if (!ownerId) return 'No Winner';
      if (ownerId === user?.uid) return 'You';
      return userNames[ownerId] || userEmails[ownerId] || `User ${ownerId.slice(0, 8)}`;
    };

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
                  winnerId={myObligation.winnerId}
                  winnerName={getWinnerName(myObligation.winnerId)}
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
              <p className="text-gray-500 text-lg">No gifts assigned to you this game.</p>
            </div>
          )}

          {/* Final Results: What Everyone Won */}
          {(() => {
            const history = party?.gameHistory || [];
            const finalResults = [];
            
            // Build a map of giftId -> how they got it (from whom or "picked")
            const giftSourceMap = new Map();
            
            // Process history to determine how each gift was obtained
            history.forEach((event) => {
              if (event.type === 'PICK') {
                giftSourceMap.set(event.giftId, { type: 'picked', from: null });
              } else if (event.type === 'STEAL') {
                giftSourceMap.set(event.giftId, { 
                  type: 'stolen', 
                  from: event.previousOwnerId 
                });
              }
            });
            
            // Build a comprehensive map of all final ownership
            // First, use winnerGiftMap (from winnerId in Firestore)
            const allFinalOwnership = new Map(winnerGiftMap);
            
            // Also check gameState unwrappedGifts if available to catch any missing players
            if (gameState?.unwrappedGifts) {
              const unwrappedMapFromState = new Map(
                Array.isArray(gameState.unwrappedGifts) 
                  ? (gameState.unwrappedGifts[0] && Array.isArray(gameState.unwrappedGifts[0])
                      ? gameState.unwrappedGifts
                      : [])
                  : []
              );
              
              unwrappedMapFromState.forEach((giftData, giftId) => {
                if (giftData?.ownerId) {
                  // Only add if we don't already have this player in the map
                  if (!allFinalOwnership.has(giftData.ownerId)) {
                    // Find the gift object from the gifts array
                    const gift = gifts.find(g => g.id === giftId);
                    if (gift) {
                      allFinalOwnership.set(giftData.ownerId, gift);
                    }
                  }
                }
              });
            }
            
            // Build final results for each player
            allFinalOwnership.forEach((gift, winnerId) => {
              const source = giftSourceMap.get(gift.id);
              const winnerName = getWinnerName(winnerId);
              const sourceName = source?.from 
                ? getWinnerName(source.from)
                : null;
              
              finalResults.push({
                playerId: winnerId,
                playerName: winnerName,
                gift: gift,
                source: source,
                sourceName: sourceName,
              });
            });
            
            // Sort by player name for consistent display
            finalResults.sort((a, b) => a.playerName.localeCompare(b.playerName));
            
            return finalResults.length > 0 ? (
              <div className="mb-12">
                <div className="flex items-center gap-3 mb-6">
                  <div className="bg-purple-500/20 text-purple-300 ring-1 ring-purple-500/50 p-3 rounded-full">
                    <svg className="w-8 h-8 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                    </svg>
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-6">Final Results</h2>
                </div>
                <div className="bg-slate-800/40 border border-white/5 backdrop-blur-sm rounded-lg overflow-hidden">
                  <div className="divide-y divide-white/5">
                    {finalResults.map((result) => (
                      <div key={result.playerId} className="p-4 hover:bg-white/5 transition-colors">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-4 flex-1 min-w-0">
                            <div className="flex-shrink-0">
                              <div className="w-12 h-12 rounded-lg overflow-hidden bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center">
                                {result.gift.image ? (
                                  <img
                                    src={result.gift.image}
                                    alt={result.gift.title || 'Gift'}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      e.target.style.display = 'none';
                                    }}
                                  />
                                ) : (
                                  <GiftIcon className="w-6 h-6 text-white opacity-50" />
                                )}
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-semibold text-white truncate">
                                  {result.playerName}
                                </span>
                                <span className="text-slate-400">won</span>
                                <span className="font-medium text-indigo-300 truncate">
                                  {result.gift.title || 'Gift'}
                                </span>
                              </div>
                              <div className="text-sm text-slate-400">
                                {result.source?.type === 'picked' ? (
                                  <span className="flex items-center gap-1">
                                    <span>🎁</span>
                                    <span>Fresh from the pile!</span>
                                  </span>
                                ) : result.source?.from ? (
                                  <span className="flex items-center gap-1">
                                    <span>⚡</span>
                                    <span>Stolen from {result.sourceName}</span>
                                  </span>
                                ) : (
                                  <span className="text-slate-500">Unknown source</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null;
          })()}

          {/* Game Audit Trail */}
          <GameAuditTrail
            history={party?.gameHistory || []}
            gifts={gifts}
            userNames={userNames}
            userEmails={userEmails}
          />

          {/* Developer Simulation Controls (includes Audit Trail & Reset) - Only visible when ?sim=true */}
          <SimulationControls socket={socket} partyId={partyId} gameState={gameState} />

          {/* Navigation Button */}
          <button
            onClick={() => navigate('/')}
            className="text-slate-400 hover:text-white flex items-center gap-2 mx-auto mt-12 mb-8 transition-colors"
          >
            <ArrowLeftIcon className="w-5 h-5" />
            Back to Dashboard
          </button>
        </div>

        {/* Reaction Bar - Fixed at bottom for sending reactions */}
        {socket && connected && <ReactionBar onReaction={emitReaction} />}
        
        {selectedGift && (
          <AddressModal
            isOpen={showAddressModal}
            onClose={() => {
              setShowAddressModal(false);
              setSelectedGift(null);
            }}
            giftTitle={selectedGift.title || 'Your Gift'}
          />
        )}
      </>
    );
  }

  // Debug logging
  console.log('GameBoard render:', {
    partyId,
    connected,
    hasGameState: !!gameState,
    gameStatePhase: gameState?.phase,
    partyStatus: party?.status,
    hasParty: !!party
  });

  if (!connected || !gameState) {
    console.log('GameBoard: Waiting for connection or gameState', { connected, hasGameState: !!gameState, gameStateTimeout });
    
    if (gameStateTimeout) {
      const isAdmin = party?.adminId === user?.uid;
      return (
        <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-900 via-slate-900 to-black py-12">
          <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
            <h2 className="text-2xl font-bold mb-4 text-red-600">Game State Missing</h2>
            <p className="text-gray-600 mb-4">
              The game state could not be loaded. This usually happens when the game state has expired from server memory (after 24 hours) or the server was restarted.
            </p>
            {isAdmin && (
              <p className="text-sm text-gray-500 mb-6">
                As the party admin, you can reset the party status back to Lobby to start a new game.
              </p>
            )}
            <div className="flex flex-col gap-3">
              <Button
                onClick={() => window.location.reload()}
                className="w-full"
              >
                Retry
              </Button>
              {isAdmin && (
                <Button
                  onClick={async () => {
                    try {
                      await updateDoc(doc(db, 'parties', partyId), {
                        status: 'LOBBY',
                        updatedAt: new Date(),
                      });
                      window.location.reload();
                    } catch (error) {
                      console.error('Error resetting party status:', error);
                      alert('Failed to reset party status: ' + error.message);
                    }
                  }}
                  className="w-full bg-yellow-500 hover:bg-yellow-600"
                >
                  Reset Party to Lobby
                </Button>
              )}
              <Button
                onClick={() => navigate('/')}
                className="w-full bg-gray-500 hover:bg-gray-600"
              >
                Go Home
              </Button>
            </div>
          </div>
        </div>
      );
    }
    
    return (
      <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-900 via-slate-900 to-black">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mb-4"></div>
          <p className="text-white text-lg">Connecting to game...</p>
          {!connected && (
          <div className="text-center mt-4">
            <p className="text-gray-400 text-sm mb-2">Establishing socket connection...</p>
            {connectionError && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2 text-sm text-red-300 max-w-md mx-auto">
                <p className="font-semibold mb-1">Connection Error</p>
                <p className="text-xs">{connectionError}</p>
                <p className="text-xs mt-2 text-gray-400">
                  Server URL: {import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'}
                </p>
              </div>
            )}
          </div>
        )}
          {connected && !gameState && <p className="text-gray-400 text-sm mt-2">Waiting for game state...</p>}
        </div>
      </div>
    );
  }

  // Check if game is ended from either gameState phase or party status
  const isGameEndedFromState = gameState?.phase === 'ENDED' || party?.status === 'ENDED';
  const { currentPlayerId, wrappedGifts, unwrappedGifts, turnAction } = gameState || {};
  const phase = gameState?.phase || (party?.status === 'ENDED' ? 'ENDED' : party?.status === 'ACTIVE' ? 'ACTIVE' : 'LOBBY');
  const unwrappedMap = new Map(unwrappedGifts || []);
  const turnActionMap = new Map(turnAction || []);

  // Limit gifts to number of players (one gift per player)
  // Get the number of players from turnOrder (actual players in game) or going participants
  const numPlayers = gameState?.turnOrder?.length || participants.filter(p => p.status === 'GOING').length;
  
  // Separate gifts into wrapped and unwrapped, limited to numPlayers
  const allWrappedGifts = gifts.filter((g) => wrappedGifts.includes(g.id));
  const allUnwrappedGifts = gifts.filter((g) => unwrappedMap.has(g.id));
  
  // Only show as many gifts as players (no more)
  const wrappedGiftList = allWrappedGifts.slice(0, numPlayers);
  const unwrappedGiftList = allUnwrappedGifts.slice(0, numPlayers);

  const currentAction = turnActionMap.get(currentPlayerId);
  const isAdmin = party?.adminId === user?.uid;

  // Calculate rounds/turns remaining
  const calculateRoundsRemaining = () => {
    if (!gameState || phase === 'ENDED') return { roundsRemaining: 0, totalRounds: 0, currentRound: 0 };
    
    const { turnQueue, currentTurnIndex, stealStack, isBoomerangPhase, config } = gameState;
    
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

  // Check if all unwrapped gifts are frozen
  const allGiftsFrozen = unwrappedGiftList.length > 0 && unwrappedGiftList.every((gift) => {
    const giftData = unwrappedMap.get(gift.id);
    return giftData?.isFrozen === true;
  });

  // Check if this is Player 1's Final Turn (bookend exception)
  // Per GAME_RULES.md Rule 1 Exception 1: Player 1 can act on their final turn even if they have a gift
  const isLastIndex = gameState?.currentTurnIndex === ((gameState?.turnQueue?.length || 0) - 1);
  const isPlayer1 = gameState?.turnOrder && gameState.turnOrder[0] === user?.uid;
  const isPlayer1FinalTurn = isLastIndex && isPlayer1;
  const isBoomerangPhase = gameState?.isBoomerangPhase || 
    (gameState?.currentTurnIndex >= (gameState?.turnOrder?.length || 0));
  
  // Check if player has a gift
  const playerHasGift = unwrappedGiftList.some((gift) => {
    const giftData = unwrappedMap.get(gift.id);
    return giftData?.ownerId === user?.uid;
  });
  
  const canPick = currentAction === null && wrappedGifts.length > 0 && 
    (!playerHasGift || wrappedGifts.length > 0 || isPlayer1FinalTurn);
  
  const canSteal = (giftId) => {
    if (currentAction !== null) return false; // Already acted this turn
    const gift = unwrappedMap.get(giftId);
    if (!gift) return false;
    if (gift.isFrozen) return false;
    if (gift.ownerId === user?.uid) return false; // Can't steal your own gift
    
    // RULE 4: Immediate Steal-Back Prevention (U-Turn Rule) - Updated
    // Per GAME_RULES.md Rule 4: "A player CANNOT steal a gift that was just stolen from them on the SAME turn"
    // Once the turn advances, players CAN steal back gifts they lost
    // Note: lastOwnerId is cleared when turns advance, so this check only prevents immediate steal-back
    if (gift.lastOwnerId === user?.uid) {
      return false; // Can't steal back a gift immediately after losing it on the same turn
    }
    
    // RULE 9: Wrapped Gift Claiming (Unwrap Before Final Turn)
    // Per GAME_RULES.md Rule 9: All wrapped gifts SHOULD be unwrapped before Player 1's final turn
    // The system encourages picking wrapped gifts but does not block stealing
    // Players have the freedom to choose their strategy
    // Note: Client-side blocking removed - players can choose to steal even if wrapped gifts remain
    // The UI may show a hint/reminder to pick wrapped gifts, but stealing is allowed
    
    // RULE 1: One Gift Per Person (Double-Dip Prevention)
    // In Standard Phase, players with gifts cannot steal UNLESS:
    // - Exception 1: Player 1's Final Turn (bookend exception) - Per GAME_RULES.md Rule 1
    // - Exception 2: Boomerang Phase (players can swap)
    if (playerHasGift && !isBoomerangPhase && !isPlayer1FinalTurn) {
      return false; // Player has a gift and it's not Player 1's final turn
    }
    
    return true;
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
      if (data.success) {
        // Game ended, state will update via socket
        console.log('Game ended successfully');
      } else {
        alert('Failed to end game: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error ending game:', error);
      alert('Failed to end game: ' + error.message);
    }
  };

  // Show ended screen if party is ended or gameState phase is ENDED
  // BUT only if viewResults is true (gate to prevent jarring transition)
  if ((isGameEndedFromState || phase === 'ENDED') && viewResults) {
    const getWinnerName = (ownerId) => {
      if (!ownerId) return 'No Winner';
      if (ownerId === user?.uid) return 'You';
      return userNames[ownerId] || userEmails[ownerId] || `User ${ownerId.slice(0, 8)}`;
    };

    // When game is ended, use gift.winnerId from Firestore OR unwrappedMap from gameState
    const allEndedGifts = !unwrappedGiftList.length 
      ? gifts.filter(g => g.winnerId)  // Use Firestore winnerId if no gameState
      : unwrappedGiftList;  // Use unwrapped gifts from gameState
    
    // Build a map to ensure each winner only gets ONE gift (first one encountered)
    const winnerToGiftMap = new Map();
    allEndedGifts.forEach((gift) => {
      const winnerId = gift.winnerId || unwrappedMap.get(gift.id)?.ownerId;
      if (winnerId && !winnerToGiftMap.has(winnerId)) {
        winnerToGiftMap.set(winnerId, gift);
      }
    });
    
    // Identify the user's prize and obligation
    const myPrize = winnerToGiftMap.get(user?.uid); // Gift where winnerId === user?.uid
    const myObligation = allEndedGifts.find((gift) => gift.submitterId === user?.uid); // Gift where submitterId === user?.uid
    const isSelfWin = myPrize?.id === myObligation?.id; // Check if user won their own gift

    return (
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
                winnerId={myObligation.winnerId || unwrappedMap.get(myObligation.id)?.ownerId}
                winnerName={getWinnerName(myObligation.winnerId || unwrappedMap.get(myObligation.id)?.ownerId)}
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

        {/* Final Results: What Everyone Won */}
        {(() => {
          const history = party?.gameHistory || gameState?.history || [];
          const finalResults = [];
          
          // Build a map of giftId -> how they got it (from whom or "picked")
          const giftSourceMap = new Map();
          
          // Process history to determine how each gift was obtained
          history.forEach((event) => {
            if (event.type === 'PICK') {
              giftSourceMap.set(event.giftId, { type: 'picked', from: null });
            } else if (event.type === 'STEAL') {
              giftSourceMap.set(event.giftId, { 
                type: 'stolen', 
                from: event.previousOwnerId 
              });
            }
          });
          
          // Build a comprehensive map of all final ownership
          // First, use winnerToGiftMap (from winnerId in Firestore)
          const allFinalOwnership = new Map(winnerToGiftMap);
          
          // Also check unwrappedGifts from gameState to catch any missing players
          if (unwrappedMap && unwrappedMap.size > 0) {
            unwrappedMap.forEach((giftData, giftId) => {
              if (giftData?.ownerId) {
                // Only add if we don't already have this player in the map
                if (!allFinalOwnership.has(giftData.ownerId)) {
                  // Find the gift object from the gifts array
                  const gift = gifts.find(g => g.id === giftId);
                  if (gift) {
                    allFinalOwnership.set(giftData.ownerId, gift);
                  }
                }
              }
            });
          }
          
          // Build final results for each player
          allFinalOwnership.forEach((gift, winnerId) => {
            const source = giftSourceMap.get(gift.id);
            const winnerName = getWinnerName(winnerId);
            const sourceName = source?.from 
              ? getWinnerName(source.from)
              : null;
            
            finalResults.push({
              playerId: winnerId,
              playerName: winnerName,
              gift: gift,
              source: source,
              sourceName: sourceName,
            });
          });
          
          // Sort by player name for consistent display
          finalResults.sort((a, b) => a.playerName.localeCompare(b.playerName));
          
          return finalResults.length > 0 ? (
            <div className="mb-12">
              <div className="flex items-center gap-3 mb-6">
                <div className="bg-purple-500/20 text-purple-300 ring-1 ring-purple-500/50 p-3 rounded-full">
                  <svg className="w-8 h-8 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-white mb-6">Final Results</h2>
              </div>
              <div className="bg-slate-800/40 border border-white/5 backdrop-blur-sm rounded-lg overflow-hidden">
                <div className="divide-y divide-white/5">
                  {finalResults.map((result) => (
                    <div key={result.playerId} className="p-4 hover:bg-white/5 transition-colors">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <div className="flex-shrink-0">
                            <div className="w-12 h-12 rounded-lg overflow-hidden bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center">
                              {result.gift.image ? (
                                <img
                                  src={result.gift.image}
                                  alt={result.gift.title || 'Gift'}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                  }}
                                />
                              ) : (
                                <GiftIcon className="w-6 h-6 text-white opacity-50" />
                              )}
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold text-white truncate">
                                {result.playerName}
                              </span>
                              <span className="text-slate-400">won</span>
                              <span className="font-medium text-indigo-300 truncate">
                                {result.gift.title || 'Gift'}
                              </span>
                            </div>
                            <div className="text-sm text-slate-400">
                              {result.source?.type === 'picked' ? (
                                <span className="flex items-center gap-1">
                                  <span>🎁</span>
                                  <span>Fresh from the pile!</span>
                                </span>
                              ) : result.source?.from ? (
                                <span className="flex items-center gap-1">
                                  <span>⚡</span>
                                  <span>Stolen from {result.sourceName}</span>
                                </span>
                              ) : (
                                <span className="text-slate-500">Unknown source</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null;
        })()}

        {/* Game Audit Trail */}
        <GameAuditTrail
          history={party?.gameHistory || gameState?.history || []}
          gifts={gifts}
          userNames={userNames}
          userEmails={userEmails}
        />

        {/* Developer Simulation Controls (includes Audit Trail & Reset) - Only visible when ?sim=true */}
        <SimulationControls socket={socket} partyId={partyId} gameState={gameState} />

        {/* Navigation Button */}
        <button
          onClick={() => navigate('/')}
          className="text-slate-400 hover:text-white flex items-center gap-2 mx-auto mt-12 mb-8 transition-colors"
        >
          <ArrowLeftIcon className="w-5 h-5" />
          Back to Dashboard
        </button>
        
        {/* Shipping Address Modal (for winners) */}
        {selectedGift && (
          <AddressModal
            isOpen={showAddressModal}
            onClose={() => {
              setShowAddressModal(false);
              setSelectedGift(null);
            }}
            giftTitle={selectedGift.title || 'Your Gift'}
          />
        )}
        
        {/* Shipping Address View Modal (for submitters) */}
        {selectedWinnerAddress && (
          <ShippingAddressViewModal
            isOpen={showAddressViewModal}
            onClose={() => {
              setShowAddressViewModal(false);
              setSelectedWinnerAddress(null);
            }}
            winnerId={selectedWinnerAddress.winnerId}
            winnerName={selectedWinnerAddress.winnerName}
            giftTitle={selectedWinnerAddress.giftTitle}
          />
        )}
      </div>
    );
  }

  const getCurrentPlayerName = () => {
    if (!currentPlayerId) {
      // Try to get player from turnQueue if available
      if (gameState?.turnQueue && gameState?.currentTurnIndex >= 0 && gameState.currentTurnIndex < gameState.turnQueue.length) {
        const fallbackPlayerId = gameState.turnQueue[gameState.currentTurnIndex];
        if (fallbackPlayerId) {
          if (fallbackPlayerId === user?.uid) return 'Your Turn!';
          return userNames[fallbackPlayerId] || userEmails[fallbackPlayerId] || `Player ${fallbackPlayerId.slice(0, 8)}`;
        }
      }
      // If still no player, check if game should have ended
      if (phase === 'ENDED' || gameState?.phase === 'ENDED') {
        return 'Game Ended';
      }
      return 'Syncing...';
    }
    if (currentPlayerId === user?.uid) return 'Your Turn!';
    return userNames[currentPlayerId] || userEmails[currentPlayerId] || `Player ${currentPlayerId.slice(0, 8)}`;
  };

  // Game Over Modal - Show when game ends but viewResults is false
  const showGameOverModal = (isGameEndedFromState || phase === 'ENDED') && !viewResults;

  return (
    <>
      {/* Reaction Overlay - Full screen layer for flying emojis */}
      {socket && <ReactionOverlay socket={socket} />}
      
      {/* Game Over Victory Modal - Overlay on top of game board */}
      {showGameOverModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
          <div className="bg-gradient-to-br from-purple-900/95 via-indigo-900/95 to-slate-900/95 backdrop-blur-xl border-2 border-white/20 rounded-3xl p-8 max-w-2xl w-full shadow-2xl animate-fade-in">
            <div className="text-center">
              <div className="text-8xl mb-6 animate-bounce">🎉</div>
              <h2 className="text-5xl font-bold mb-4 bg-gradient-to-r from-yellow-300 via-white to-purple-300 bg-clip-text text-transparent">
                That's a Wrap! 🥂
              </h2>
              <p className="text-xl text-slate-300 mb-8">
                All gifts have been claimed.
              </p>
              <button
                onClick={() => setViewResults(true)}
                className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-lg px-12 py-4 rounded-full shadow-[0_0_20px_rgba(168,85,247,0.6)] hover:shadow-[0_0_30px_rgba(168,85,247,0.8)] transform hover:scale-105 transition-all duration-300 animate-pulse"
              >
                View Final Results →
              </button>
            </div>
          </div>
        </div>
      )}
      
      <div className="max-w-6xl mx-auto p-6 pt-24">
        {/* Unified HUD Container */}
        <div className="w-full max-w-5xl mx-auto mb-8 p-4 rounded-2xl bg-slate-900/60 backdrop-blur-xl border border-white/10 grid grid-cols-1 md:grid-cols-[auto_minmax(0,1fr)_350px] gap-6 items-center">
          {/* Left Section: Game Status */}
          <div className="flex flex-col gap-2 items-start flex-shrink-0 min-w-[200px]">
            {/* Rounds Remaining */}
            {phase === 'ACTIVE' && (
              <div className="bg-slate-700/50 text-slate-300 border border-white/10 px-3 py-1 rounded-full text-xs font-mono mb-2 inline-block">
                {roundsInfo.roundsRemaining} turn{roundsInfo.roundsRemaining !== 1 ? 's' : ''} remaining
              </div>
            )}
            {/* Boomerang Badge */}
            {(party?.config?.returnToStart || gameState.isBoomerangPhase) && (
              <div className="bg-indigo-500/20 text-indigo-300 text-[10px] uppercase tracking-wider px-2 py-1 rounded-full border border-indigo-500/30">
                {gameState.isBoomerangPhase ? '🔄 Boomerang Round!' : '🔄 Boomerang Rule Active'}
              </div>
            )}
          </div>

          {/* Center Section: Turn Indicator */}
          <div className="text-center min-w-0">
            {currentPlayerId === user?.uid ? (
              <>
                <p className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-white to-purple-300 drop-shadow-[0_0_10px_rgba(255,255,255,0.5)] animate-pulse">
                  Your Turn!
                </p>
                {/* Action Buttons */}
                <div className="mt-4 flex gap-3 justify-center items-center">
                  {/* Skip Turn Button - Always visible when it's your turn */}
                  {!currentAction && (
                    <button
                      onClick={handleEndTurn}
                      className="bg-slate-700 text-white hover:bg-slate-600 hover:scale-105 rounded-full px-6 py-2 font-bold shadow-[0_0_15px_rgba(148,163,184,0.3)] transition-all duration-300 transform"
                      title="Skip your turn and keep your current gift"
                    >
                      Skip Turn
                    </button>
                  )}
                  {/* End Turn Button - Shows after you've acted */}
                  {currentAction && (
                    <button
                      onClick={handleEndTurn}
                      className="bg-white text-indigo-900 hover:bg-indigo-50 hover:scale-105 rounded-full px-8 py-2 font-bold shadow-[0_0_20px_rgba(255,255,255,0.3)] transition-all duration-300 transform animate-fade-in-up"
                    >
                      End Turn
                    </button>
                  )}
                </div>
              </>
            ) : (
              <p className="text-xl text-slate-300 animate-pulse whitespace-nowrap truncate">
                Waiting for <span className="text-white font-semibold truncate">{getCurrentPlayerName()}</span>...
              </p>
            )}
          </div>

          {/* Right Section: Player Queue */}
          {gameState?.turnOrder && gameState.turnOrder.length > 0 && (
            <div className="flex overflow-x-auto gap-2 py-4 max-w-full md:max-w-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] [mask-image:linear-gradient(to_right,transparent_0px,black_40px,black_calc(100%_-_40px),transparent_100%)]">
              <div className="flex gap-2 px-12 items-center">
                {gameState.turnOrder.map((playerId, index) => {
                const isCurrent = playerId === currentPlayerId;
                const playerName = playerId === user?.uid 
                  ? 'You' 
                  : (userNames[playerId] || userEmails[playerId] || (playerId ? `Player ${playerId.slice(0, 8)}` : 'Unknown'));
                const currentPlayerIndex = currentPlayerId ? gameState.turnOrder.indexOf(currentPlayerId) : -1;
                const isPast = gameState.isBoomerangPhase 
                  ? index > currentPlayerIndex
                  : index < currentPlayerIndex;
                
                return (
                  <div
                    key={playerId}
                    ref={isCurrent ? activePlayerRef : null}
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
        {phase === 'ACTIVE' && !isAdmin && allGiftsFrozen && (
          <div className="mb-6">
            <div className="bg-orange-50 border-2 border-orange-300 rounded-lg p-4">
              <p className="text-sm font-semibold text-orange-800 mb-2">
                🎉 All gifts are frozen! Waiting for admin to end the game.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 2-Column Grid Layout: Gifts (Left) | Play-by-Play (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-6 items-start">
        {/* Left Column: Gifts */}
        <div>
          {/* Wrapped Gifts */}
          {wrappedGiftList.length > 0 && (
            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-4 text-white text-center">Wrapped Gifts</h2>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 w-full max-w-7xl mx-auto">
                {wrappedGiftList.map((gift, index) => (
                  <GiftCard
                    key={gift.id}
                    gift={gift}
                    isWrapped={true}
                    compact={true}
                    giftNumber={index + 1}
                    currentPlayerId={currentPlayerId}
                    userId={user?.uid}
                    onPick={pickGift}
                    canPick={canPick}
                    canSteal={false}
                    revealingGiftId={revealingGiftId}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Unwrapped Gifts */}
          {unwrappedGiftList.length > 0 && (
            <div>
              <div className="border-t border-white/5 mt-4 mb-6"></div>
              <div className="flex flex-wrap justify-center gap-6 w-full max-w-7xl mx-auto">
                {unwrappedGiftList.map((gift) => {
                  const giftData = unwrappedMap.get(gift.id);
                  const ownerId = giftData?.ownerId;
                  const getOwnerName = () => {
                    if (!ownerId) return null;
                    if (ownerId === user?.uid) return 'You';
                    return userNames[ownerId] || userEmails[ownerId] || null;
                  };
                  
                  return (
                    <GiftCard
                      key={gift.id}
                      gift={gift}
                      isWrapped={false}
                      ownerId={ownerId}
                      ownerName={getOwnerName()}
                      stealCount={giftData?.stealCount || 0}
                      isFrozen={giftData?.isFrozen || false}
                      currentPlayerId={currentPlayerId}
                      userId={user?.uid}
                      onSteal={stealGift}
                      onEndTurn={handleEndTurn}
                      canPick={false}
                      canSteal={canSteal(gift.id)}
                      revealingGiftId={revealingGiftId}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Play-by-Play Sidebar */}
        {/* Keep visible even when game ends (before viewResults) so players can see final log entries */}
        {(phase === 'ACTIVE' || showGameOverModal) && (
          <div className="lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)] flex flex-col">
            <GamePlayByPlay
              state={{
                status: gameState?.phase === 'ACTIVE' ? 'PLAYING' : gameState?.phase === 'ENDED' ? 'FINISHED' : 'LOBBY',
                turnQueue: gameState?.turnQueue || [],
                currentTurnIndex: gameState?.currentTurnIndex ?? -1,
                pendingVictimId: gameState?.currentVictim || null,
                activePlayerId: gameState?.currentPlayerId || null,
                gifts: gifts.reduce((acc, g) => ({ ...acc, [g.id]: g }), {}),
                activities: gameState?.history || [],
                gameState: gameState,
              }}
              userNames={userNames}
              userEmails={userEmails}
            />
          </div>
        )}
      </div>

      {/* Reaction Bar - Fixed at bottom for sending reactions */}
      {socket && connected && <ReactionBar onReaction={emitReaction} />}

      {/* Developer Simulation Controls - Only visible when ?sim=true */}
      <SimulationControls socket={socket} partyId={partyId} gameState={gameState} />

      {/* Simple Game Footer - Only Report a Bug link */}
      <GameFooter />
    </>
  );
}

