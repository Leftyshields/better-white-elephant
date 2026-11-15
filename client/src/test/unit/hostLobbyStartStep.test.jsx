import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HostLobbyStartStep } from '../../components/hostLobby/HostLobbyStartStep.jsx';
import { computeLobbyReadiness } from '../../utils/computeLobbyReadiness.js';
import lobbySetupStrings from '../../copy/lobbySetupStrings.js';

const PARTY = { adminId: 'host' };

function baseReadiness(overrides = {}) {
  return computeLobbyReadiness({
    party: PARTY,
    participants: [
      { id: 'host', status: 'GOING', ready: false },
      { id: 'guest-a', status: 'GOING', ready: false },
    ],
    gifts: [
      { submitterId: 'host', id: 'g1' },
      { submitterId: 'guest-a', id: 'g2' },
    ],
    addressesByUserId: {
      host: { street: '1 Main', city: 'Town' },
    },
    ...overrides,
  });
}

describe('HostLobbyStartStep', () => {
  it('shows locked copy when host gift or address is missing', () => {
    const readiness = computeLobbyReadiness({
      party: PARTY,
      participants: [{ id: 'host', status: 'GOING', ready: false }],
      gifts: [],
      addressesByUserId: { host: null },
    });
    render(
      <HostLobbyStartStep
        readiness={readiness}
        displayNamesByUserId={{}}
        startDisabled
        onStartGame={() => {}}
      />,
    );
    expect(screen.getByText(/Add your gift and shipping address/)).toBeInTheDocument();
  });

  it('shows amber count and wait lines when waiting', () => {
    const readiness = baseReadiness();
    render(
      <HostLobbyStartStep
        readiness={readiness}
        displayNamesByUserId={{ 'guest-a': 'Sam' }}
        startDisabled
        onStartGame={() => {}}
      />,
    );
    expect(screen.getByText('1 of 2 ready')).toBeInTheDocument();
    expect(screen.getByText(lobbySetupStrings['host.start.disabled'])).toBeInTheDocument();
    const start = screen.getByRole('button', { name: lobbySetupStrings['host.start.cta'] });
    expect(start).toBeDisabled();
  });

  it('shows all-ready state and enabled start', () => {
    const readiness = baseReadiness({
      participants: [
        { id: 'host', status: 'GOING', ready: false },
        { id: 'guest-a', status: 'GOING', ready: true },
      ],
    });
    render(
      <HostLobbyStartStep
        readiness={readiness}
        displayNamesByUserId={{ 'guest-a': 'Sam' }}
        startDisabled={false}
        onStartGame={() => {}}
      />,
    );
    expect(screen.getByText(lobbySetupStrings['host.start.all_ready'])).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: lobbySetupStrings['host.start.cta'] }),
    ).not.toBeDisabled();
  });

  it('uses Player id8 fallback in wait list, not email', () => {
    const readiness = baseReadiness({
      participants: [
        { id: 'host', status: 'GOING', ready: false },
        { id: 'guest-x', status: 'PENDING', ready: false },
      ],
      gifts: [{ submitterId: 'host', id: 'g1' }],
    });
    render(
      <HostLobbyStartStep
        readiness={readiness}
        displayNamesByUserId={{ 'guest-x': 'leaky@example.com' }}
        startDisabled
        onStartGame={() => {}}
      />,
    );
    expect(screen.getByText(/Player guest-x/)).toBeInTheDocument();
    expect(screen.queryByText(/leaky@example.com/)).not.toBeInTheDocument();
  });

  it('renders live count with aria-live polite', () => {
    const readiness = baseReadiness();
    const { container } = render(
      <HostLobbyStartStep
        readiness={readiness}
        displayNamesByUserId={{}}
        startDisabled
        onStartGame={() => {}}
      />,
    );
    const live = container.querySelector('[aria-live="polite"]');
    expect(live).toHaveTextContent('1 of 2 ready');
  });
});