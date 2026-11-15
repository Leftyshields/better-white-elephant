/**
 * Unit tests for SimulationControls component
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import {
  SimulationControls,
  isSimulationMode,
} from '../../components/dev/SimulationControls.jsx';
import { createMockSocket } from '../utils/testHelpers';

const mockUseParty = vi.hoisted(() =>
  vi.fn(() => ({
    participants: [],
    party: { status: 'LOBBY', id: 'test-party' },
  }))
);

const mockUseGameReferee = vi.hoisted(() =>
  vi.fn(() => ({
    auditLog: [],
    addSnapshotEntry: vi.fn(),
    addLogEntry: vi.fn(),
  }))
);

const mockApiRequest = vi.hoisted(() => vi.fn().mockResolvedValue({ users: {} }));

vi.mock('../../hooks/useParty.js', () => ({
  useParty: mockUseParty,
}));

vi.mock('../../hooks/useGameReferee.js', () => ({
  useGameReferee: mockUseGameReferee,
}));

vi.mock('../../utils/api.js', () => ({
  apiRequest: mockApiRequest,
}));

vi.mock('../../utils/gameValidator.js', () => ({
  validateGameHistory: vi.fn(() => ({ valid: true, errors: [], warnings: [] })),
}));

vi.mock('@heroicons/react/24/outline', () => ({
  ChevronDownIcon: () => null,
  ChevronUpIcon: () => null,
}));

describe('isSimulationMode', () => {
  it('returns true when sim=true is present', () => {
    expect(isSimulationMode('?sim=true')).toBe(true);
    expect(isSimulationMode('?foo=1&sim=true')).toBe(true);
  });

  it('returns false when sim is absent or not true', () => {
    expect(isSimulationMode('')).toBe(false);
    expect(isSimulationMode('?sim=false')).toBe(false);
  });
});

describe('SimulationControls', () => {
  let mockSocket;
  const mockPartyId = 'test-party-id';
  let simMode = true;

  beforeEach(() => {
    mockSocket = createMockSocket();
    simMode = true;
    vi.stubGlobal(
      'URLSearchParams',
      class SimModeParams {
        get(key) {
          if (key !== 'sim') return null;
          return simMode ? 'true' : null;
        }
      }
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not render when sim mode is off', () => {
    simMode = false;
    const { container } = render(
      <SimulationControls socket={mockSocket} partyId={mockPartyId} gameState={null} />
    );
    expect(container.firstChild).toBeNull();
  });

});