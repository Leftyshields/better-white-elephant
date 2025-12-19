/**
 * Test setup file for Vitest
 * Configures testing environment and global mocks
 */
import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock Firebase
vi.mock('../utils/firebase.js', () => ({
  auth: {
    currentUser: {
      getIdToken: vi.fn(() => Promise.resolve('mock-token')),
    },
  },
  db: {},
}));

// Mock Socket.io client
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    connected: true,
    id: 'mock-socket-id',
  })),
}));

// Global test utilities
global.window.matchMedia = vi.fn((query) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));
