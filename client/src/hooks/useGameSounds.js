/**
 * useGameSounds Hook - Game-specific sound effects
 * Provides convenient functions for playing game-related sounds
 */
import { useCallback } from 'react';
import { useSound } from '../contexts/SoundContext.jsx';
import { playPop, playSwoosh, playAlert, playSplat, playClink } from '../utils/soundEngine.js';

export function useGameSounds() {
  const { isMuted } = useSound();

  const playReaction = useCallback(() => {
    playPop(isMuted);
  }, [isMuted]);

  const playSteal = useCallback(() => {
    playClink(isMuted);
  }, [isMuted]);

  const playUnwrap = useCallback(() => {
    playSwoosh(isMuted);
  }, [isMuted]);

  const playTurnNotification = useCallback(() => {
    playAlert(isMuted);
  }, [isMuted]);

  const playSplatSound = useCallback(() => {
    playSplat(isMuted);
  }, [isMuted]);

  return {
    playReaction,
    playSteal,
    playUnwrap,
    playTurnNotification,
    playSplatSound,
  };
}

