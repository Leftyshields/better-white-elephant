import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { GAME_USER_COPY } from '../../utils/gameUserCopy.js';
import {
  effectiveGameRoomBatchStatus,
  gameRoomNameStates,
  lookupNameState,
  participantNeedsBatchName,
} from '../../utils/seatDisplayName.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const gameRoomSource = readFileSync(join(root, 'pages/GameRoom.jsx'), 'utf8');
const giftCardSource = readFileSync(join(root, 'components/GiftCard.jsx'), 'utf8');
const giftGridSource = readFileSync(join(root, 'components/GiftGrid.jsx'), 'utf8');
const tickerSource = readFileSync(join(root, 'components/GameTicker.jsx'), 'utf8');

describe('G2 game-room name wiring (fails on main)', () => {
  it('GameRoom does not render a uid fragment, undefined, or null as a player name', () => {
    expect(gameRoomSource).not.toMatch(/Player \$\{[^}]*slice\(0,\s*8\)/);
    expect(gameRoomSource).not.toMatch(/Player \$\{currentPlayerId\?\.slice/);
    expect(gameRoomSource).not.toMatch(/Player \$\{ownerId\?\.slice/);
    expect(gameRoomSource).not.toMatch(/Player \$\{participant\.id\.slice/);
  });

  it('GameRoom uses roster seat names and keys the batch fallback on participant ids, not gifts', () => {
    expect(gameRoomSource).toContain('gameRoomNameStates');
    expect(gameRoomSource).toContain('rosterDisplayNames');
    expect(gameRoomSource).toMatch(/participantIdsKey|participant ids|participantIds/);
    expect(gameRoomSource).not.toMatch(/fetchUserNames[\s\S]*state\.gifts/);
    // The batch effect dependency must not include state.gifts
    expect(gameRoomSource).not.toMatch(/}, \[partyId, state\.participants, state\.gifts\]\);/);
  });

  it('GiftCard memo compares ownerName so Held-by updates when the name arrives', () => {
    expect(giftCardSource).toMatch(/prevProps\.ownerName === nextProps\.ownerName/);
  });

  it('GameTicker and GiftGrid use game-room name states, not Player plus a uid', () => {
    expect(tickerSource).not.toMatch(/Player \$\{playerId\.slice/);
    expect(giftGridSource).toMatch(/ownerNameStatus|nameStates|gameRoomNameStates/);
  });
});

describe('gameRoomNameStates', () => {
  const jordan = { id: 'uid-jordan', displayName: 'Jordan', lastInitial: 'L' };
  const sam = { id: 'uid-sam', displayName: 'Sam' };
  const noSeat = { id: 'uid-nosseat' };

  it('uses the seat name on the first frame, with no batch wait', () => {
    const states = gameRoomNameStates([jordan, sam], {}, 'pending');
    expect(states['uid-jordan']).toEqual({ status: 'ready', name: 'Jordan' });
    expect(states['uid-sam']).toEqual({ status: 'ready', name: 'Sam' });
  });

  it('adds the last initial only when first names collide, matching the lobby roster', () => {
    const states = gameRoomNameStates(
      [
        { id: 'a', displayName: 'Jordan', lastInitial: 'L' },
        { id: 'b', displayName: 'Jordan', lastInitial: 'K' },
      ],
      {},
      'pending',
    );
    expect(states.a).toEqual({ status: 'ready', name: 'Jordan L.' });
    expect(states.b).toEqual({ status: 'ready', name: 'Jordan K.' });
  });

  it('is loading when there is no seat name and the batch has not returned, and never uses a uid', () => {
    const states = gameRoomNameStates([noSeat], {}, 'pending');
    expect(states['uid-nosseat']).toEqual({ status: 'loading', name: null });
    expect(states['uid-nosseat'].name).toBeNull();
    expect(JSON.stringify(states['uid-nosseat'])).not.toMatch(/Player uid/);
  });

  it('uses the batch name, formatted like the lobby, once it returns', () => {
    const states = gameRoomNameStates([noSeat], { 'uid-nosseat': 'Sam Rivera' }, 'success');
    expect(states['uid-nosseat']).toEqual({ status: 'ready', name: 'Sam' });
  });

  it('uses the unnamed-player word when the batch fails or returns nothing useful', () => {
    expect(gameRoomNameStates([noSeat], {}, 'failed', GAME_USER_COPY.unnamedPlayer)['uid-nosseat']).toEqual({
      status: 'failed',
      name: 'Player',
    });
    expect(gameRoomNameStates([noSeat], { 'uid-nosseat': 'uid-nosseat' }, 'success', GAME_USER_COPY.unnamedPlayer)['uid-nosseat']).toEqual({
      status: 'failed',
      name: 'Player',
    });
  });

  it('participantNeedsBatchName is true only for seats without a valid public name', () => {
    expect(participantNeedsBatchName(jordan)).toBe(false);
    expect(participantNeedsBatchName(noSeat)).toBe(true);
    expect(participantNeedsBatchName({ id: 'x', displayName: 'x@y.z' })).toBe(true);
  });
});

describe('G2 signed copy', () => {
  it('uses the signed loading label and unnamed-player word, and does not change Held-by copy', () => {
    expect(GAME_USER_COPY.nameLoadingLabel).toBe('Loading player name');
    expect(GAME_USER_COPY.unnamedPlayer).toBe('Player');
    expect(giftCardSource).toContain('Held by you');
    expect(giftCardSource).toContain('Held by:');
    expect(giftCardSource).not.toMatch(/Held by: Player x/);
  });
});

describe('G2 refresh, rejoin, and nameless seats', () => {
  const guestId = 'NWoXg89oABCDEFGH';
  const guest = { id: guestId };
  const unnamed = GAME_USER_COPY.unnamedPlayer;

  function assertNoUid(value) {
    const text = JSON.stringify(value);
    expect(text).not.toMatch(/Player NWoX/);
    expect(text).not.toContain(guestId.slice(0, 8));
    expect(text).not.toMatch(/Player \$\{/);
  }

  it('after a refresh or rejoin, nameless seats show loading, not Player or a uid, even if an empty roster was marked success', () => {
    const emptyStatus = effectiveGameRoomBatchStatus({
      participantIdsKey: '',
      settledKey: '',
      batchStatus: 'success',
      needingCount: 0,
      participantCount: 0,
    });
    expect(emptyStatus).toBe('idle');

    const afterSeatsArrive = effectiveGameRoomBatchStatus({
      participantIdsKey: guestId,
      settledKey: '',
      batchStatus: 'success',
      needingCount: 1,
      participantCount: 1,
    });
    expect(afterSeatsArrive).toBe('pending');

    const states = gameRoomNameStates([guest], {}, afterSeatsArrive, unnamed);
    expect(states[guestId]).toEqual({ status: 'loading', name: null });
    assertNoUid(states[guestId]);

    const heldByLoading = lookupNameState(states, guestId, afterSeatsArrive, unnamed);
    expect(heldByLoading).toEqual({ status: 'loading', name: null });
    assertNoUid(heldByLoading);
  });

  it('Held by: Player is only used when the lookup has actually failed', () => {
    const failed = gameRoomNameStates([guest], {}, 'failed', unnamed);
    expect(failed[guestId]).toEqual({ status: 'failed', name: 'Player' });
    assertNoUid(failed[guestId]);

    const stillLoading = gameRoomNameStates([guest], {}, 'pending', unnamed);
    expect(stillLoading[guestId].name).not.toBe('Player');
    expect(stillLoading[guestId].status).toBe('loading');
  });

  it('handles an anonymous guest with no displayName yet (before I\'m ready): Player or skeleton, never a uid, and no crash', () => {
    const seats = [
      guest,
      { id: 'guest-empty', displayName: '' },
      { id: 'guest-null', displayName: null },
      { id: 'guest-undefined', displayName: undefined },
      { id: undefined },
      {},
    ];

    expect(() => gameRoomNameStates(seats, {}, 'idle', unnamed)).not.toThrow();
    expect(() => gameRoomNameStates(seats, {}, 'pending', unnamed)).not.toThrow();
    expect(() => gameRoomNameStates(seats, {}, 'failed', unnamed)).not.toThrow();
    expect(() => participantNeedsBatchName(guest)).not.toThrow();
    expect(participantNeedsBatchName(guest)).toBe(true);
    expect(participantNeedsBatchName({ id: 'guest-empty', displayName: '' })).toBe(true);

    const loading = gameRoomNameStates(seats, {}, 'idle', unnamed);
    for (const id of [guestId, 'guest-empty', 'guest-null', 'guest-undefined']) {
      expect(loading[id]).toEqual({ status: 'loading', name: null });
      assertNoUid(loading[id]);
    }

    const failed = gameRoomNameStates(seats, {}, 'failed', unnamed);
    for (const id of [guestId, 'guest-empty', 'guest-null', 'guest-undefined']) {
      expect(failed[id]).toEqual({ status: 'failed', name: 'Player' });
      assertNoUid(failed[id]);
    }

    const lookedUp = lookupNameState(loading, guestId, 'idle', unnamed);
    expect(lookedUp).toEqual({ status: 'loading', name: null });
    assertNoUid(lookedUp);
  });
});
