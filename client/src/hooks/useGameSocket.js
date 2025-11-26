/**
 * Game Socket.io Hook
 */
import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { auth } from '../utils/firebase.js';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

export function useGameSocket(partyId) {
  const [gameState, setGameState] = useState(null);
  const [connected, setConnected] = useState(false);
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

      socket.on('connect', () => {
        console.log('✅ Socket connected');
        setConnected(true);
        socket.emit('join-party', partyId);
      });

      socket.on('disconnect', () => {
        console.log('❌ Socket disconnected');
        setConnected(false);
      });

      socket.on('game-state', (state) => {
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

      socket.on('error', ({ message }) => {
        console.error('Socket error:', message);
      });
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [partyId]);

  const emitAction = (action, data) => {
    if (socketRef.current && connected) {
      socketRef.current.emit(action, { partyId, ...data });
    }
  };

  return {
    gameState,
    connected,
    emitAction,
    pickGift: (giftId) => emitAction('pick-gift', { giftId }),
    stealGift: (giftId) => emitAction('steal-gift', { giftId }),
    endTurn: () => emitAction('end-turn', {}),
  };
}


