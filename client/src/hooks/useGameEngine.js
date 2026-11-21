/**
 * Game Engine Hook - Bridge between Reducer and Socket.io
 * 
 * Manages game state with optimistic updates for instant UI feedback.
 */
import { useReducer, useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { useAuth } from './useAuth.js';
import { useParty } from './useParty.js';
import { gameReducer, initialState, ActionTypes, gameActions } from '../reducers/gameReducer.js';
import { io } from 'socket.io-client';
import { auth } from '../utils/firebase.js';
import { trackGameAction, trackGameComplete, trackError, trackEvent } from '../utils/analytics.js';
import { SERVER_URL } from '../utils/config.js';
import { canPlayerSkipTurn } from '../utils/skipTurnEligibility.js';
import { hasPickedThisTurn, isOwnWrappedGiftLocked } from '../utils/turnRules.js';
import { planSocketGameErrorHandling } from '../utils/socketGameErrorToast.js';
import { STEAL_BACK_SAME_TURN_MESSAGE } from '../../../server/shared/socket-error-copy.mjs';

export function useGameEngine(partyId) {
  const { user } = useAuth();
  const { gifts, participants, party } = useParty(partyId);
  const [state, dispatch] = useReducer(gameReducer, initialState);
  const [socket, setSocket] = useState(null);
  const socketRef = useRef(null);
  const pendingOptimisticUpdateRef = useRef(null);
  const giftsRef = useRef(gifts);
  const participantsRef = useRef(participants);
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef(null);
  const lastSocketToastRef = useRef({ message: null, atMs: 0 });
  const [joinDeniedAsNonParticipant, setJoinDeniedAsNonParticipant] = useState(false);

  // Keep refs in sync with latest values
  useEffect(() => {
    giftsRef.current = gifts;
    participantsRef.current = participants;
  }, [gifts, participants]);

  useEffect(() => {
    setJoinDeniedAsNonParticipant(false);
  }, [partyId, user?.uid]);

  // Initialize socket connection
  useEffect(() => {
    if (!partyId || !user) return;

    const connectSocket = () => {
      // Get auth token and connect
      auth.currentUser?.getIdToken().then((token) => {
        console.log(`🔌 Attempting to connect to server: ${SERVER_URL}`);
        
        const socket = io(SERVER_URL, {
          auth: { token },
          transports: ['websocket', 'polling'], // Add polling as fallback
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          reconnectionAttempts: 5,
          timeout: 10000, // 10 second timeout
        });

        socketRef.current = socket;
        setSocket(socket);

        // Socket event listeners
        socket.on('connect', () => {
          console.log('✅ Socket connected', { socketId: socket.id, serverUrl: SERVER_URL });
          dispatch(gameActions.socketConnected());
          retryCountRef.current = 0;
          socket.emit('join-party', partyId);
        });

        socket.on('connect_error', (error) => {
          const errorMessage = error.message || 'Connection failed';
          console.error('❌ Socket connection error:', {
            error: errorMessage,
            serverUrl: SERVER_URL,
            retryCount: retryCountRef.current,
          });
          
          dispatch(gameActions.socketDisconnected());
          
          // Clear any existing retry timeout
          if (retryTimeoutRef.current) {
            clearTimeout(retryTimeoutRef.current);
          }
          
          // Don't retry indefinitely - show error after 3 failed attempts
          if (retryCountRef.current < 3) {
            retryCountRef.current++;
            const retryDelay = Math.min(1000 * Math.pow(2, retryCountRef.current), 10000); // Exponential backoff, max 10s
            console.log(`🔄 Retrying connection in ${retryDelay}ms (attempt ${retryCountRef.current + 1}/3)`);
            retryTimeoutRef.current = setTimeout(() => {
              socket.disconnect();
              connectSocket();
            }, retryDelay);
          } else {
            console.error('❌ Max retry attempts reached. Connection failed.');
            dispatch(gameActions.setError(`Failed to connect to server at ${SERVER_URL}. Please check that the server is running.`));
          }
        });

        socket.on('disconnect', () => {
          console.log('❌ Socket disconnected');
          dispatch(gameActions.socketDisconnected());
        });

      socket.on('game-state', (gameState) => {
        console.log('[GameEngine] 📥 Received game-state event:', {
          currentTurnIndex: gameState?.currentTurnIndex,
          currentPlayerId: gameState?.currentPlayerId,
          historyLength: gameState?.history?.length || 0,
          timestamp: Date.now()
        });
        // Use refs to get latest values
        dispatch(gameActions.gameStateReceived(gameState, giftsRef.current, participantsRef.current));
      });

      socket.on('game-started', (gameState) => {
        console.log('[GameEngine] 📥 Received game-started event:', {
          currentTurnIndex: gameState?.currentTurnIndex,
          currentPlayerId: gameState?.currentPlayerId,
          timestamp: Date.now()
        });
        // Use refs to get latest values
        dispatch(gameActions.gameStarted(gameState, giftsRef.current, participantsRef.current));
      });

      socket.on('game-updated', (gameState) => {
        console.log('[GameEngine] 📥 Received game-updated event:', {
          currentTurnIndex: gameState?.currentTurnIndex,
          currentPlayerId: gameState?.currentPlayerId,
          historyLength: gameState?.history?.length || 0,
          timestamp: Date.now()
        });
        // Clear pending optimistic update since server state is authoritative
        pendingOptimisticUpdateRef.current = null;
        // Use refs to get latest values
        dispatch(gameActions.gameUpdated(gameState, giftsRef.current, participantsRef.current));
      });

      socket.on('game-ended', (finalState) => {
        pendingOptimisticUpdateRef.current = null;
        // Use refs to get latest values
        dispatch(gameActions.gameEnded(finalState.state, giftsRef.current, participantsRef.current));
        
        // Track game completion with metrics
        const gameState = finalState.state;
        const history = gameState?.history || [];
        const participants = participantsRef.current || [];
        
        // Calculate metrics
        const totalActions = history.length;
        const stealCount = history.filter(h => h.type === 'STEAL').length;
        const boomerangMode = gameState?.config?.returnToStart || false;
        
        // Calculate duration (if we have start time)
        const endTime = new Date();
        const startTime = party?.startedAt?.toDate?.() || party?.createdAt?.toDate?.() || new Date();
        const duration = Math.floor((endTime.getTime() - startTime.getTime()) / 1000); // Duration in seconds
        
        // Track completion with participant count
        const participantCount = participants.length;
        const totalReactions = gameState?.reactionCount || 0;
        trackGameComplete(
          partyId,
          duration,
          totalActions,
          stealCount,
          boomerangMode,
          totalReactions
        );
        
        // Also track participant count as a separate event for analytics
        trackEvent('game_complete_participants', {
          party_id: partyId,
          participant_count: participantCount,
        });
      });

      socket.on('error', ({ message, code }) => {
        const hasPendingPlayerAction = Boolean(pendingOptimisticUpdateRef.current);
        if (code === 'NOT_PARTICIPANT') {
          setJoinDeniedAsNonParticipant(true);
        }

        const plan = planSocketGameErrorHandling({
          message,
          code,
          hasPendingPlayerAction,
          lastToastMessage: lastSocketToastRef.current.message,
          lastToastAtMs: lastSocketToastRef.current.atMs,
        });

        if (plan.consoleLevel === 'error') {
          console.error('Socket error:', code || plan.safePlayerCopy);
        } else if (plan.consoleLevel === 'log') {
          console.log('Expected game state condition (not showing error toast):', plan.safePlayerCopy);
        }

        if (plan.showToast && plan.toastMessage) {
          lastSocketToastRef.current = { message: plan.toastMessage, atMs: Date.now() };
          dispatch(gameActions.errorReceived(plan.toastMessage));
        }

        if (plan.trackAnalytics) {
          trackError('socket_error', code || plan.safePlayerCopy, 'useGameEngine');
        }

        if (plan.rollbackOptimistic && pendingOptimisticUpdateRef.current) {
          dispatch({
            type: ActionTypes.ROLLBACK_OPTIMISTIC_UPDATE,
            payload: { snapshot: pendingOptimisticUpdateRef.current.snapshot },
          });
          pendingOptimisticUpdateRef.current = null;
        }
      });
    }).catch((error) => {
      console.error('❌ Error getting auth token:', error);
      dispatch(gameActions.setError('Failed to authenticate. Please sign in again.'));
    });
    };

    connectSocket();

    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
      }
      retryCountRef.current = 0;
    };
  }, [partyId, user]);

  // Dispatch gifts metadata when Firestore gifts update
  useEffect(() => {
    if (gifts && gifts.length > 0) {
      dispatch(gameActions.giftsMetadataLoaded(gifts));
    }
  }, [gifts]);

  // FIXED: Removed problematic useEffect that was re-dispatching stale game state
  // This was causing state resets when participants/gifts changed
  // Instead, we rely on the reducer to handle participant ordering from the action payload
  // The mergeGifts and orderParticipants functions already handle this correctly

  // Optimistic action handlers
  const handlePickGift = useCallback((giftId) => {
    if (!socketRef.current || !state.ui.isSocketConnected) {
      console.warn('Cannot pick gift: socket not connected');
      return;
    }

    // Save snapshot for rollback
    const snapshot = JSON.parse(JSON.stringify(state));
    
    // Dispatch optimistic update
    dispatch({
      type: ActionTypes.OPTIMISTIC_PICK,
      payload: { giftId, userId: user.uid },
    });

    // Store snapshot for potential rollback
    pendingOptimisticUpdateRef.current = { snapshot, action: 'pick', giftId };

    // Emit socket event
    trackGameAction('reveal', partyId);
    socketRef.current.emit('pick-gift', { partyId, giftId });
  }, [state, user?.uid, partyId]);

  const handleStealGift = useCallback((giftId) => {
    if (!socketRef.current || !state.ui.isSocketConnected) {
      console.warn('Cannot steal gift: socket not connected');
      return;
    }

    const gift = state.gifts[giftId];
    if (!gift) {
      console.warn('Cannot steal gift: gift not found');
      return;
    }

    // Save snapshot for rollback
    const snapshot = JSON.parse(JSON.stringify(state));
    
    // Dispatch optimistic update
    dispatch({
      type: ActionTypes.OPTIMISTIC_STEAL,
      payload: {
        giftId,
        userId: user.uid,
        previousOwnerId: gift.ownerId,
      },
    });

    // Store snapshot for potential rollback
    pendingOptimisticUpdateRef.current = { snapshot, action: 'steal', giftId };

    // Emit socket event
    trackGameAction('steal', partyId);
    socketRef.current.emit('steal-gift', { partyId, giftId });
  }, [state, user?.uid, partyId]);

  const handleEndTurn = useCallback(() => {
    if (!socketRef.current || !state.ui.isSocketConnected) {
      console.warn('Cannot end turn: socket not connected');
      return;
    }

    // Save snapshot for rollback
    const snapshot = JSON.parse(JSON.stringify(state));
    
    // Dispatch optimistic update
    dispatch({
      type: ActionTypes.OPTIMISTIC_END_TURN,
    });

    // Store snapshot for potential rollback
    pendingOptimisticUpdateRef.current = { snapshot, action: 'endTurn' };

    // Emit socket event
    trackGameAction('end_turn', partyId);
    socketRef.current.emit('end-turn', { partyId });
  }, [state, partyId]);

  // Derived state calculations
  const isMyTurn = useMemo(() => {
    // Use activePlayerId from state machine (accounts for pendingVictimId)
    if (!state.activePlayerId || !user) return false;
    return state.activePlayerId === user.uid;
  }, [state.activePlayerId, user?.uid]);

  const pickedThisTurn = isMyTurn && hasPickedThisTurn(state.gameState, user?.uid);

  const canPick = useMemo(() => {
    if (!isMyTurn || state.status !== 'PLAYING' || pickedThisTurn) return false;
    const hasWrapped = Object.values(state.gifts).some((gift) => gift.isWrapped);
    const holdsUnwrapped = Object.values(state.gifts).some(
      (gift) => !gift.isWrapped && gift.ownerId === user?.uid,
    );
    return hasWrapped && !holdsUnwrapped;
  }, [isMyTurn, state.status, state.gifts, user?.uid, pickedThisTurn]);

  const isOwnGiftLocked = useCallback(
    (giftId) => isOwnWrappedGiftLocked(state.gameState, state.gifts, giftId, user?.uid),
    [state.gameState, state.gifts, user?.uid],
  );

  const canSkipTurn = useMemo(() => {
    if (!isMyTurn || state.status !== 'PLAYING' || !user?.uid) {
      return false;
    }
    return canPlayerSkipTurn({
      gifts: state.gifts,
      gameState: state.gameState,
      currentTurnIndex: state.currentTurnIndex,
      turnQueue: state.turnQueue,
      userId: user.uid,
      activePlayerId: state.activePlayerId,
    });
  }, [
    isMyTurn,
    state.status,
    state.gifts,
    state.gameState,
    state.currentTurnIndex,
    state.turnQueue,
    state.activePlayerId,
    user?.uid,
  ]);

  const getStealBlockReason = useCallback((giftId) => {
    if (!isMyTurn || state.status !== 'PLAYING' || pickedThisTurn) {
      return null; // Not shown - not your turn, or your pick already ended it
    }
    
    const gift = state.gifts[giftId];
    if (!gift || gift.isWrapped) {
      return null; // Not shown - gift doesn't exist or wrapped
    }
    if (gift.isFrozen) {
      return "This gift is frozen (3 steals). It can't be stolen again.";
    }
    if (gift.ownerId === user?.uid) {
      return null; // Not shown - own gift
    }
    
    // Check U-turn rule
    const turnOrder = state.gameState?.turnOrder || [];
    const turnQueue = state.turnQueue || [];
    const returnToStart = state.gameState?.config?.returnToStart || false;
    const isBoomerangPhase = returnToStart && (
      state.gameState?.isBoomerangPhase || 
      (state.currentTurnIndex >= (turnOrder.length || 0))
    );
    
    if (gift.lastOwnerId === user?.uid) {
      return STEAL_BACK_SAME_TURN_MESSAGE;
    }
    
    // Check if player has gift
    const playerHasGift = Object.values(state.gifts).some(g => 
      !g.isWrapped && g.ownerId === user?.uid
    );
    
    if (playerHasGift) {
      const isLastIndex = state.currentTurnIndex === (turnQueue.length - 1);
      const isPlayer1 = turnOrder.length > 0 && turnOrder[0] === user?.uid;
      const isPlayer1FinalTurn = isLastIndex && isPlayer1;
      
      if (!isBoomerangPhase && !isPlayer1FinalTurn) {
        return 'You already have a gift. You can swap once the boomerang round starts.';
      }
    }
    
    return null; // No blocking reason
  }, [isMyTurn, state.status, state.gifts, state.gameState, state.currentTurnIndex, state.turnQueue, user?.uid, pickedThisTurn]);

  const canSteal = useCallback((giftId) => {
    // A turn is pick OR steal: no steal after a pick
    if (!isMyTurn || state.status !== 'PLAYING' || pickedThisTurn) {
      return false;
    }
    
    const gift = state.gifts[giftId];
    if (!gift || gift.isWrapped) {
      return false;
    }
    if (gift.isFrozen) {
      return false;
    }
    if (gift.ownerId === user?.uid) {
      return false; // Can't steal your own gift
    }
    
    // RULE 4: Immediate Steal-Back Prevention (U-Turn Rule)
    // The server keeps lastOwnerId only while the lock applies and rejects the steal in every phase.
    if (gift.lastOwnerId === user?.uid) {
      return false;
    }

    const turnOrder = state.gameState?.turnOrder || [];
    const turnQueue = state.turnQueue || [];
    const returnToStart = state.gameState?.config?.returnToStart || false;
    const isBoomerangPhase = returnToStart && (
      state.gameState?.isBoomerangPhase || 
      (state.currentTurnIndex >= (turnOrder.length || 0))
    );
    
    // RULE 1: One Gift Per Person (Double-Dip Prevention)
    // Check if player already has a gift
    const playerHasGift = Object.values(state.gifts).some(g => 
      !g.isWrapped && g.ownerId === user?.uid
    );
    
    if (playerHasGift) {
      // Player has a gift - can only steal if:
      // - Exception 1: Player 1's Final Turn (bookend exception)
      // - Exception 2: Boomerang Phase (players can swap) - only if returnToStart is enabled
      const isLastIndex = state.currentTurnIndex === (turnQueue.length - 1);
      const isPlayer1 = turnOrder.length > 0 && turnOrder[0] === user?.uid;
      const isPlayer1FinalTurn = isLastIndex && isPlayer1;
      
      if (!isBoomerangPhase && !isPlayer1FinalTurn) {
        return false; // Player has a gift and it's not boomerang phase or Player 1's final turn
      }
    }
    
    return true;
  }, [isMyTurn, state.status, state.gifts, state.gameState, state.currentTurnIndex, state.turnQueue, user?.uid, pickedThisTurn]);

  // Emit reaction method
  const emitReaction = useCallback((emoji) => {
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('send_reaction', {
        type: 'emoji',
        value: emoji,
        partyId,
      });
    }
  }, [partyId]);

  return {
    state,
    actions: {
      pickGift: handlePickGift,
      stealGift: handleStealGift,
      endTurn: handleEndTurn,
    },
    derived: {
      isMyTurn,
      canPick,
      canSkipTurn,
      canSteal,
      getStealBlockReason,
      isOwnGiftLocked,
    },
    socket,
    emitReaction,
    dispatch,
    joinDeniedAsNonParticipant,
  };
}

