/**
 * Sound Engine - Programmatic sound generation using Web Audio API
 * Generates lightweight sounds without requiring external audio files
 */

let audioContext = null;

/**
 * Get or create AudioContext (lazy initialization)
 * AudioContext must be created after user interaction due to browser autoplay policies
 */
function getAudioContext() {
  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    } catch (error) {
      console.warn('Web Audio API not supported:', error);
      return null;
    }
  }
  // Resume context if suspended (required by some browsers)
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  return audioContext;
}

/**
 * Play a tone with specified frequency, duration, and envelope
 */
function playTone(frequency, duration, volume = 0.3, type = 'sine', envelope = null) {
  const ctx = getAudioContext();
  if (!ctx) return;

  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.type = type;
  oscillator.frequency.value = frequency;

  // Apply envelope if provided, otherwise use simple fade
  if (envelope) {
    const now = ctx.currentTime;
    gainNode.gain.setValueAtTime(0, now);
    envelope.forEach(({ time, value }) => {
      gainNode.gain.setValueAtTime(value * volume, now + time);
    });
  } else {
    // Simple fade in/out
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
  }

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  oscillator.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + duration);
}

/**
 * Play pop sound - High-pitch pop (for reactions)
 */
export function playPop(isMuted = false) {
  if (isMuted) return;
  
  const ctx = getAudioContext();
  if (!ctx) return;

  // Short high-frequency tone with quick attack/decay
  const frequency = 800 + Math.random() * 400; // 800-1200Hz
  playTone(frequency, 0.05, 0.2, 'sine', [
    { time: 0, value: 0 },
    { time: 0.005, value: 1 },
    { time: 0.05, value: 0 },
  ]);
}

/**
 * Play swoosh sound - Frequency sweep (for card flip/unwrap)
 */
export function playSwoosh(isMuted = false) {
  if (isMuted) return;
  
  const ctx = getAudioContext();
  if (!ctx) return;

  // Frequency sweep from low to high
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(200, ctx.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.15);
  
  gainNode.gain.setValueAtTime(0, ctx.currentTime);
  gainNode.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
  
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  
  oscillator.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + 0.15);
}

/**
 * Play alert sound - Pleasant chime (for turn notification)
 */
export function playAlert(isMuted = false) {
  if (isMuted) return;
  
  const ctx = getAudioContext();
  if (!ctx) return;

  // Two-tone chime: C5 (523Hz) + E5 (659Hz)
  const now = ctx.currentTime;
  
  // First tone
  playTone(523, 0.2, 0.25, 'sine', [
    { time: 0, value: 0 },
    { time: 0.01, value: 1 },
    { time: 0.2, value: 0 },
  ]);
  
  // Second tone (slightly delayed)
  setTimeout(() => {
    playTone(659, 0.2, 0.25, 'sine', [
      { time: 0, value: 0 },
      { time: 0.01, value: 1 },
      { time: 0.2, value: 0 },
    ]);
  }, 50);
}

/**
 * Play splat sound - Low thud with high pop (for tomato reaction)
 */
export function playSplat(isMuted = false) {
  if (isMuted) return;
  
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  
  // Low thud
  playTone(100, 0.1, 0.3, 'sine', [
    { time: 0, value: 0 },
    { time: 0.005, value: 1 },
    { time: 0.1, value: 0 },
  ]);
  
  // High pop (slightly delayed)
  setTimeout(() => {
    playTone(2000, 0.05, 0.2, 'sine', [
      { time: 0, value: 0 },
      { time: 0.002, value: 1 },
      { time: 0.05, value: 0 },
    ]);
  }, 20);
}

/**
 * Play clink sound - Metallic ping (for steal/toast)
 */
export function playClink(isMuted = false) {
  if (isMuted) return;
  
  const ctx = getAudioContext();
  if (!ctx) return;

  // Metallic ping with quick decay
  playTone(1000, 0.1, 0.25, 'sine', [
    { time: 0, value: 0 },
    { time: 0.002, value: 1 },
    { time: 0.05, value: 0.3 },
    { time: 0.1, value: 0 },
  ]);
}

