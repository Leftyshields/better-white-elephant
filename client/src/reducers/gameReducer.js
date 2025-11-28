/**
 * Game Reducer - View Model Generator
 * 
 * Merges Firestore metadata (Base Layer) with Socket/Redis game state (Live Layer)
 * into a normalized, optimized structure for O(1) lookups.
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
  currentTurnIndex: -1,
  turnDeadline: null,
  gifts: {},
  participants: [],
  activities: [],
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
 * Calculate current turn index from currentPlayerId and turnOrder
 */
function calculateCurrentTurnIndex(currentPlayerId, turnOrder) {
  if (!currentPlayerId || !turnOrder || turnOrder.length === 0) {
    return -1;
  }
  const index = turnOrder.indexOf(currentPlayerId);
  return index >= 0 ? index : -1;
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
 * Main Reducer Function
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
      // Merge with existing gameState if available, otherwise just use base layer
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
      // Use provided firestoreGifts, or extract base layer from existing gifts
      let firestoreGifts = action.payload.firestoreGifts || [];
      
      // If no firestoreGifts provided, extract base layer from existing gifts
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
      
      // Calculate current turn index
      const currentTurnIndex = calculateCurrentTurnIndex(
        gameState?.currentPlayerId,
        gameState?.turnOrder || []
      );
      
      // Calculate turn deadline
      let turnDeadline = state.turnDeadline;
      if (status === 'PLAYING' && currentTurnIndex >= 0) {
        // Check if turn actually changed
        const previousTurnIndex = state.currentTurnIndex;
        if (previousTurnIndex !== currentTurnIndex) {
          turnDeadline = calculateTurnDeadline();
        }
      } else {
        // Clear deadline if not playing
        turnDeadline = null;
      }
      
      // Merge gifts
      const gifts = mergeGifts(firestoreGifts, gameState);
      
      // Order participants
      const participants = orderParticipants(
        action.payload.participants || [],
        gameState?.turnOrder || []
      );
      
      // Transform activities
      const activities = transformActivities(gameState?.history || []);
      
      return {
        ...state,
        status,
        currentTurnIndex,
        turnDeadline,
        gifts,
        participants,
        activities,
        gameState, // Store raw game state for future merges
        ui: {
          ...state.ui,
          lastError: null, // Clear errors on successful update
        },
      };
    }

    case ActionTypes.OPTIMISTIC_PICK: {
      const { giftId, userId } = action.payload;
      const gifts = { ...state.gifts };
      
      if (gifts[giftId]) {
        gifts[giftId] = {
          ...gifts[giftId],
          isWrapped: false,
          ownerId: userId,
          stealCount: 0,
          isFrozen: false,
        };
      }
      
      return {
        ...state,
        gifts,
      };
    }

    case ActionTypes.OPTIMISTIC_STEAL: {
      const { giftId, userId, previousOwnerId } = action.payload;
      const gifts = { ...state.gifts };
      
      if (gifts[giftId]) {
        const gift = gifts[giftId];
        const newStealCount = (gift.stealCount || 0) + 1;
        
        // Find gift currently owned by stealing user (if any)
        let exchangedGiftId = null;
        for (const [id, g] of Object.entries(gifts)) {
          if (g.ownerId === userId && id !== giftId) {
            exchangedGiftId = id;
            break;
          }
        }
        
        // Update stolen gift
        gifts[giftId] = {
          ...gift,
          ownerId: userId,
          stealCount: newStealCount,
          isFrozen: newStealCount >= (state.gameState?.config?.maxSteals || 3),
        };
        
        // If user had a gift, give it to previous owner
        if (exchangedGiftId && gifts[exchangedGiftId]) {
          gifts[exchangedGiftId] = {
            ...gifts[exchangedGiftId],
            ownerId: previousOwnerId,
            stealCount: 0,
            isFrozen: false,
          };
        }
      }
      
      return {
        ...state,
        gifts,
      };
    }

    case ActionTypes.OPTIMISTIC_END_TURN: {
      // Optimistically advance to next turn
      const nextIndex = state.currentTurnIndex + 1;
      const maxIndex = state.participants.length - 1;
      
      if (nextIndex <= maxIndex) {
        return {
          ...state,
          currentTurnIndex: nextIndex,
          turnDeadline: calculateTurnDeadline(),
        };
      }
      
      return state;
    }

    case ActionTypes.ROLLBACK_OPTIMISTIC_UPDATE: {
      // Restore state from snapshot
      return action.payload.snapshot;
    }

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

