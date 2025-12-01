/**
 * Game Socket.io Hook
 */
import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { auth } from '../utils/firebase.js';
import { trackGameAction } from '../utils/analytics.js';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

export function useGameSocket(partyId) {
  const [gameState, setGameState] = useState(null);
  const [connected, setConnected] = useState(false);
  const [socket, setSocket] = useState(null);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!partyId) return;

    // Get auth token
    auth.currentUser?.getIdToken().then((token) => {
      // Connect to socket
      const socket = io(SERVER_URL, {
        auth: { token },
        transports: ['websocket'],
      });

      socketRef.current = socket;
      setSocket(socket);

      socket.on('connect', () => {
        console.log('✅ Socket connected', { socketId: socket.id, partyId });
        setConnected(true);
        socket.emit('join-party', partyId);
        console.log('📤 Emitted join-party for', partyId);
      });

      socket.on('connect_error', (error) => {
        console.error('❌ Socket connection error:', error);
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

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
      }
    };
  }, [partyId]);

  const emitAction = (action, data) => {
    if (socketRef.current && connected) {
      socketRef.current.emit(action, { partyId, ...data });
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


