/**
 * Sound Context - Global mute state management
 */
import { createContext, useContext, useState, useEffect } from 'react';

const SoundContext = createContext(null);

export function SoundProvider({ children }) {
  // Load mute state from localStorage, default to false (unmuted)
  const [isMuted, setIsMuted] = useState(() => {
    const saved = localStorage.getItem('soundMuted');
    return saved ? JSON.parse(saved) : false;
  });

  // Persist mute state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('soundMuted', JSON.stringify(isMuted));
  }, [isMuted]);

  const toggleMute = () => {
    setIsMuted(prev => !prev);
  };

  const value = {
    isMuted,
    toggleMute,
  };

  return (
    <SoundContext.Provider value={value}>
      {children}
    </SoundContext.Provider>
  );
}

export function useSound() {
  const context = useContext(SoundContext);
  if (!context) {
    throw new Error('useSound must be used within SoundProvider');
  }
  return context;
}

