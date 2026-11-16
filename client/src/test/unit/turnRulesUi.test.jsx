/**
 * BUG-16 turn rules in the UI: a turn is pick OR steal, picking ends it, and you can't
 * pick your own wrapped gift unless it is the last one left.
 */
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GiftGrid } from '../../components/GiftGrid.jsx';
import { RulesContent } from '../../components/RulesContent.jsx';
import { PartyModalProvider } from '../../contexts/PartyModalContext.jsx';
import { canPlayerSkipTurn } from '../../utils/skipTurnEligibility.js';
import { hasPickedThisTurn, isOwnWrappedGiftLocked } from '../../utils/turnRules.js';
import { GAME_USER_COPY } from '../../utils/gameUserCopy.js';
import { gameActions } from '../../reducers/gameReducer.js';
import { useGameEngine } from '../../hooks/useGameEngine.js';

vi.mock('../../hooks/useAuth.js', () => ({
  useAuth: () => ({ user: { uid: 'me' }, loading: false, signInWithGoogle: vi.fn() }),
}));
vi.mock('../../hooks/useParty.js', () => ({
  useParty: () => ({ gifts: [], participants: [], party: null }),
}));
vi.mock('../../utils/firebase.js', () => ({ auth: { currentUser: null } }));

const OWN_GIFT_COPY = 'Your gift. Pick another one.';

function wrappedGifts(ids) {
  return Object.fromEntries(ids.map((id) => [id, { id, isWrapped: true, ownerId: null }]));
}

describe('turn rule helpers', () => {
  it('hasPickedThisTurn reads the server turnAction entries', () => {
    expect(hasPickedThisTurn({ turnAction: [['me', 'PICKED']] }, 'me')).toBe(true);
    expect(hasPickedThisTurn({ turnAction: [['me', null]] }, 'me')).toBe(false);
    expect(hasPickedThisTurn(null, 'me')).toBe(false);
  });

  it('own wrapped gift is locked with 2+ wrapped left, unlocked when last, ignored on older games', () => {
    const gameState = { giftSubmitters: { mine: 'me', theirs: 'them' } };
    expect(isOwnWrappedGiftLocked(gameState, wrappedGifts(['mine', 'theirs']), 'mine', 'me')).toBe(true);
    expect(isOwnWrappedGiftLocked(gameState, wrappedGifts(['mine', 'theirs']), 'theirs', 'me')).toBe(false);
    expect(isOwnWrappedGiftLocked(gameState, wrappedGifts(['mine']), 'mine', 'me')).toBe(false);
    expect(isOwnWrappedGiftLocked({}, wrappedGifts(['mine', 'theirs']), 'mine', 'me')).toBe(false);
  });

  it('Skip is hidden right after a pick even though the player now holds a gift', () => {
    const args = {
      gifts: { g1: { isWrapped: false, ownerId: 'me', isFrozen: false, lastOwnerId: null } },
      gameState: { config: { returnToStart: false }, turnOrder: ['me', 'other'], turnAction: [['me', 'PICKED']] },
      currentTurnIndex: 0,
      turnQueue: ['me', 'other', 'me'],
      userId: 'me',
      activePlayerId: 'me',
    };
    expect(canPlayerSkipTurn(args)).toBe(false);
    expect(canPlayerSkipTurn({ ...args, gameState: { ...args.gameState, turnAction: [['me', null]] } })).toBe(true);
  });
});

describe('useGameEngine hides Steal and Skip after a pick', () => {
  function renderWithState(turnAction) {
    const { result } = renderHook(() => useGameEngine('party-1'));
    act(() => {
      result.current.dispatch(
        gameActions.gameStateReceived(
          {
            partyId: 'party-1',
            phase: 'ACTIVE',
            config: { maxSteals: 3, returnToStart: true },
            turnOrder: ['other', 'me'],
            turnQueue: ['other', 'me', 'me', 'other'],
            currentTurnIndex: 2,
            currentPlayerId: 'me',
            currentVictim: null,
            wrappedGifts: [],
            unwrappedGifts: [
              ['g-other', { ownerId: 'other', stealCount: 0, isFrozen: false, lastOwnerId: null }],
              ['g-me', { ownerId: 'me', stealCount: 0, isFrozen: false, lastOwnerId: null }],
            ],
            turnAction,
            history: [],
            stateVersion: 1,
          },
          [
            { id: 'g-other', submitterId: 'other' },
            { id: 'g-me', submitterId: 'me' },
          ],
          [],
        ),
      );
    });
    return result;
  }

  it('fresh turn (same player again): Steal and Skip available', () => {
    const result = renderWithState([['other', null], ['me', null]]);
    expect(result.current.derived.isMyTurn).toBe(true);
    expect(result.current.derived.canSteal('g-other')).toBe(true);
    expect(result.current.derived.canSkipTurn).toBe(true);
  });

  it('after a pick: no Steal, no Skip, no Pick', () => {
    const result = renderWithState([['other', null], ['me', 'PICKED']]);
    expect(result.current.derived.isMyTurn).toBe(true);
    expect(result.current.derived.canSteal('g-other')).toBe(false);
    expect(result.current.derived.canSkipTurn).toBe(false);
    expect(result.current.derived.canPick).toBe(false);
  });
});

describe('GiftGrid own wrapped gift', () => {
  function renderGrid({ wrappedIds, lockedIds }) {
    const pickGift = vi.fn();
    render(
      <GiftGrid
        gifts={Object.fromEntries(
          wrappedIds.map((id) => [id, { id, isWrapped: true, ownerId: null, submitterId: id === 'mine' ? 'me' : 'them' }]),
        )}
        isMyTurn
        canPick
        canSteal={() => false}
        isOwnGiftLocked={(id) => lockedIds.includes(id)}
        actions={{ pickGift, stealGift: vi.fn() }}
        currentPlayerId="me"
        userId="me"
      />,
    );
    return pickGift;
  }

  it('is aria-disabled, focusable, shows the reason, and does not pick', () => {
    const pickGift = renderGrid({ wrappedIds: ['mine', 'theirs'], lockedIds: ['mine'] });
    expect(GAME_USER_COPY.ownGiftPick).toBe(OWN_GIFT_COPY);
    const reason = screen.getByText(OWN_GIFT_COPY);
    const ownCard = document.getElementById('gift-mine');
    expect(ownCard).toHaveAttribute('aria-disabled', 'true');
    expect(ownCard).toHaveAttribute('tabindex', '0');
    expect(ownCard).not.toHaveAttribute('disabled');
    expect(ownCard).toHaveAttribute('aria-describedby', reason.id);

    fireEvent.click(ownCard);
    fireEvent.keyDown(ownCard, { key: 'Enter' });
    expect(pickGift).not.toHaveBeenCalled();

    const otherCard = document.getElementById('gift-theirs');
    expect(otherCard).not.toHaveAttribute('aria-disabled');
    fireEvent.keyDown(otherCard, { key: 'Enter' });
    expect(pickGift).toHaveBeenCalledWith('theirs');
  });

  it('unlocks when it is the last wrapped gift', () => {
    const pickGift = renderGrid({ wrappedIds: ['mine'], lockedIds: [] });
    expect(screen.queryByText(OWN_GIFT_COPY)).toBeNull();
    fireEvent.click(document.getElementById('gift-mine'));
    expect(pickGift).toHaveBeenCalledWith('mine');
  });
});

describe('Rules page turn lines (Copywriter final)', () => {
  it('shows the three turn rules', () => {
    render(
      <MemoryRouter>
        <PartyModalProvider>
          <RulesContent pageHeading="Rules" />
        </PartyModalProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText("On your turn, pick a wrapped gift or steal one that's been opened. Either one ends your turn.")).toBeInTheDocument();
    expect(screen.getByText('If someone steals your gift, you go next.')).toBeInTheDocument();
    expect(screen.getByText("You can't pick the gift you brought, unless it's the last one left.")).toBeInTheDocument();
    expect(
      screen.getByText(
        "When a gift is stolen from you, you can't steal it right back on your next turn. Pick a wrapped gift or steal a different one.",
      ),
    ).toBeInTheDocument();
  });
});
