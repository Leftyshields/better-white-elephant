/**
 * Game Board Component
 */
import { useState, useEffect } from 'react';
import { useGameSocket } from '../hooks/useGameSocket.js';
import { useParty } from '../hooks/useParty.js';
import { useAuth } from '../hooks/useAuth.js';
import { GiftCard } from './GiftCard.jsx';
import { Button } from './ui/Button.jsx';
import { AddressModal } from './AddressModal.jsx';
import { ShippingAddressViewModal } from './ShippingAddressViewModal.jsx';
import { GiftToSendCard } from './GiftToSendCard.jsx';
import { GameAuditTrail } from './GameAuditTrail.jsx';
import { apiRequest } from '../utils/api.js';

export function GameBoard({ partyId }) {
  const { user } = useAuth();
  const { gameState, pickGift, stealGift, endTurn, connected } = useGameSocket(partyId);
  const { gifts, participants, party } = useParty(partyId);
  const [userNames, setUserNames] = useState({});
  const [userEmails, setUserEmails] = useState({});
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [selectedGift, setSelectedGift] = useState(null);
  const [showAddressViewModal, setShowAddressViewModal] = useState(false);
  const [selectedWinnerAddress, setSelectedWinnerAddress] = useState(null);
  const [winnerAddresses, setWinnerAddresses] = useState({});

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
    
    // Get the gift this user won (only one - first one found)
    const myWonGift = winnerGiftMap.get(user?.uid);
    const giftsIWon = myWonGift ? [myWonGift] : [];
    const giftsToSend = allEndedGifts.filter(g => g.submitterId === user?.uid);
    
    // Use the same ended screen content below
    const getWinnerName = (ownerId) => {
      if (!ownerId) return 'No Winner';
      if (ownerId === user?.uid) return 'You';
      return userNames[ownerId] || userEmails[ownerId] || `User ${ownerId.slice(0, 8)}`;
    };
    
    return (
      <>
        <div className="max-w-6xl mx-auto p-6">
          {/* Celebration Header */}
          <div className="text-center mb-12">
            <div className="text-7xl mb-4">🎉</div>
            <h1 className="text-5xl font-bold mb-3 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Game Over!
            </h1>
            <p className="text-xl text-gray-600">Time to see what you won and send your gifts!</p>
          </div>

          {/* What You Won Section */}
          {giftsIWon.length > 0 && (
            <div className="mb-12">
              <div className="flex items-center gap-3 mb-6">
                <div className="bg-green-100 p-3 rounded-full">
                  <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-3xl font-bold text-gray-900">What You Won 🏆</h2>
              </div>
              <div className="space-y-6">
                {giftsIWon.map((gift) => (
                  <div
                    key={gift.id}
                    className="bg-gradient-to-br from-green-50 to-blue-50 rounded-xl shadow-lg p-6 border-2 border-green-200 hover:shadow-xl transition-shadow"
                  >
                    <div className="flex gap-6">
                      {gift.image && (
                        <img
                          src={gift.image}
                          alt={gift.title || 'Gift'}
                          className="w-32 h-32 object-cover rounded-lg shadow-md"
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                      )}
                      <div className="flex-1">
                        <h3 className="text-xl font-bold text-gray-900 mb-2">{gift.title || 'Gift'}</h3>
                        {gift.url && (
                          <a
                            href={gift.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 underline text-sm mb-4 inline-block"
                          >
                            View Gift Link ↗
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* What You Need to Send Section */}
          {giftsToSend.length > 0 && (
            <div className="mb-12">
              <div className="flex items-center gap-3 mb-6">
                <div className="bg-orange-100 p-3 rounded-full">
                  <svg className="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                  </svg>
                </div>
                <h2 className="text-3xl font-bold text-gray-900">What You Need to Send 📦</h2>
              </div>
              <div className="space-y-6">
                {giftsToSend.map((gift) => {
                  const winnerId = gift.winnerId;
                  const winnerName = getWinnerName(winnerId);
                  
                  return (
                    <GiftToSendCard
                      key={gift.id}
                      gift={gift}
                      winnerId={winnerId}
                      winnerName={winnerName}
                      userNames={userNames}
                      userEmails={userEmails}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* No gifts message */}
          {giftsIWon.length === 0 && giftsToSend.length === 0 && (
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
        </div>
        
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

  // Separate gifts into wrapped and unwrapped
  const wrappedGiftList = gifts.filter((g) => wrappedGifts.includes(g.id));
  const unwrappedGiftList = gifts.filter((g) => unwrappedMap.has(g.id));

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
    
    // Separate gifts into what you won and what you need to send
    // Only show ONE gift per winner
    const myWonGift = winnerToGiftMap.get(user?.uid);
    const giftsIWon = myWonGift ? [myWonGift] : [];

    const giftsToSend = allEndedGifts.filter((gift) => {
      return gift.submitterId === user?.uid;
    });

    return (
      <div className="max-w-6xl mx-auto p-6">
        {/* Celebration Header */}
        <div className="text-center mb-12">
          <div className="text-7xl mb-4">🎉</div>
          <h1 className="text-5xl font-bold mb-3 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Game Over!
          </h1>
          <p className="text-xl text-gray-600">Time to see what you won and send your gifts!</p>
        </div>

        {/* What You Won Section */}
        {giftsIWon.length > 0 && (
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-green-100 p-3 rounded-full">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-3xl font-bold text-gray-900">What You Won 🏆</h2>
            </div>
            <div className="space-y-6">
              {giftsIWon.map((gift) => {
                const giftData = unwrappedMap.get(gift.id);
                return (
                  <div
                    key={gift.id}
                    className="bg-gradient-to-br from-green-50 to-blue-50 rounded-xl shadow-lg p-6 border-2 border-green-200 hover:shadow-xl transition-shadow"
                  >
                    <div className="flex gap-6">
                      {gift.image && (
                        <img
                          src={gift.image}
                          alt={gift.title || 'Gift'}
                          className="w-32 h-32 object-cover rounded-lg shadow-md"
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                      )}
                      <div className="flex-1">
                        <h3 className="text-xl font-bold text-gray-900 mb-2">{gift.title || 'Gift'}</h3>
                        {gift.url && (
                          <a
                            href={gift.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 underline text-sm mb-4 inline-block"
                          >
                            View Gift Link ↗
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* What You Need to Send Section */}
        {giftsToSend.length > 0 && (
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-orange-100 p-3 rounded-full">
                <svg className="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
              </div>
              <h2 className="text-3xl font-bold text-gray-900">What You Need to Send 📦</h2>
            </div>
            <div className="space-y-6">
              {giftsToSend.map((gift) => {
                // Use winnerId from Firestore if available, otherwise from gameState
                const winnerId = gift.winnerId || unwrappedMap.get(gift.id)?.ownerId;
                const winnerName = getWinnerName(winnerId);
                
                return (
                  <GiftToSendCard
                    key={gift.id}
                    gift={gift}
                    winnerId={winnerId}
                    winnerName={winnerName}
                    userNames={userNames}
                    userEmails={userEmails}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* No gifts message */}
        {giftsIWon.length === 0 && giftsToSend.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">No gifts assigned to you this game.</p>
          </div>
        )}

        {/* Game Audit Trail */}
        <GameAuditTrail
          history={party?.gameHistory || gameState?.history || []}
          gifts={gifts}
          userNames={userNames}
          userEmails={userEmails}
        />
        
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
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-6 text-center">
        <h1 className="text-3xl font-bold mb-4">White Elephant Game</h1>
        
        {/* Rounds Remaining */}
        {phase === 'ACTIVE' && (
          <div className="mb-4">
            <div className="inline-block bg-blue-50 border-2 border-blue-200 rounded-full px-5 py-2">
              <span className="text-sm font-semibold text-blue-700">
                {roundsInfo.roundsRemaining} turn{roundsInfo.roundsRemaining !== 1 ? 's' : ''} remaining
                {gameState.isBoomerangPhase && ' (Boomerang)'}
              </span>
            </div>
          </div>
        )}

        {/* Prominent current player display */}
        <div className={`p-6 rounded-lg mb-4 ${
          currentPlayerId === user?.uid 
            ? 'bg-blue-100 border-4 border-blue-500' 
            : 'bg-gray-100 border-4 border-gray-300'
        }`}>
          <p className="text-sm text-gray-600 mb-1">Current Turn</p>
          <p className={`text-4xl font-bold ${
            currentPlayerId === user?.uid 
              ? 'text-blue-700' 
              : 'text-gray-700'
          }`}>
            {getCurrentPlayerName()}
          </p>
        </div>
        {gameState.isBoomerangPhase && (
          <p className="text-yellow-600 font-semibold text-lg">🔄 Boomerang Round!</p>
        )}

        {/* End Game Button - Admin only */}
        {phase === 'ACTIVE' && isAdmin && (
          <div className="mt-4">
            {allGiftsFrozen && (
              <div className="bg-orange-50 border-2 border-orange-300 rounded-lg p-4 mb-4">
                <p className="text-sm font-semibold text-orange-800 mb-2">
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
              <p className="text-xs text-gray-500 mt-2">
                {allGiftsFrozen 
                  ? 'All gifts are frozen. Click to finalize winners and end the game.'
                  : 'As admin, you can manually end the game at any time'}
              </p>
            </div>
          </div>
        )}
        {/* Show message to non-admins when all gifts are frozen */}
        {phase === 'ACTIVE' && !isAdmin && allGiftsFrozen && (
          <div className="mt-4">
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
          <h2 className="text-xl font-semibold mb-4">Wrapped Gifts</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
          <h2 className="text-xl font-semibold mb-4">Unwrapped Gifts</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
        <div className="mt-6 text-center">
          <Button onClick={endTurn} variant="primary" className="px-8">
            End Turn
          </Button>
        </div>
      )}
    </div>
  );
}

