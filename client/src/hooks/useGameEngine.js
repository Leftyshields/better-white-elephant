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

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

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

  // Keep refs in sync with latest values
  useEffect(() => {
    giftsRef.current = gifts;
    participantsRef.current = participants;
  }, [gifts, participants]);

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
        // #region agent log
        console.log('[DEBUG]',{location:'useGameEngine.js:game-updated:RECEIVED',message:'Client received game-updated event',data:{currentTurnIndex:gameState?.currentTurnIndex,currentPlayerId:gameState?.currentPlayerId,historyLength:gameState?.history?.length,stateVersion:gameState?.stateVersion,updatedAt:gameState?.updatedAt},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'});
        // #endregion
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

      socket.on('error', ({ message }) => {
        console.error('Socket error:', message);
        
        // Format user-friendly error messages
        let userFriendlyMessage = message;
        
        // Map technical error messages to user-friendly ones
        if (message.includes('No stealable gifts available') || message.includes('Cannot steal gift')) {
          userFriendlyMessage = 'No stealable gifts available. All gifts are either locked or cannot be stolen right now.';
        } else if (message.includes('already acted this turn')) {
          userFriendlyMessage = 'You have already acted this turn. Please wait for your next turn.';
        } else if (message.includes('Cannot steal back')) {
          userFriendlyMessage = 'You cannot steal this gift back yet. Wait until the next turn.';
        } else if (message.includes('Game is not active')) {
          userFriendlyMessage = 'The game is not currently active.';
        } else if (message.includes('Socket not connected')) {
          userFriendlyMessage = 'Connection lost. Please refresh the page.';
        }
        
        dispatch(gameActions.errorReceived(userFriendlyMessage));
        
        // Track error
        trackError('socket_error', message, 'useGameEngine');
        
        // Rollback optimistic update on error
        if (pendingOptimisticUpdateRef.current) {
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

  const canPick = useMemo(() => {
    if (!isMyTurn || state.status !== 'PLAYING') return false;
    // Check if there are any wrapped gifts
    return Object.values(state.gifts).some(gift => gift.isWrapped);
  }, [isMyTurn, state.status, state.gifts]);

  const getStealBlockReason = useCallback((giftId) => {
    if (!isMyTurn || state.status !== 'PLAYING') {
      return null; // Not shown - not your turn
    }
    
    const gift = state.gifts[giftId];
    if (!gift || gift.isWrapped) {
      return null; // Not shown - gift doesn't exist or wrapped
    }
    if (gift.isFrozen) {
      return "This gift is locked (3 steals)";
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
    
    if (gift.lastOwnerId === user?.uid && !isBoomerangPhase) {
      return "You can't steal this gift back yet - wait until the next turn";
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
        return "You already have a gift - you can only swap in boomerang phase";
      }
    }
    
    return null; // No blocking reason
  }, [isMyTurn, state.status, state.gifts, state.gameState, state.currentTurnIndex, state.turnQueue, user?.uid]);

  const canSteal = useCallback((giftId) => {
    // #region agent log
    fetch('http://localhost:7243/ingest/aa8b9df8-f732-4ee4-afb1-02470529209e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useGameEngine.js:canSteal:ENTRY',message:'canSteal called',data:{giftId,isMyTurn,status:state.status,userId:user?.uid},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    if (!isMyTurn || state.status !== 'PLAYING') {
      // #region agent log
      fetch('http://localhost:7243/ingest/aa8b9df8-f732-4ee4-afb1-02470529209e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useGameEngine.js:canSteal:BLOCKED',message:'Blocked: not my turn or not playing',data:{giftId,isMyTurn,status:state.status},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      return false;
    }
    
    const gift = state.gifts[giftId];
    if (!gift || gift.isWrapped) {
      // #region agent log
      fetch('http://localhost:7243/ingest/aa8b9df8-f732-4ee4-afb1-02470529209e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useGameEngine.js:canSteal:BLOCKED',message:'Blocked: gift not found or wrapped',data:{giftId,hasGift:!!gift,isWrapped:gift?.isWrapped},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      return false;
    }
    if (gift.isFrozen) {
      // #region agent log
      fetch('http://localhost:7243/ingest/aa8b9df8-f732-4ee4-afb1-02470529209e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useGameEngine.js:canSteal:BLOCKED',message:'Blocked: gift frozen',data:{giftId,isFrozen:gift.isFrozen,stealCount:gift.stealCount},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      return false;
    }
    if (gift.ownerId === user?.uid) {
      // #region agent log
      fetch('http://localhost:7243/ingest/aa8b9df8-f732-4ee4-afb1-02470529209e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useGameEngine.js:canSteal:BLOCKED',message:'Blocked: own gift',data:{giftId,ownerId:gift.ownerId,userId:user?.uid},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      return false; // Can't steal your own gift
    }
    
    // RULE 4: Immediate Steal-Back Prevention (U-Turn Rule)
    // Per GAME_RULES.md Rule 4: "A player CANNOT steal a gift that was just stolen from them on the SAME turn"
    // CRITICAL: In boomerang phase, the U-turn rule should allow stealing after a turn has passed
    // Check if we're in boomerang phase - if so, lastOwnerId might be stale and should be allowed
    const turnOrder = state.gameState?.turnOrder || [];
    const turnQueue = state.turnQueue || [];
    const returnToStart = state.gameState?.config?.returnToStart || false;
    const isBoomerangPhase = returnToStart && (
      state.gameState?.isBoomerangPhase || 
      (state.currentTurnIndex >= (turnOrder.length || 0))
    );
    
    if (gift.lastOwnerId === user?.uid) {
      // #region agent log
      fetch('http://localhost:7243/ingest/aa8b9df8-f732-4ee4-afb1-02470529209e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useGameEngine.js:canSteal:U_TURN_CHECK',message:'U-turn rule check',data:{giftId,lastOwnerId:gift.lastOwnerId,userId:user?.uid,isBoomerangPhase,currentTurnIndex:state.currentTurnIndex,turnOrderLength:turnOrder.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      // In boomerang phase, allow stealing even if lastOwnerId matches (turn has advanced)
      // The U-turn rule only prevents immediate steal-back on the SAME turn
      // Since we're in boomerang phase, turns have advanced, so allow the steal
      if (!isBoomerangPhase) {
        // #region agent log
        fetch('http://localhost:7243/ingest/aa8b9df8-f732-4ee4-afb1-02470529209e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useGameEngine.js:canSteal:BLOCKED',message:'Blocked: U-turn rule (not boomerang)',data:{giftId,lastOwnerId:gift.lastOwnerId,userId:user?.uid},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
        return false; // Can't steal back a gift immediately after losing it on the same turn (standard phase only)
      }
    }
    
    // RULE 1: One Gift Per Person (Double-Dip Prevention)
    // Check if player already has a gift
    const playerHasGift = Object.values(state.gifts).some(g => 
      !g.isWrapped && g.ownerId === user?.uid
    );
    
    // #region agent log
    fetch('http://localhost:7243/ingest/aa8b9df8-f732-4ee4-afb1-02470529209e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useGameEngine.js:canSteal:PLAYER_HAS_GIFT',message:'Checking if player has gift',data:{giftId,playerHasGift,isBoomerangPhase,currentTurnIndex:state.currentTurnIndex,turnOrderLength:turnOrder.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    
    if (playerHasGift) {
      // Player has a gift - can only steal if:
      // - Exception 1: Player 1's Final Turn (bookend exception)
      // - Exception 2: Boomerang Phase (players can swap) - only if returnToStart is enabled
      const isLastIndex = state.currentTurnIndex === (turnQueue.length - 1);
      const isPlayer1 = turnOrder.length > 0 && turnOrder[0] === user?.uid;
      const isPlayer1FinalTurn = isLastIndex && isPlayer1;
      
      if (!isBoomerangPhase && !isPlayer1FinalTurn) {
        // #region agent log
        fetch('http://localhost:7243/ingest/aa8b9df8-f732-4ee4-afb1-02470529209e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useGameEngine.js:canSteal:BLOCKED',message:'Blocked: has gift but not boomerang/final',data:{giftId,playerHasGift,isBoomerangPhase,isPlayer1FinalTurn,returnToStart,currentTurnIndex:state.currentTurnIndex,turnOrderLength:turnOrder.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
        // #endregion
        return false; // Player has a gift and it's not boomerang phase or Player 1's final turn
      }
    }
    
    // #region agent log
    fetch('http://localhost:7243/ingest/aa8b9df8-f732-4ee4-afb1-02470529209e',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useGameEngine.js:canSteal:ALLOWED',message:'Steal allowed',data:{giftId,stealCount:gift.stealCount,isFrozen:gift.isFrozen,playerHasGift,isBoomerangPhase},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C,D'})}).catch(()=>{});
    // #endregion
    return true;
  }, [isMyTurn, state.status, state.gifts, state.gameState, state.currentTurnIndex, state.turnQueue, user?.uid]);

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
      canSteal,
      getStealBlockReason,
    },
    socket,
    emitReaction,
    dispatch,
  };
}

