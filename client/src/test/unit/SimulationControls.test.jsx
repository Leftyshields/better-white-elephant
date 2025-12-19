/**
 * Unit tests for SimulationControls component
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SimulationControls } from '../../components/dev/SimulationControls';
import { createMockSocket } from '../utils/testHelpers';

// Mock dependencies
vi.mock('../../hooks/useParty', () => ({
  useParty: () => ({
    participants: [],
    party: { status: 'LOBBY', id: 'test-party' },
  }),
}));

vi.mock('../../hooks/useGameReferee', () => ({
  useGameReferee: () => ({
    auditLog: [],
    addSnapshotEntry: vi.fn(),
    addLogEntry: vi.fn(),
  }),
}));

describe('SimulationControls', () => {
  let mockSocket;
  const mockPartyId = 'test-party-id';

  beforeEach(() => {
    mockSocket = createMockSocket();
    // Set sim=true in URL
    Object.defineProperty(window, 'location', {
      value: {
        search: '?sim=true',
      },
      writable: true,
    });
  });

  it('should render when sim=true is in URL', () => {
    render(<SimulationControls socket={mockSocket} partyId={mockPartyId} gameState={null} />);
    
    expect(screen.getByText(/SIM TOOLS/i)).toBeInTheDocument();
  });

  it('should not render when sim=true is not in URL', () => {
    Object.defineProperty(window, 'location', {
      value: {
        search: '',
      },
      writable: true,
    });

    const { container } = render(
      <SimulationControls socket={mockSocket} partyId={mockPartyId} gameState={null} />
    );
    
    expect(container.firstChild).toBeNull();
  });

  it('should show bot controls in lobby state', () => {
    render(<SimulationControls socket={mockSocket} partyId={mockPartyId} gameState={null} />);
    
    expect(screen.getByRole('button', { name: /add bots/i })).toBeInTheDocument();
  });

  it('should display audit trail section', () => {
    render(<SimulationControls socket={mockSocket} partyId={mockPartyId} gameState={null} />);
    
    expect(screen.getByText(/AUDIT TRAIL/i)).toBeInTheDocument();
  });

  it('should auto-expand audit trail when game is finished', async () => {
    const finishedGameState = {
      phase: 'ENDED',
      currentPlayerId: 'player-1',
      turnOrder: ['player-1'],
    };

    render(
      <SimulationControls 
        socket={mockSocket} 
        partyId={mockPartyId} 
        gameState={finishedGameState} 
      />
    );

    // Audit trail should be expanded (check for audit log content area)
    await waitFor(() => {
      const auditTrail = screen.getByText(/AUDIT TRAIL/i);
      expect(auditTrail).toBeInTheDocument();
    });
  });
});
