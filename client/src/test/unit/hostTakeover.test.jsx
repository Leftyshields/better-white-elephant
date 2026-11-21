/**
 * BUG-23: away player and the host's one takeover control.
 * Host-only gating in the real GameRoom, the slot's honest states (hint, label, busy, refusals),
 * the host-assist feed lines, and the signed copy.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

const NOW = Date.now();
const HOST = 'host-uid';

function fakeSocket() {
  const handlers = new Map();
  const emits = [];
  let pendingAck = null;
  return {
    emits,
    on(event, fn) {
      handlers.set(event, [...(handlers.get(event) || []), fn]);
    },
    off(event, fn) {
      handlers.set(event, fn ? (handlers.get(event) || []).filter((h) => h !== fn) : []);
    },
    fire(event, payload) {
      for (const fn of handlers.get(event) || []) fn(payload);
    },
    timeout() {
      return {
        emit: (event, payload, ack) => {
          emits.push({ event, payload });
          pendingAck = ack;
        },
      };
    },
    ack(error, result) {
      const fn = pendingAck;
      pendingAck = null;
      fn?.(error, result);
    },
  };
}

const gift = (ownerId, extra = {}) => ({ ownerId, stealCount: 0, isFrozen: false, lastOwnerId: null, ...extra });

/** Host first, Alex (a) up now holding nothing, two wrapped gifts left. */
function rawGameState(overrides = {}) {
  return {
    partyId: 'party-1',
    phase: 'ACTIVE',
    config: { maxSteals: 3, returnToStart: false },
    turnOrder: [HOST, 'a', 'b'],
    turnQueue: [HOST, 'a', 'b', HOST],
    currentTurnIndex: 1,
    currentVictim: null,
    currentPlayerId: 'a',
    wrappedGifts: ['g2', 'g3'],
    unwrappedGifts: [['g1', gift(HOST)]],
    turnAction: [],
    history: [],
    turnStartedAt: new Date(NOW - 40_000).toISOString(),
    ...overrides,
  };
}

// ---- GameRoom wiring (host-only control) ----------------------------------------------------

const engine = vi.hoisted(() => ({ value: null }));
const auth = vi.hoisted(() => ({ user: null }));

vi.mock('../../hooks/useGameEngine.js', () => ({ useGameEngine: () => engine.value }));
vi.mock('../../hooks/useAuth.js', () => ({ useAuth: () => ({ user: auth.user }) }));
vi.mock('../../hooks/useParty.js', () => ({
  useParty: () => ({
    party: { id: 'party-1', adminId: HOST, status: 'ACTIVE', config: {} },
    participants: [
      { id: HOST, displayName: 'Dana', status: 'GOING' },
      { id: 'a', displayName: 'Alex', status: 'GOING' },
      { id: 'b', displayName: 'Bo', status: 'GOING' },
      { id: 'bot_1', displayName: 'Robo', status: 'GOING' },
    ],
  }),
}));
vi.mock('../../hooks/useGameSounds.js', () => ({
  useGameSounds: () => ({ playTurnNotification: vi.fn(), playSteal: vi.fn(), playUnwrap: vi.fn() }),
}));
vi.mock('../../utils/api.js', () => ({ apiRequest: vi.fn(async () => ({ users: {} })) }));
vi.mock('canvas-confetti', () => ({ default: vi.fn() }));
vi.mock('../../components/GiftGrid.jsx', () => ({ GiftGrid: () => null }));
vi.mock('../../components/dev/SimulationControls.jsx', () => ({ SimulationControls: () => null }));
vi.mock('../../components/ReactionBar.jsx', () => ({ ReactionBar: () => null }));
vi.mock('../../components/ReactionOverlay.jsx', () => ({ ReactionOverlay: () => null }));

const { GameRoom } = await import('../../pages/GameRoom.jsx');
const { HostTakeoverSlot } = await import('../../components/HostTakeoverSlot.jsx');
const { latestActivityLine } = await import('../../components/GameTicker.jsx');
const { HOST_TAKEOVER_COPY, isHostTakeoverNotice } = await import('../../utils/hostTakeoverCopy.js');
const { GAME_USER_COPY } = await import('../../utils/gameUserCopy.js');

function setEngine(socket, gameState, activePlayerId = gameState.currentPlayerId) {
  engine.value = {
    state: {
      status: 'PLAYING',
      ui: { isSocketConnected: true, lastError: null },
      gameState,
      activePlayerId,
      participants: [{ id: HOST }, { id: 'a' }, { id: 'b' }, { id: 'bot_1' }],
      gifts: {},
      activities: [],
      turnQueue: gameState.turnQueue,
      currentTurnIndex: gameState.currentTurnIndex,
    },
    actions: { pickGift: vi.fn(), stealGift: vi.fn(), endTurn: vi.fn() },
    derived: { isMyTurn: activePlayerId === auth.user?.uid, canPick: false, canSkipTurn: false, canSteal: () => false, getStealBlockReason: () => null, isOwnGiftLocked: () => false },
    socket,
    emitReaction: vi.fn(),
    dispatch: vi.fn(),
    joinDeniedAsNonParticipant: false,
  };
}

function renderRoom({ userId, gameState = rawGameState(), awaySinceAgoMs = 40_000 }) {
  auth.user = { uid: userId };
  const socket = fakeSocket();
  setEngine(socket, gameState);
  render(<GameRoom partyId="party-1" />);
  act(() => {
    socket.fire('presence-snapshot', {
      away: awaySinceAgoMs == null ? [] : [{ userId: 'a', awaySince: NOW - awaySinceAgoMs }],
      serverNow: Date.now(),
    });
  });
  return socket;
}

describe('GameRoom: away player and the host control', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('host sees the away tag, the away turn line, and one control labeled with the move', () => {
    renderRoom({ userId: HOST });
    expect(screen.getByTestId('away-turn-line').textContent).toBe("Alex's turn (away)");
    expect(screen.getAllByTestId('away-chip-tag')).toHaveLength(1);
    expect(screen.getByTestId('away-chip-tag').textContent).toBe('Away');
    expect(screen.getByTestId('away-chip-tag').className).toContain('text-[11px]');
    const button = screen.getByTestId('host-takeover-button');
    expect(button.textContent).toBe('Pick a gift for Alex');
    expect(button.className).toContain('min-h-11');
    expect(screen.queryByText(/Waiting for/)).toBeNull();
  });

  it('a non-host sees the away tag and line, but no control and no countdown', () => {
    renderRoom({ userId: 'b' });
    expect(screen.getByTestId('away-turn-line').textContent).toBe("Alex's turn (away)");
    expect(screen.getByTestId('away-chip-tag')).toBeTruthy();
    expect(screen.queryByTestId('host-takeover-slot')).toBeNull();
    expect(screen.queryByText(/You can take/)).toBeNull();
  });

  it('nobody away and a fresh turn: no tag, the normal waiting line, and no slot even for the host', () => {
    renderRoom({ userId: HOST, awaySinceAgoMs: null, gameState: rawGameState({ turnStartedAt: new Date(NOW - 5000).toISOString() }) });
    expect(screen.queryByTestId('away-chip-tag')).toBeNull();
    expect(screen.queryByTestId('away-turn-line')).toBeNull();
    expect(screen.getByText(/Waiting for/)).toBeTruthy();
    expect(screen.queryByTestId('host-takeover-slot')).toBeNull();
  });

  it('never offers the control for a bot seat', () => {
    renderRoom({
      userId: HOST,
      awaySinceAgoMs: null,
      gameState: rawGameState({
        turnOrder: [HOST, 'bot_1', 'b'],
        turnQueue: [HOST, 'bot_1', 'b', HOST],
        currentPlayerId: 'bot_1',
        turnStartedAt: new Date(NOW - 200_000).toISOString(),
      }),
    });
    expect(screen.queryByTestId('host-takeover-slot')).toBeNull();
  });
});

// ---- The slot on its own --------------------------------------------------------------------

function renderSlot({ gameState = rawGameState(), presence = { awaySince: NOW - 40_000, returnedAt: null }, playerName = 'Alex', onNotice = vi.fn(), socket = fakeSocket() } = {}) {
  const view = render(
    <HostTakeoverSlot
      socket={socket}
      partyId="party-1"
      gameState={gameState}
      playerId="a"
      playerName={playerName}
      presence={presence}
      serverOffsetMs={0}
      onNotice={onNotice}
    />,
  );
  return { socket, onNotice, ...view };
}

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 450)));

describe('HostTakeoverSlot', () => {
  it('away 10s: the hint counts down to the 30s rule, with no button yet', () => {
    renderSlot({ presence: { awaySince: NOW - 10_000, returnedAt: null } });
    const hint = screen.getByTestId('host-takeover-hint');
    expect(hint.textContent).toMatch(/^You can take Alex's turn in (19|20)s$/);
    expect(hint.getAttribute('aria-live')).toBe('off');
    expect(screen.queryByTestId('host-takeover-button')).toBeNull();
  });

  it('connected but idle: nothing before 60s, a hint from 60s, the control at 90s', () => {
    const at = (ago) => rawGameState({ turnStartedAt: new Date(NOW - ago).toISOString() });
    const connected = { awaySince: null, returnedAt: null };
    const first = renderSlot({ gameState: at(50_000), presence: connected });
    expect(screen.queryByTestId('host-takeover-slot')).toBeNull();
    first.unmount();
    const second = renderSlot({ gameState: at(65_000), presence: connected });
    expect(screen.getByTestId('host-takeover-hint').textContent).toMatch(/in (24|25)s$/);
    second.unmount();
    renderSlot({ gameState: at(91_000), presence: connected });
    expect(screen.getByTestId('host-takeover-button').textContent).toBe('Pick a gift for Alex');
  });

  it('holds the control back while the name is unresolved', () => {
    renderSlot({ playerName: null });
    expect(screen.queryByTestId('host-takeover-slot')).toBeNull();
  });

  it('labels each move the server will make', () => {
    const cases = [
      [rawGameState({ unwrappedGifts: [['g1', gift(HOST)], ['g2', gift('a')]], wrappedGifts: ['g3'] }), 'Let Alex keep their gift'],
      [
        rawGameState({ turnOrder: ['a', HOST, 'b'], turnQueue: ['a', HOST, 'b', 'a'], currentTurnIndex: 3, wrappedGifts: [], unwrappedGifts: [['g1', gift(HOST)], ['g2', gift('a')], ['g3', gift('b')]] }),
        'Let Alex keep their gift and end the game',
      ],
      [rawGameState({ currentVictim: 'a', wrappedGifts: [], unwrappedGifts: [['g1', gift(HOST)], ['g3', gift('b')]] }), 'Steal a random gift for Alex'],
      [
        rawGameState({ currentVictim: 'a', wrappedGifts: [], unwrappedGifts: [['g1', gift(HOST, { isFrozen: true })], ['g3', gift('b', { lastOwnerId: 'a' })]] }),
        "Skip Alex's turn",
      ],
    ];
    for (const [gameState, label] of cases) {
      const view = renderSlot({ gameState });
      expect(screen.getByTestId('host-takeover-button').textContent).toBe(label);
      view.unmount();
    }
  });

  it('ignores a tap in the first 400ms, then sends the shown move with the turn key', async () => {
    const gameState = rawGameState();
    const { socket } = renderSlot({ gameState });
    fireEvent.click(screen.getByTestId('host-takeover-button'));
    expect(socket.emits).toHaveLength(0);
    await settle();
    fireEvent.click(screen.getByTestId('host-takeover-button'));
    expect(socket.emits).toEqual([
      {
        event: 'host_take_turn_for_away',
        payload: { partyId: 'party-1', playerId: 'a', action: 'pick', turnKey: gameState.turnStartedAt },
      },
    ]);
  });

  it('is busy at once, ignores more taps, and shows the matching notice when refused', async () => {
    const { socket, onNotice } = renderSlot();
    await settle();
    const button = screen.getByTestId('host-takeover-button');
    fireEvent.click(button);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.textContent).toBe('Working...');
    fireEvent.click(button);
    fireEvent.click(button);
    expect(socket.emits).toHaveLength(1);

    act(() => socket.ack(null, { ok: false, code: 'PLAYER_BACK' }));
    expect(onNotice).toHaveBeenCalledWith("Alex is back, so it's their turn again. Nothing changed.");
    expect(button.getAttribute('aria-busy')).toBe('false');
    expect(button.textContent).toBe('Pick a gift for Alex');
  });

  it('maps every refusal to its signed notice, and a timeout to the generic error', async () => {
    const outcomes = [
      [[null, { ok: false, code: 'TURN_MOVED' }], 'That turn already ended, so nothing changed.'],
      [[null, { ok: false, code: 'NOT_YET' }], "It's not time yet. Try again in a few seconds."],
      [[null, { ok: false, code: 'NOT_HOST' }], GAME_USER_COPY.actionFailedGeneric],
      [[new Error('timeout')], GAME_USER_COPY.actionFailedGeneric],
    ];
    for (const [ackArgs, notice] of outcomes) {
      const { socket, onNotice, unmount } = renderSlot();
      await settle();
      fireEvent.click(screen.getByTestId('host-takeover-button'));
      act(() => socket.ack(...ackArgs));
      expect(onNotice).toHaveBeenCalledWith(notice);
      unmount();
    }
  });

  it('a success shows no notice (the turn line and feed are the feedback)', async () => {
    const { socket, onNotice } = renderSlot();
    await settle();
    fireEvent.click(screen.getByTestId('host-takeover-button'));
    act(() => socket.ack(null, { ok: true }));
    expect(onNotice).not.toHaveBeenCalled();
  });
});

// ---- Feed lines and copy ----------------------------------------------------------------------

describe('host-assist feed lines', () => {
  const gifts = [{ id: 'g2', title: 'Mug' }];
  const names = { [HOST]: 'Dana', a: 'Alex', b: 'Bo' };
  const line = (activity) => latestActivityLine([activity], gifts, names);

  it('uses the signed line for each assisted move; ordinary skips stay out of the feed', () => {
    expect(line({ type: 'PICK', playerId: 'a', giftId: 'g2', assistedBy: HOST, assistedAction: 'pick' })).toBe('Dana picked Mug for Alex');
    expect(line({ type: 'END_TURN', playerId: 'a', assistedBy: HOST, assistedAction: 'keep' })).toBe('Dana let Alex keep their gift');
    expect(line({ type: 'END_TURN', playerId: 'a', assistedBy: HOST, assistedAction: 'keep_and_end' })).toBe('Dana let Alex keep their gift. Game over.');
    expect(line({ type: 'STEAL', playerId: 'a', giftId: 'g2', previousOwnerId: 'b', assistedBy: HOST, assistedAction: 'steal' })).toBe('Dana stole Mug from Bo for Alex');
    expect(line({ type: 'END_TURN', playerId: 'a', assistedBy: HOST, assistedAction: 'skip' })).toBe("Dana skipped Alex's turn");
    expect(line({ type: 'END_TURN', playerId: 'a' })).toBeNull();
    expect(line({ type: 'PICK', playerId: 'a', giftId: 'g2' })).toBe('Alex picked Mug');
  });
});

describe('BUG-23 copy is the signed set, verbatim', () => {
  it('matches Copywriter strings exactly and has no dashes', () => {
    expect(HOST_TAKEOVER_COPY).toEqual({
      awayChipTag: 'Away',
      awayChipTitle: '{name}, away',
      awayTurnLine: "{name}'s turn (away)",
      hint: "You can take {name}'s turn in {seconds}s",
      readySr: "You can take {name}'s turn now.",
      actions: {
        pick: 'Pick a gift for {name}',
        keep: 'Let {name} keep their gift',
        keep_and_end: 'Let {name} keep their gift and end the game',
        steal: 'Steal a random gift for {name}',
        skip: "Skip {name}'s turn",
      },
      busy: 'Working...',
      playerBack: "{name} is back, so it's their turn again. Nothing changed.",
      turnMoved: 'That turn already ended, so nothing changed.',
      notYet: "It's not time yet. Try again in a few seconds.",
      feed: {
        pick: '{hostName} picked {giftTitle} for {name}',
        keep: '{hostName} let {name} keep their gift',
        keep_and_end: '{hostName} let {name} keep their gift. Game over.',
        steal: '{hostName} stole {giftTitle} from {victimName} for {name}',
        skip: "{hostName} skipped {name}'s turn",
      },
    });
    expect(JSON.stringify(HOST_TAKEOVER_COPY)).not.toMatch(/[\u2013\u2014]/);
  });

  it('refusals are amber notices, other messages are not', () => {
    expect(isHostTakeoverNotice("Alex is back, so it's their turn again. Nothing changed.")).toBe(true);
    expect(isHostTakeoverNotice('That turn already ended, so nothing changed.')).toBe(true);
    expect(isHostTakeoverNotice(GAME_USER_COPY.actionFailedGeneric)).toBe(false);
  });
});
