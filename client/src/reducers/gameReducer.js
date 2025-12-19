/**
 * Game Reducer - Strict State Machine
 * 
 * Implements a strict state machine for turn-based game logic with:
 * - turnQueue: Array of Player IDs (the schedule)
 * - currentTurnIndex: Integer (points to schedule position)
 * - pendingVictimId: String | null (person who must go next because they were robbed)
 * - activePlayerId: DERIVED (if pendingVictimId exists, return it; else return turnQueue[currentTurnIndex])
 */

// Action Types
export const ActionTypes = {
  SOCKET_CONNECTED: 'SOCKET_CONNECTED',
  SOCKET_DISCONNECTED: 'SOCKET_DISCONNECTED',
  GAME_STATE_RECEIVED: 'GAME_STATE_RECEIVED',
  GAME_STARTED: 'GAME_STARTED',
  GAME_UPDATED: 'GAME_UPDATED',
  GAME_ENDED: 'GAME_ENDED',
  GIFTS_METADATA_LOADED: 'GIFTS_METADATA_LOADED',
  ERROR_RECEIVED: 'ERROR_RECEIVED',
  // Optimistic updates
  OPTIMISTIC_PICK: 'OPTIMISTIC_PICK',
  OPTIMISTIC_STEAL: 'OPTIMISTIC_STEAL',
  OPTIMISTIC_END_TURN: 'OPTIMISTIC_END_TURN',
  ROLLBACK_OPTIMISTIC_UPDATE: 'ROLLBACK_OPTIMISTIC_UPDATE',
};

// Initial State
export const initialState = {
  status: 'LOBBY',
  // State Machine Core Fields
  turnQueue: [],
  currentTurnIndex: -1,
  pendingVictimId: null,
  // Derived fields (computed, not stored)
  activePlayerId: null,
  // Legacy fields (for compatibility)
  turnDeadline: null,
  gifts: {},
  participants: [],
  activities: [],
  gameState: null, // Store raw game state for reference
  ui: {
    isSocketConnected: false,
    lastError: null,
  },
};

/**
 * Calculate turn deadline (60 seconds from now)
 */
function calculateTurnDeadline() {
  const now = new Date();
  const deadline = new Date(now.getTime() + 60 * 1000); // 60 seconds
  return deadline.toISOString();
}

/**
 * Map server phase to client status
 */
function mapPhaseToStatus(phase) {
  switch (phase) {
    case 'LOBBY':
      return 'LOBBY';
    case 'ACTIVE':
      return 'PLAYING';
    case 'ENDED':
      return 'FINISHED';
    default:
      return 'LOBBY';
  }
}

/**
 * DERIVE activePlayerId from state machine
 * Priority 1: pendingVictimId (if set, victim must go next)
 * Priority 2: turnQueue[currentTurnIndex] (scheduled player)
 */
function deriveActivePlayerId(turnQueue, currentTurnIndex, pendingVictimId) {
  if (pendingVictimId) {
    return pendingVictimId;
  }
  if (turnQueue && currentTurnIndex >= 0 && currentTurnIndex < turnQueue.length) {
    return turnQueue[currentTurnIndex];
  }
  return null;
}

/**
 * Check if game should end
 * Game ends ONLY if:
 * 1. currentTurnIndex >= turnQueue.length (queue exhausted)
 * 2. AND unwrappedGifts.length === totalParticipants (no wrapped gifts left)
 * 3. AND pendingVictimId === null (no pending victims)
 */
function shouldGameEnd(turnQueue, currentTurnIndex, pendingVictimId, unwrappedGiftsCount, totalParticipants) {
  // Condition 1: Queue exhausted
  if (currentTurnIndex < turnQueue.length) {
    return false;
  }
  
  // Condition 2: All gifts unwrapped
  if (unwrappedGiftsCount < totalParticipants) {
    return false;
  }
  
  // Condition 3: No pending victims
  if (pendingVictimId !== null) {
    return false;
  }
  
  return true;
}

/**
 * Check if player can act
 * Exception: Player 1 Final Turn in Standard Mode
 */
function canPlayerAct(playerId, turnQueue, currentTurnIndex, turnOrder, isBoomerangPhase, playerHasGift) {
  // If player doesn't have a gift, they can always act
  if (!playerHasGift) {
    return true;
  }
  
  // Boomerang phase: players with gifts can act (swap)
  if (isBoomerangPhase) {
    return true;
  }
  
  // Standard Mode: Check if this is Player 1's Final Turn
  const isLastIndex = currentTurnIndex === (turnQueue.length - 1);
  const isPlayer1 = turnOrder && turnOrder[0] === playerId;
  const isPlayer1FinalTurn = isLastIndex && isPlayer1;
  
  if (isPlayer1FinalTurn) {
    return true; // Exception: Player 1 can act on final turn even with gift
  }
  
  // Standard phase: players with gifts cannot act
  return false;
}

/**
 * Merge Firestore gifts (Base Layer) with game state (Live Layer)
 */
function mergeGifts(firestoreGifts, gameState) {
  const merged = {};
  
  // Handle case where gameState might not exist yet
  const wrappedGifts = gameState?.wrappedGifts || [];
  const unwrappedGiftsMap = gameState?.unwrappedGifts 
    ? new Map(gameState.unwrappedGifts) 
    : new Map();
  
  // Start with Firestore metadata (Base Layer)
  if (firestoreGifts && Array.isArray(firestoreGifts)) {
    firestoreGifts.forEach(gift => {
      merged[gift.id] = {
        ...gift, // Base Layer: id, title, image, url, price, submitterId, partyId
        isWrapped: wrappedGifts.includes(gift.id),
        ownerId: null,
        stealCount: 0,
        isFrozen: false,
        lastOwnerId: null,
      };
    });
  }
  
  // Apply Live Layer from game state
  unwrappedGiftsMap.forEach((giftData, giftId) => {
    if (merged[giftId]) {
      merged[giftId] = {
        ...merged[giftId],
        ownerId: giftData.ownerId || null,
        stealCount: giftData.stealCount || 0,
        isFrozen: giftData.isFrozen || false,
        lastOwnerId: giftData.lastOwnerId || null,
        isWrapped: false,
      };
    }
  });
  
  return merged;
}

/**
 * Order participants based on turnOrder
 */
function orderParticipants(participants, turnOrder) {
  if (!participants || !Array.isArray(participants)) {
    return [];
  }
  if (!turnOrder || !Array.isArray(turnOrder)) {
    return participants;
  }
  
  const participantMap = new Map(participants.map(p => [p.id, p]));
  return turnOrder
    .map(playerId => participantMap.get(playerId))
    .filter(Boolean); // Remove any missing participants
}

/**
 * Transform history array to activities array
 */
function transformActivities(history) {
  if (!history || !Array.isArray(history)) {
    return [];
  }
  
  return history.map(event => ({
    type: event.type, // 'PICK' | 'STEAL'
    playerId: event.playerId,
    giftId: event.giftId,
    timestamp: event.timestamp,
    // Additional metadata for STEAL events
    ...(event.type === 'STEAL' && {
      previousOwnerId: event.previousOwnerId,
      exchangedGiftId: event.exchangedGiftId,
      stealCount: event.stealCount,
      isFrozen: event.isFrozen,
    }),
  }));
}

/**
 * Main Reducer Function - Strict State Machine
 */
export function gameReducer(state = initialState, action) {
  switch (action.type) {
    case ActionTypes.SOCKET_CONNECTED:
      return {
        ...state,
        ui: {
          ...state.ui,
          isSocketConnected: true,
          lastError: null,
        },
      };

    case ActionTypes.SOCKET_DISCONNECTED:
      return {
        ...state,
        ui: {
          ...state.ui,
          isSocketConnected: false,
        },
      };

    case ActionTypes.ERROR_RECEIVED:
      return {
        ...state,
        ui: {
          ...state.ui,
          lastError: action.payload.message,
        },
      };

    case ActionTypes.GIFTS_METADATA_LOADED:
      // Update gifts with new Firestore metadata
      const updatedGifts = mergeGifts(action.payload.gifts, state.gameState || {});
      return {
        ...state,
        gifts: updatedGifts,
      };

    case ActionTypes.GAME_STATE_RECEIVED:
    case ActionTypes.GAME_STARTED:
    case ActionTypes.GAME_UPDATED:
    case ActionTypes.GAME_ENDED: {
      const gameState = action.payload.gameState;
      
      // CRITICAL: Check if incoming state is newer than current state
      // This prevents stale state from overwriting newer state (e.g., on page reload)
      // Handle backwards compatibility: if timestamps don't exist, use history length as fallback
      const incomingVersion = gameState?.stateVersion || (gameState?.updatedAt ? new Date(gameState.updatedAt).getTime() : 0);
      const currentVersion = state.gameState?.stateVersion || (state.gameState?.updatedAt ? new Date(state.gameState.updatedAt).getTime() : 0);
      
      // Fallback: Use history length + currentTurnIndex as version if timestamps don't exist
      // This helps with backwards compatibility for existing game states
      const incomingFallbackVersion = incomingVersion || ((gameState?.history?.length || 0) * 1000 + (gameState?.currentTurnIndex || 0));
      const currentFallbackVersion = currentVersion || ((state.gameState?.history?.length || 0) * 1000 + (state.currentTurnIndex || -1));
      
      // #region agent log
      console.log('[DEBUG]',{location:'gameReducer.js:GAME_UPDATED:VERSION_CHECK',message:'Version check before update',data:{actionType:action.type,incomingVersion:incomingVersion||'N/A',currentVersion:currentVersion||'N/A',incomingFallbackVersion,currentFallbackVersion,incomingTurnIndex:gameState?.currentTurnIndex,currentTurnIndex:state.currentTurnIndex,incomingHistoryLength:gameState?.history?.length||0,currentHistoryLength:state.gameState?.history?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'});
      // #endregion
      
      // Only update if incoming state is newer OR if we don't have a current state
      // Also allow updates if the action is GAME_STARTED (always accept initial state)
      if (action.type !== ActionTypes.GAME_STARTED && 
          incomingFallbackVersion > 0 && 
          currentFallbackVersion > 0 && 
          incomingFallbackVersion < currentFallbackVersion) {
        console.warn('[GameReducer] ⚠️ Rejecting stale game state update:', {
          actionType: action.type,
          incomingVersion: incomingVersion || 'N/A',
          currentVersion: currentVersion || 'N/A',
          incomingFallbackVersion,
          currentFallbackVersion,
          incomingTurnIndex: gameState?.currentTurnIndex,
          currentTurnIndex: state.currentTurnIndex,
          incomingHistoryLength: gameState?.history?.length || 0,
          currentHistoryLength: state.gameState?.history?.length || 0,
        });
        // #region agent log
        console.log('[DEBUG]',{location:'gameReducer.js:GAME_UPDATED:REJECTED',message:'State update rejected as stale',data:{actionType:action.type,incomingVersion:incomingVersion||'N/A',currentVersion:currentVersion||'N/A',incomingFallbackVersion,currentFallbackVersion},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'});
        // #endregion
        // Reject stale update - return current state
        return state;
      }
      
      if (incomingVersion > 0 || currentVersion > 0) {
        console.log('[GameReducer] ✅ Accepting state update:', {
          actionType: action.type,
          incomingVersion: incomingVersion || 'N/A',
          currentVersion: currentVersion || 'N/A',
          incomingFallbackVersion,
          currentFallbackVersion,
          currentTurnIndex: gameState?.currentTurnIndex,
          historyLength: gameState?.history?.length || 0,
        });
        // #region agent log
        console.log('[DEBUG]',{location:'gameReducer.js:GAME_UPDATED:ACCEPTED',message:'State update accepted',data:{actionType:action.type,incomingVersion:incomingVersion||'N/A',currentVersion:currentVersion||'N/A',incomingFallbackVersion,currentFallbackVersion,currentTurnIndex:gameState?.currentTurnIndex,historyLength:gameState?.history?.length||0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'});
        // #endregion
      }
      
      // Extract state machine fields from server gameState
      const turnQueue = gameState?.turnQueue || [];
      const currentTurnIndex = gameState?.currentTurnIndex ?? -1;
      // Map server's currentVictim to client's pendingVictimId
      const pendingVictimId = gameState?.currentVictim || null;
      
      // Derive activePlayerId
      const activePlayerId = deriveActivePlayerId(turnQueue, currentTurnIndex, pendingVictimId);
      
      // Use provided firestoreGifts, or extract base layer from existing gifts
      let firestoreGifts = action.payload.firestoreGifts || [];
      if (firestoreGifts.length === 0 && Object.keys(state.gifts).length > 0) {
        firestoreGifts = Object.values(state.gifts).map(gift => ({
          id: gift.id,
          title: gift.title,
          image: gift.image,
          url: gift.url,
          price: gift.price,
          submitterId: gift.submitterId,
          partyId: gift.partyId,
        }));
      }
      
      // Map phase to status
      const status = mapPhaseToStatus(gameState?.phase || 'LOBBY');
      
      // Calculate turn deadline
      let turnDeadline = state.turnDeadline;
      if (status === 'PLAYING' && currentTurnIndex >= 0) {
        const previousTurnIndex = state.currentTurnIndex;
        if (previousTurnIndex !== currentTurnIndex) {
          turnDeadline = calculateTurnDeadline();
        }
      } else {
        turnDeadline = null;
      }
      
      // Merge gifts
      const gifts = mergeGifts(firestoreGifts, gameState);
      
      // Count unwrapped gifts
      const unwrappedGiftsCount = Object.values(gifts).filter(g => !g.isWrapped).length;
      const totalParticipants = (action.payload.participants || []).length;
      
      // Check if game should end
      const gameShouldEnd = shouldGameEnd(
        turnQueue,
        currentTurnIndex,
        pendingVictimId,
        unwrappedGiftsCount,
        totalParticipants
      );
      
      // Order participants
      const participants = orderParticipants(
        action.payload.participants || [],
        gameState?.turnOrder || []
      );
      
      // Transform activities
      const activities = transformActivities(gameState?.history || []);
      
      return {
        ...state,
        status: gameShouldEnd && status === 'PLAYING' ? 'FINISHED' : status,
        // State Machine Core Fields
        turnQueue,
        currentTurnIndex,
        pendingVictimId,
        activePlayerId,
        // Legacy fields
        turnDeadline,
        gifts,
        participants,
        activities,
        gameState, // Store raw game state for reference
        ui: {
          ...state.ui,
          lastError: null, // Clear errors on successful update
        },
      };
    }

    case ActionTypes.OPTIMISTIC_PICK: {
      const { giftId, userId } = action.payload;
      
      // Validation: Ensure wrappedGifts > 0
      const wrappedGiftsCount = Object.values(state.gifts).filter(g => g.isWrapped).length;
      if (wrappedGiftsCount === 0) {
        console.error(`VIOLATION: No wrapped gifts available! Pick move rejected.`);
        return state;
      }
      
      // Check if player can act
      const turnOrder = state.gameState?.turnOrder || [];
      const isBoomerangPhase = state.gameState?.isBoomerangPhase || 
        (state.currentTurnIndex >= (turnOrder.length || 0));
      const playerHasGift = Object.values(state.gifts).some(g => g.ownerId === userId);
      
      if (!canPlayerAct(userId, state.turnQueue, state.currentTurnIndex, turnOrder, isBoomerangPhase, playerHasGift)) {
        console.error(`VIOLATION: Player ${userId} cannot act! Pick move rejected.`);
        return state;
      }
      
      // State Change: Pick Action (Advancing Time)
      const gifts = { ...state.gifts };
      
      if (gifts[giftId]) {
        gifts[giftId] = {
          ...gifts[giftId],
          isWrapped: false,
          ownerId: userId,
          stealCount: 0,
          isFrozen: false,
          lastOwnerId: null,
        };
      }
      
      // State Machine Updates:
      // 1. pendingVictimId = null (Chain is broken)
      // 2. currentTurnIndex++ (Time moves forward)
      const newPendingVictimId = null;
      const newCurrentTurnIndex = state.currentTurnIndex + 1;
      const newActivePlayerId = deriveActivePlayerId(
        state.turnQueue,
        newCurrentTurnIndex,
        newPendingVictimId
      );
      
      return {
        ...state,
        gifts,
        pendingVictimId: newPendingVictimId,
        currentTurnIndex: newCurrentTurnIndex,
        activePlayerId: newActivePlayerId,
        turnDeadline: calculateTurnDeadline(),
      };
    }

    case ActionTypes.OPTIMISTIC_STEAL: {
      const { giftId, userId, previousOwnerId } = action.payload;
      
      // Validation: Check gift.isFrozen and gift.lastOwner !== currentUser
      const gifts = { ...state.gifts };
      const targetGift = gifts[giftId];
      
      if (!targetGift) {
        console.error(`VIOLATION: Gift ${giftId} not found! Steal move rejected.`);
        return state;
      }
      
      if (targetGift.isFrozen) {
        console.error(`VIOLATION: Gift ${giftId} is frozen! Steal move rejected.`);
        return state;
      }
      
      if (targetGift.lastOwnerId === userId) {
        console.error(`VIOLATION: U-Turn prevention! Cannot steal back immediately.`);
        return state;
      }
      
      // Check if player can act
      const turnOrder = state.gameState?.turnOrder || [];
      const isBoomerangPhase = state.gameState?.isBoomerangPhase || 
        (state.currentTurnIndex >= (turnOrder.length || 0));
      const playerHasGift = Object.values(state.gifts).some(g => g.ownerId === userId);
      
      if (!canPlayerAct(userId, state.turnQueue, state.currentTurnIndex, turnOrder, isBoomerangPhase, playerHasGift)) {
        console.error(`VIOLATION: Player ${userId} cannot act! Steal move rejected.`);
        return state;
      }
      
      // Find gift currently owned by stealing user (if any) - for swap logic
      let exchangedGiftId = null;
      for (const [id, g] of Object.entries(gifts)) {
        if (g.ownerId === userId && id !== giftId) {
          exchangedGiftId = id;
          break;
        }
      }
      
      // Process the steal
      const newStealCount = (targetGift.stealCount || 0) + 1;
      const maxSteals = state.gameState?.config?.maxSteals || 3;
      
      // Update stolen gift
      gifts[giftId] = {
        ...targetGift,
        ownerId: userId,
        stealCount: newStealCount,
        isFrozen: newStealCount >= maxSteals,
        lastOwnerId: previousOwnerId,
      };
      
      // Swap Logic: If currentUser already had a gift, transfer that old gift to previousOwner
      let newPendingVictimId = previousOwnerId; // Default: victim becomes active
      
      if (exchangedGiftId && gifts[exchangedGiftId]) {
        // SWAP: User had a gift, so victim receives it
        const exchangedGift = gifts[exchangedGiftId];
        gifts[exchangedGiftId] = {
          ...exchangedGift,
          ownerId: previousOwnerId,
          // CRITICAL: DO NOT reset stealCount or isFrozen - retain gift history
          lastOwnerId: userId,
        };
        
        // CRITICAL: If victim receives a gift via swap, they aren't empty-handed
        // Set pendingVictimId = null, but they can still skip if needed
        newPendingVictimId = null;
      }
      
      // State Machine Updates:
      // 1. currentTurnIndex DOES NOT CHANGE (Time is paused)
      // 2. pendingVictimId = previousOwnerId (or null if swap occurred)
      const newActivePlayerId = deriveActivePlayerId(
        state.turnQueue,
        state.currentTurnIndex, // UNCHANGED
        newPendingVictimId
      );
      
      return {
        ...state,
        gifts,
        pendingVictimId: newPendingVictimId,
        // currentTurnIndex remains unchanged
        activePlayerId: newActivePlayerId,
      };
    }

    case ActionTypes.OPTIMISTIC_END_TURN: {
      // END_TURN (Skip) Action
      // State Machine Updates:
      // 1. pendingVictimId = null (Chain is broken)
      // 2. currentTurnIndex++ (Time moves forward)
      
      const newPendingVictimId = null;
      const newCurrentTurnIndex = state.currentTurnIndex + 1;
      const newActivePlayerId = deriveActivePlayerId(
        state.turnQueue,
        newCurrentTurnIndex,
        newPendingVictimId
      );
      
      return {
        ...state,
        pendingVictimId: newPendingVictimId,
        currentTurnIndex: newCurrentTurnIndex,
        activePlayerId: newActivePlayerId,
        turnDeadline: calculateTurnDeadline(),
      };
    }

    case ActionTypes.ROLLBACK_OPTIMISTIC_UPDATE:
      // Restore state from snapshot
      return action.payload.snapshot;

    default:
      return state;
  }
}

/**
 * Action Creators - Helper functions for type-safe action creation
 */
export const gameActions = {
  socketConnected: () => ({
    type: ActionTypes.SOCKET_CONNECTED,
  }),

  socketDisconnected: () => ({
    type: ActionTypes.SOCKET_DISCONNECTED,
  }),

  errorReceived: (message) => ({
    type: ActionTypes.ERROR_RECEIVED,
    payload: { message },
  }),

  giftsMetadataLoaded: (gifts) => ({
    type: ActionTypes.GIFTS_METADATA_LOADED,
    payload: { gifts },
  }),

  gameStateReceived: (gameState, firestoreGifts = [], participants = []) => ({
    type: ActionTypes.GAME_STATE_RECEIVED,
    payload: { gameState, firestoreGifts, participants },
  }),

  gameStarted: (gameState, firestoreGifts = [], participants = []) => ({
    type: ActionTypes.GAME_STARTED,
    payload: { gameState, firestoreGifts, participants },
  }),

  gameUpdated: (gameState, firestoreGifts = [], participants = []) => ({
    type: ActionTypes.GAME_UPDATED,
    payload: { gameState, firestoreGifts, participants },
  }),

  gameEnded: (gameState, firestoreGifts = [], participants = []) => ({
    type: ActionTypes.GAME_ENDED,
    payload: { gameState, firestoreGifts, participants },
  }),
};
