/**
 * Game Socket.io Hook
 */
import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { auth } from '../utils/firebase.js';
import { trackGameAction } from '../utils/analytics.js';
import { SERVER_URL } from '../utils/config.js';

export function useGameSocket(partyId) {
  const [gameState, setGameState] = useState(null);
  const [connected, setConnected] = useState(false);
  const [socket, setSocket] = useState(null);
  const [connectionError, setConnectionError] = useState(null);
  const socketRef = useRef(null);
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef(null);

  useEffect(() => {
    if (!partyId) return;

    const connectSocket = () => {
      // Get auth token
      auth.currentUser?.getIdToken().then((token) => {
        console.log(`🔌 Attempting to connect to server: ${SERVER_URL}`);
        
        // Connect to socket
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

        socket.on('connect', () => {
          console.log('✅ Socket connected', { socketId: socket.id, partyId, serverUrl: SERVER_URL });
          setConnected(true);
          setConnectionError(null);
          retryCountRef.current = 0;
          socket.emit('join-party', partyId);
          console.log('📤 Emitted join-party for', partyId);
        });

        socket.on('connect_error', (error) => {
          const errorMessage = error.message || 'Connection failed';
          console.error('❌ Socket connection error:', {
            error: errorMessage,
            serverUrl: SERVER_URL,
            retryCount: retryCountRef.current,
          });
          
          setConnectionError(`Cannot connect to server at ${SERVER_URL}. ${errorMessage}`);
          setConnected(false);
          
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
            setConnectionError(`Failed to connect after ${retryCountRef.current} attempts. Please check that the server is running at ${SERVER_URL}`);
          }
        });

      socket.on('party-joined', ({ partyId: joinedPartyId, roomName }) => {
        console.log('✅ Successfully joined party room:', { joinedPartyId, roomName, socketId: socket.id });
      });

      socket.on('disconnect', () => {
        console.log('❌ Socket disconnected');
        setConnected(false);
      });

      socket.on('game-state', (state) => {
        console.log('✅ Received game-state from server:', state);
        setGameState(state);
      });

      socket.on('game-started', (state) => {
        setGameState(state);
      });

      socket.on('game-updated', (state) => {
        setGameState(state);
      });

      socket.on('game-ended', (finalState) => {
        setGameState(finalState.state);
      });

      socket.on('error', ({ message, code }) => {
        console.error('Socket error:', message, code);
        // If game state is missing, set a flag so GameBoard can handle it
        if (code === 'GAME_STATE_MISSING') {
          setGameState(null); // Ensure gameState is null to trigger error UI
        }
      });
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
      setConnectionError(null);
    };
  }, [partyId]);

  const emitAction = (action, data) => {
    if (socketRef.current && connected) {
      socketRef.current.emit(action, { partyId, ...data });
    } else {
    }
  };

  const emitReaction = (emoji) => {
    const socket = socketRef.current;
    if (!socket) {
      console.warn('⚠️ Cannot emit reaction - no socket');
      return;
    }
    
    if (!connected) {
      console.warn('⚠️ Cannot emit reaction - socket not connected');
      return;
    }
    
    if (!socket.connected) {
      console.warn('⚠️ Cannot emit reaction - socket.connected is false');
      return;
    }
    
    console.log('📤 Emitting reaction to server:', { 
      emoji, 
      partyId, 
      socketId: socket.id,
      connected: socket.connected
    });
    
    socket.emit('send_reaction', {
      type: 'emoji',
      value: emoji,
      partyId,
    });
  };

  return {
    gameState,
    connected,
    socket,
    connectionError,
    emitAction,
    emitReaction,
    pickGift: (giftId) => {
      trackGameAction('reveal', partyId);
      emitAction('pick-gift', { giftId });
    },
    stealGift: (giftId) => {
      trackGameAction('steal', partyId);
      emitAction('steal-gift', { giftId });
    },
    endTurn: () => {
      trackGameAction('end_turn', partyId);
      emitAction('end-turn', {});
    },
  };
}


