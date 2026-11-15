import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { GuestReadyStep } from '../../components/lobby/GuestReadyStep.jsx';
import { LOBBY_STEP_STATUS } from '../../components/lobby/lobbyStepUtils.js';
import { LOBBY_SETUP_STRINGS } from '../../copy/lobbySetupStrings.js';

describe('GuestReadyStep', () => {
  it('shows locked copy when address is missing', () => {
    render(
      <GuestReadyStep
        stepStatus={LOBBY_STEP_STATUS.LOCKED}
        headingId="lobby-step-heading-ready"
        hasGift
        hasAddress={false}
        isReady={false}
        onMarkReady={vi.fn()}
        onUndoReady={vi.fn()}
        onFocusGiftStep={vi.fn()}
        onFocusAddressStep={vi.fn()}
      />,
    );
    expect(screen.getByText(LOBBY_SETUP_STRINGS['guest.ready.locked.address'])).toBeInTheDocument();
  });

  it('calls onMarkReady from CTA when active', () => {
    const onMarkReady = vi.fn();
    render(
      <GuestReadyStep
        stepStatus={LOBBY_STEP_STATUS.ACTIVE}
        headingId="lobby-step-heading-ready"
        hasGift
        hasAddress
        isReady={false}
        onMarkReady={onMarkReady}
        onUndoReady={vi.fn()}
        onFocusGiftStep={vi.fn()}
        onFocusAddressStep={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('guest-ready-cta'));
    expect(onMarkReady).toHaveBeenCalled();
  });

  it('shows done and undo when ready', () => {
  const onUndoReady = vi.fn();
    render(
      <GuestReadyStep
        stepStatus={LOBBY_STEP_STATUS.DONE}
        headingId="lobby-step-heading-ready"
        hasGift
        hasAddress
        isReady
        onMarkReady={vi.fn()}
        onUndoReady={onUndoReady}
        onFocusGiftStep={vi.fn()}
        onFocusAddressStep={vi.fn()}
      />,
    );
    expect(screen.getByText(LOBBY_SETUP_STRINGS['guest.ready.done'])).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('guest-ready-undo'));
    expect(onUndoReady).toHaveBeenCalled();
  });
});