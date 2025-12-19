/**
 * Test utilities for automated frontend testing
 * Provides helpers for simulation mode testing
 */
import { vi } from 'vitest';

/**
 * Navigate to a party page with simulation mode enabled
 * @param {string} partyId - The party ID
 * @param {Object} options - Additional options
 * @returns {string} The URL with sim=true
 */
export function getSimModeUrl(partyId, options = {}) {
  const baseUrl = `/party/${partyId}`;
  const params = new URLSearchParams({ sim: 'true', ...options });
  return `${baseUrl}?${params.toString()}`;
}

/**
 * Wait for simulation controls to be visible
 * @param {Object} screen - Testing Library screen object
 */
export async function waitForSimControls(screen) {
  return await screen.findByText(/SIM TOOLS/i);
}

/**
 * Get simulation control elements
 * @param {Object} screen - Testing Library screen object
 * @returns {Promise<Object>} Simulation control elements
 */
export async function getSimControls(screen) {
  const simToolsSection = await screen.findByText(/SIM TOOLS/i);
  return {
    simTools: simToolsSection,
    addBotsButton: screen.queryByRole('button', { name: /add bots/i }),
    autoPlayToggle: screen.queryByLabelText(/auto-play/i),
    resetButton: screen.queryByRole('button', { name: /reset game/i }),
    auditTrail: screen.queryByText(/AUDIT TRAIL/i),
  };
}

/**
 * Wait for game state
 * @param {Function} getStateFn - Function to get current game state
 * @param {Object} expectedState - Expected state properties
 * @param {number} timeout - Timeout in ms
 */
export async function waitForGameState(getStateFn, expectedState, timeout = 5000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const currentState = getStateFn();
    const matches = Object.entries(expectedState).every(([key, value]) => {
      return currentState[key] === value;
    });
    
    if (matches) {
      return currentState;
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  throw new Error(`Game state did not match expected state within ${timeout}ms`);
}

/**
 * Mock socket.io for testing
 */
export function createMockSocket() {
  const handlers = {};
  
  const mockSocket = {
    on: vi.fn((event, handler) => {
      handlers[event] = handler;
      return mockSocket;
    }),
    off: vi.fn((event) => {
      delete handlers[event];
      return mockSocket;
    }),
    emit: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    connected: true,
    id: 'test-socket-id',
    
    // Test helpers
    _trigger: (event, ...args) => {
      if (handlers[event]) {
        handlers[event](...args);
      }
    },
    _reset: () => {
      Object.keys(handlers).forEach(key => delete handlers[key]);
      mockSocket.on.mockClear();
      mockSocket.off.mockClear();
      mockSocket.emit.mockClear();
    },
  };
  
  return mockSocket;
}

/**
 * Create mock game state
 */
export function createMockGameState(overrides = {}) {
  return {
    phase: 'ACTIVE',
    currentPlayerId: 'player-1',
    currentTurnIndex: 0,
    turnOrder: ['player-1', 'player-2', 'player-3'],
    turnQueue: ['player-1', 'player-2', 'player-3'],
    wrappedGifts: ['gift-1', 'gift-2'],
    unwrappedGifts: new Map(),
    history: [],
    config: {
      maxSteals: 3,
      returnToStart: false,
    },
    ...overrides,
  };
}
