/**
 * Game State Hook using TanStack Query
 * Provides reliable state management with caching, optimistic updates, and automatic refetching
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth.js';
import { useParty } from './useParty.js';
import { SERVER_URL } from '../utils/config.js';

/**
 * Fetch game state from server (fallback for when socket is disconnected)
 */
async function fetchGameState(partyId, token) {
  const response = await fetch(`${SERVER_URL}/api/game/state/${partyId}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch game state: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Game State Hook with TanStack Query
 * Integrates with socket.io for real-time updates while using TanStack Query for reliable state management
 */
export function useGameState(partyId, socket) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const socketRef = useRef(socket);
  
  // Keep socket ref in sync
  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);
  
  // Query key for game state
  const queryKey = ['gameState', partyId];
  
  // Set up socket event listeners to invalidate/update query cache
  useEffect(() => {
    if (!socket || !partyId) return;
    
    const handleGameState = (gameState) => {
      console.log('[useGameState] 📥 Socket game-state event, updating cache:', {
        currentTurnIndex: gameState?.currentTurnIndex,
        stateVersion: gameState?.stateVersion,
      });
      // Update query cache with new data
      queryClient.setQueryData(queryKey, gameState);
    };
    
    const handleGameStarted = (gameState) => {
      console.log('[useGameState] 📥 Socket game-started event, updating cache');
      queryClient.setQueryData(queryKey, gameState);
    };
    
    const handleGameUpdated = (gameState) => {
      console.log('[useGameState] 📥 Socket game-updated event, updating cache:', {
        currentTurnIndex: gameState?.currentTurnIndex,
        stateVersion: gameState?.stateVersion,
      });
      // Only update if incoming state is newer
      const currentData = queryClient.getQueryData(queryKey);
      const incomingVersion = gameState?.stateVersion || (gameState?.updatedAt ? new Date(gameState.updatedAt).getTime() : 0);
      const currentVersion = currentData?.stateVersion || (currentData?.updatedAt ? new Date(currentData.updatedAt).getTime() : 0);
      
      if (incomingVersion === 0 || incomingVersion >= currentVersion) {
        queryClient.setQueryData(queryKey, gameState);
      } else {
        console.warn('[useGameState] ⚠️ Rejecting stale game-updated event:', {
          incomingVersion,
          currentVersion,
        });
      }
    };
    
    const handleGameEnded = (finalState) => {
      console.log('[useGameState] 📥 Socket game-ended event, updating cache');
      queryClient.setQueryData(queryKey, finalState.state);
    };
    
    socket.on('game-state', handleGameState);
    socket.on('game-started', handleGameStarted);
    socket.on('game-updated', handleGameUpdated);
    socket.on('game-ended', handleGameEnded);
    
    return () => {
      socket.off('game-state', handleGameState);
      socket.off('game-started', handleGameStarted);
      socket.off('game-updated', handleGameUpdated);
      socket.off('game-ended', handleGameEnded);
    };
  }, [socket, partyId, queryClient, queryKey]);
  
  // TanStack Query for game state
  // Note: This is primarily for initial load and refetch on reconnection
  // Real-time updates come from socket events above
  const { data: gameState, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!user) throw new Error('User not authenticated');
      const token = await user.getIdToken();
      return fetchGameState(partyId, token);
    },
    enabled: !!partyId && !!user && !!socket?.connected,
    staleTime: Infinity, // Never consider stale - we rely on socket updates
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
    retry: 2,
    refetchOnWindowFocus: false, // Don't refetch on window focus - socket handles updates
    refetchOnReconnect: true, // Refetch when reconnecting to catch up
  });
  
  // Mutations for game actions (with optimistic updates)
  const pickGiftMutation = useMutation({
    mutationFn: async ({ giftId }) => {
      // Socket emits are handled elsewhere, this is for cache updates
      return { giftId };
    },
    onMutate: async ({ giftId }) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey });
      const previousState = queryClient.getQueryData(queryKey);
      
      if (previousState) {
        const optimisticState = {
          ...previousState,
          // Optimistic updates would go here
        };
        queryClient.setQueryData(queryKey, optimisticState);
      }
      
      return { previousState };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousState) {
        queryClient.setQueryData(queryKey, context.previousState);
      }
    },
  });
  
  const stealGiftMutation = useMutation({
    mutationFn: async ({ giftId }) => {
      return { giftId };
    },
    onMutate: async ({ giftId }) => {
      await queryClient.cancelQueries({ queryKey });
      const previousState = queryClient.getQueryData(queryKey);
      
      if (previousState) {
        const optimisticState = {
          ...previousState,
          // Optimistic updates would go here
        };
        queryClient.setQueryData(queryKey, optimisticState);
      }
      
      return { previousState };
    },
    onError: (err, variables, context) => {
      if (context?.previousState) {
        queryClient.setQueryData(queryKey, context.previousState);
      }
    },
  });
  
  const endTurnMutation = useMutation({
    mutationFn: async () => {
      return {};
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey });
      const previousState = queryClient.getQueryData(queryKey);
      
      if (previousState) {
        const optimisticState = {
          ...previousState,
          // Optimistic updates would go here
        };
        queryClient.setQueryData(queryKey, optimisticState);
      }
      
      return { previousState };
    },
    onError: (err, variables, context) => {
      if (context?.previousState) {
        queryClient.setQueryData(queryKey, context.previousState);
      }
    },
  });
  
  return {
    gameState,
    isLoading,
    error,
    refetch,
    mutations: {
      pickGift: pickGiftMutation.mutate,
      stealGift: stealGiftMutation.mutate,
      endTurn: endTurnMutation.mutate,
    },
  };
}
