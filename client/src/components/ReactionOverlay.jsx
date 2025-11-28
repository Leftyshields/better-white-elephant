/**
 * Reaction Overlay Component
 * Displays flying emojis that float up the screen when reactions are received
 */
import { useState, useEffect, useRef, useCallback } from 'react';

export function ReactionOverlay({ socket }) {
  const [flyingEmojis, setFlyingEmojis] = useState([]);
  const idCounterRef = useRef(0);

  // Shared handler for both local and server reactions
  const handleReactionReceived = useCallback((data) => {
    console.log('🎉 Reaction received:', data);
    const { emoji } = data;
    
    if (!emoji) {
      console.warn('⚠️ Reaction received without emoji:', data);
      return;
    }
    
    // Generate random position and duration
    const left = 20 + Math.random() * 60; // 20% to 80%
    const duration = 2000 + Math.random() * 2000; // 2s to 4s
    const id = idCounterRef.current++;
    const startTime = Date.now();

    console.log('✨ Adding flying emoji:', { id, emoji, left, duration });

    // Add emoji to array
    setFlyingEmojis((prev) => {
      const newArray = [...prev, { id, emoji, left, duration, startTime }];
      console.log('📊 Flying emojis count:', newArray.length);
      return newArray;
    });

    // Remove emoji after animation completes
    setTimeout(() => {
      console.log('🧹 Cleaning up emoji:', { id, emoji });
      setFlyingEmojis((prev) => prev.filter((item) => item.id !== id));
    }, duration);
  }, []);

  // Listen for socket events (server broadcasts)
  useEffect(() => {
    if (!socket) {
      console.log('⚠️ ReactionOverlay: No socket provided');
      return;
    }

    console.log('✅ ReactionOverlay: Setting up listener for reaction_received', { socketId: socket.id, connected: socket.connected });

    const handleServerReaction = (data) => {
      console.log('📥 Reaction received from server:', data);
      if (!data || !data.emoji) {
        console.warn('⚠️ Invalid reaction data received:', data);
        return;
      }
      handleReactionReceived(data);
    };

    // Set up listener
    socket.on('reaction_received', handleServerReaction);
    console.log('✅ ReactionOverlay: Listener registered for reaction_received');

    // Also listen for connection events to verify socket is ready
    const handleConnect = () => {
      console.log('✅ ReactionOverlay: Socket connected', { socketId: socket.id });
    };
    socket.on('connect', handleConnect);

    // Test listener - log all socket events for debugging
    const handleAnyEvent = (eventName, ...args) => {
      if (eventName === 'reaction_received') {
        console.log('🔍 ReactionOverlay: Detected reaction_received event via catch-all listener', args);
      }
    };
    socket.onAny(handleAnyEvent);

    return () => {
      socket.off('reaction_received', handleServerReaction);
      socket.off('connect', handleConnect);
      socket.offAny(handleAnyEvent);
      console.log('🧹 ReactionOverlay: Cleaned up listeners');
    };
  }, [socket, handleReactionReceived]);

  // Listen for local events (optimistic UI)
  useEffect(() => {
    console.log('✅ ReactionOverlay: Setting up listener for reaction_local (optimistic UI)');

    const handleLocalReaction = (event) => {
      console.log('🚀 Local reaction event received:', event.detail);
      handleReactionReceived(event.detail);
    };

    window.addEventListener('reaction_local', handleLocalReaction);

    return () => {
      window.removeEventListener('reaction_local', handleLocalReaction);
    };
  }, [handleReactionReceived]);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden pointer-events-none">
      {flyingEmojis.map(({ id, emoji, left, duration }) => {
        console.log('DOM: Emoji rendered', { id, emoji, left, duration });
        return (
          <div
            key={id}
            className="absolute text-4xl animate-float-up"
            style={{
              left: `${left}%`,
              bottom: 0,
              willChange: 'transform, opacity',
              animationDuration: `${duration}ms`,
              animationTimingFunction: 'ease-out',
            }}
          >
            {emoji}
          </div>
        );
      })}
    </div>
  );
}

