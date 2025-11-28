/**
 * Game Board Component
 */
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
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
import { ReactionBar } from './ReactionBar.jsx';
import { ReactionOverlay } from './ReactionOverlay.jsx';
import { apiRequest } from '../utils/api.js';
import { trackGameAction } from '../utils/analytics.js';

export function GameBoard({ partyId }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { gameState, pickGift, stealGift, endTurn, connected, socket, emitReaction } = useGameSocket(partyId);
  const { gifts, participants, party } = useParty(partyId);
  const { playTurnNotification, playSteal, playUnwrap } = useGameSounds();
  const [userNames, setUserNames] = useState({});
  const [userEmails, setUserEmails] = useState({});
  const prevIsMyTurnRef = useRef(false);
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [selectedGift, setSelectedGift] = useState(null);
  const [showAddressViewModal, setShowAddressViewModal] = useState(false);
  const [selectedWinnerAddress, setSelectedWinnerAddress] = useState(null);
  const [winnerAddresses, setWinnerAddresses] = useState({});

  // Confetti animation on game end
  useEffect(() => {
    if (party?.status === 'ENDED' || gameState?.phase === 'ENDED') {
      confetti({
        spread: 70,
        origin: { y: 0.6 }
      });
    }
  }, [party?.status, gameState?.phase]);

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
      if (!gameState || participants.length === 0) {
        setUserNames({});
        setUserEmails({});
        return;
      }

      try {
        // Get all unique user IDs from participants and game state
        const allUserIds = [...new Set([
          ...participants.map(p => p.id),
          gameState.currentPlayerId,
          ...Array.from(new Map(gameState.unwrappedGifts || []).values()).map(g => g.ownerId)
        ].filter(Boolean))];

        if (allUserIds.length === 0) return;

        const response = await apiRequest('/api/users/batch', {
          method: 'POST',
          body: JSON.stringify({ userIds: allUserIds }),
        });
        
        if (response.users) {
          setUserNames(response.users);
        }
        if (response.emails) {
          setUserEmails(response.emails);
        }
      } catch (error) {
        console.error('Error fetching user names:', error);
      }
    };

    fetchUserNames();
  }, [gameState, participants]);

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
                    {myPrize.image && (
                      <img
                        src={myPrize.image}
                        alt={myPrize.title || 'Gift'}
                        className="w-32 h-32 object-cover rounded-lg shadow-md"
                        onError={(e) => {
                          e.target.style.display = 'none';
                        }}
                      />
                    )}
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

          {/* Game Audit Trail */}
          <GameAuditTrail
            history={party?.gameHistory || []}
            gifts={gifts}
            userNames={userNames}
            userEmails={userEmails}
          />

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

  if (!connected || !gameState) {
    return (
      <div className="p-8 text-center">
        <p>Connecting to game...</p>
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
    
    const { turnOrder, currentPlayerId, stealStack, isBoomerangPhase, config } = gameState;
    const currentIndex = turnOrder.indexOf(currentPlayerId);
    const totalPlayers = turnOrder.length;
    
    if (isBoomerangPhase) {
      // In boomerang: remaining players from current index down to 0 (plus current player)
      const remainingInBoomerang = currentIndex + 1; // +1 includes current player
      return {
        roundsRemaining: remainingInBoomerang + (stealStack?.length || 0),
        totalRounds: totalPlayers * 2, // Normal round + boomerang round
        currentRound: 2,
        phase: 'boomerang'
      };
    } else {
      // Normal phase: remaining players from current index to end
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

  // Check if all unwrapped gifts are frozen
  const allGiftsFrozen = unwrappedGiftList.length > 0 && unwrappedGiftList.every((gift) => {
    const giftData = unwrappedMap.get(gift.id);
    return giftData?.isFrozen === true;
  });

  const canPick = currentAction === null && wrappedGifts.length > 0;
  const canSteal = (giftId) => {
    if (currentAction !== null) return false;
    const gift = unwrappedMap.get(giftId);
    if (!gift) return false;
    if (gift.isFrozen) return false;
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
  if (isGameEndedFromState || phase === 'ENDED') {
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
                  {myPrize.image && (
                    <img
                      src={myPrize.image}
                      alt={myPrize.title || 'Gift'}
                      className="w-32 h-32 object-cover rounded-lg shadow-md"
                      onError={(e) => {
                        e.target.style.display = 'none';
                      }}
                    />
                  )}
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

        {/* Game Audit Trail */}
        <GameAuditTrail
          history={party?.gameHistory || gameState?.history || []}
          gifts={gifts}
          userNames={userNames}
          userEmails={userEmails}
        />

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
    if (currentPlayerId === user?.uid) return 'Your Turn!';
    return userNames[currentPlayerId] || userEmails[currentPlayerId] || `Player ${currentPlayerId.slice(0, 8)}`;
  };

  return (
    <>
      {/* Reaction Overlay - Full screen layer for flying emojis */}
      {socket && <ReactionOverlay socket={socket} />}
      
      <div className="max-w-6xl mx-auto p-6 pt-24">
        {/* Unified HUD Container */}
        <div className="w-full max-w-5xl mx-auto mb-8 p-4 rounded-2xl bg-slate-900/60 backdrop-blur-xl border border-white/10 flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Left Section: Game Status */}
          <div className="flex flex-col gap-2 items-start">
            {/* Rounds Remaining */}
            {phase === 'ACTIVE' && (
              <div className="text-slate-400 text-sm font-mono">
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
          <div className="flex-1 text-center">
            {currentPlayerId === user?.uid ? (
              <p className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-white to-purple-300 drop-shadow-[0_0_10px_rgba(255,255,255,0.5)] animate-pulse">
                Your Turn!
              </p>
            ) : (
              <p className="text-xl text-slate-300 animate-pulse">
                Waiting for <span className="text-white font-semibold">{getCurrentPlayerName()}</span>...
              </p>
            )}
          </div>

          {/* Right Section: Player Queue */}
          {gameState?.turnOrder && gameState.turnOrder.length > 0 && (
            <div className="flex overflow-x-auto gap-2 pb-2 max-w-full md:max-w-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              {gameState.turnOrder.map((playerId, index) => {
                const isCurrent = playerId === currentPlayerId;
                const playerName = playerId === user?.uid 
                  ? 'You' 
                  : (userNames[playerId] || userEmails[playerId] || `Player ${playerId.slice(0, 8)}`);
                const isPast = gameState.isBoomerangPhase 
                  ? index > gameState.turnOrder.indexOf(currentPlayerId)
                  : index < gameState.turnOrder.indexOf(currentPlayerId);
                
                return (
                  <div
                    key={playerId}
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

      {/* Wrapped Gifts */}
      {wrappedGiftList.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold mb-4 text-white">Wrapped Gifts</h2>
          <div className="flex flex-wrap justify-center gap-6 w-full max-w-7xl mx-auto">
            {wrappedGiftList.map((gift) => (
              <GiftCard
                key={gift.id}
                gift={gift}
                isWrapped={true}
                currentPlayerId={currentPlayerId}
                userId={user?.uid}
                onPick={pickGift}
                canPick={canPick}
                canSteal={false}
              />
            ))}
          </div>
        </div>
      )}

      {/* Unwrapped Gifts */}
      {unwrappedGiftList.length > 0 && (
        <div>
          <div className="border-t border-white/5 mt-8 mb-6"></div>
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
                  canPick={false}
                  canSteal={canSteal(gift.id)}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* End Turn Button */}
      {currentAction && (
        <div className="mt-6 text-center w-full max-w-xs mx-auto">
          <Button onClick={endTurn} variant="primary" className="px-8 shadow-lg shadow-blue-500/30">
            End Turn
          </Button>
        </div>
      )}

      {/* Reaction Bar - Fixed at bottom for sending reactions */}
      {socket && connected && <ReactionBar onReaction={emitReaction} />}
    </>
  );
}

