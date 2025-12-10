/**
 * Reaction Bar Component
 * Fixed position bar at bottom of screen for sending emoji reactions
 */
import { useEffect } from 'react';
import { useGameSounds } from '../hooks/useGameSounds.js';

export function ReactionBar({ onReaction }) {
  const emojis = ['👏', '😂', '😮', '🔥', '🍅', '❄️'];
  const { playReaction, playSplatSound } = useGameSounds();

  useEffect(() => {
    console.log('✅ ReactionBar MOUNTED', { onReaction: !!onReaction });
    console.log('📍 ReactionBar position check:', {
      element: document.querySelector('[data-reaction-bar]'),
      computed: document.querySelector('[data-reaction-bar]')?.getBoundingClientRect(),
    });
  }, [onReaction]);

  const handleClick = (emoji) => {
    console.log('🎯 Reaction clicked:', emoji);
    
    // Play reaction sound
    playReaction();
    
    // Special sound for tomato
    if (emoji === '🍅') {
      playSplatSound();
    }
    
    // Optimistic UI: Immediately dispatch local event for instant feedback
    window.dispatchEvent(new CustomEvent('reaction_local', { detail: { emoji } }));
    console.log('✨ Dispatched local reaction event:', emoji);
    
    // Also emit to server for broadcasting to all clients
    if (onReaction) {
      onReaction(emoji);
    } else {
      console.warn('⚠️ onReaction callback not provided');
    }
  };

  return (
    <div 
      className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100]"
      data-reaction-bar="true"
      style={{ 
        position: 'fixed !important',
        bottom: '2rem !important',
        left: '50% !important',
        transform: 'translateX(-50%) !important',
        zIndex: '99999 !important',
        backgroundColor: 'rgba(15, 23, 42, 0.95) !important',
        padding: '12px 24px',
        borderRadius: '9999px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
      }}
    >
      <div className="flex gap-4 items-center">
        {emojis.map((emoji) => (
          <button
            key={emoji}
            onClick={() => handleClick(emoji)}
            className="text-2xl cursor-pointer hover:scale-110 active:scale-90 transition-transform"
            aria-label={`Send ${emoji} reaction`}
            style={{ fontSize: '1.5rem', lineHeight: '1.5rem' }}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}

