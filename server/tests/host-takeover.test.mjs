/**
 * BUG-23: the host takes one turn for an away or idle player.
 * Rules (shared with the client), presence, the atomic executor on the Redis fake, and the socket
 * handler's host and phase gates.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStandardState, createTestStore, mockIo } from './helpers/test-store.mjs';
import { createAtomicRedis, seedRedisGameState } from './helpers/atomic-test-redis.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..');

const store = createTestStore();
const sharedRedis = createAtomicRedis(store);

mock.module('firebase-admin', {
  defaultExport: { firestore: { Timestamp: { now: () => ({}) } } },
});
mock.module(path.join(serverRoot, 'config/firebase-admin.js'), {
  namedExports: {
    db: {
      collection() {
        return { doc: () => ({ update: async () => {}, get: async () => ({ exists: false, data: () => ({}) }) }) };
      },
    },
  },
});
mock.module(path.join(serverRoot, 'utils/redis.js'), { defaultExport: sharedRedis });
const persistence = await import(path.join(serverRoot, 'utils/game-state-persistence.js'));
mock.module(path.join(serverRoot, 'utils/game-state-persistence.js'), {
  namedExports: {
    prepareGameStateForSave: persistence.prepareGameStateForSave,
    resolvePartyTtlForGameState: async () => 86400,
    saveGameStateToFirestore: async () => true,
    loadGameState: (partyId) => store.loadGameState(partyId),
  },
});

const { executeHostTakeover, isHostTakeoverRejectedError } = await import(
  path.join(serverRoot, 'utils/game-turn-handler.mjs')
);
const { stampTurnStartedAt } = await import(path.join(serverRoot, 'utils/atomic-game-action.mjs'));
const { handleHostTakeTurn } = await import(path.join(serverRoot, 'handlers/host-take-turn.js'));
const { createPresenceTracker } = await import(path.join(serverRoot, 'lib/presence.mjs'));
const {
  AWAY_TAKEOVER_MS,
  IDLE_TAKEOVER_MS,
  MIN_TURN_AGE_MS,
  RETURN_FAIR_MS,
  deriveTakeoverAction,
  takeoverTiming,
  turnKeyOf,
} = await import(path.join(serverRoot, 'shared/host-takeover.mjs'));

const NOW = Date.parse('2026-11-26T20:00:00.000Z');
const HOST = 'host-uid';
const iso = (ms) => new Date(ms).toISOString();
const gift = (ownerId, extra = {}) => ({ ownerId, stealCount: 0, isFrozen: false, lastOwnerId: null, ...extra });
const awayFor = (ms) => () => ({ awaySince: NOW - ms, returnedAt: null });
const connected = () => ({ awaySince: null, returnedAt: null });

/** Host h, then away player a, then b. Turn 2 (a's), a holds nothing, two wrapped gifts left. */
function pickTurnState(partyId, overrides = {}) {
  return {
    ...buildStandardState({
      partyId,
      turnOrder: [HOST, 'a', 'b'],
      currentTurnIndex: 1,
      wrappedGifts: ['g2', 'g3'],
      unwrappedGifts: [['g1', gift(HOST)]],
    }),
    turnStartedAt: iso(NOW - 40_000),
    ...overrides,
  };
}

function seed(partyId, state) {
  seedRedisGameState(store, partyId, state);
  return state;
}

async function stored(partyId) {
  return JSON.parse(await sharedRedis.get(`game:${partyId}`));
}

async function rejectionCode(promise) {
  try {
    await promise;
  } catch (error) {
    assert.ok(isHostTakeoverRejectedError(error), `expected a takeover refusal, got: ${error?.message}`);
    return error.code;
  }
  assert.fail('expected the takeover to be refused');
}

function takeover(partyId, state, overrides = {}) {
  return executeHostTakeover(partyId, {
    hostId: HOST,
    playerId: 'a',
    action: deriveTakeoverAction(state, 'a'),
    turnKey: turnKeyOf(state),
    presence: awayFor(AWAY_TAKEOVER_MS + 1000),
    now: () => NOW,
    random: () => 0,
    ...overrides,
  });
}

test.beforeEach(() => store.reset());

// ---- Rules shared with the client --------------------------------------------------------------

test('label rule: pick when holding nothing with wrapped gifts left', () => {
  assert.equal(deriveTakeoverAction(pickTurnState('p'), 'a'), 'pick');
});

test('label rule: keep when holding a gift in the boomerang round, keep_and_end on the bookend', () => {
  const boomerang = {
    ...pickTurnState('p'),
    config: { maxSteals: 3, returnToStart: true },
    turnQueue: [HOST, 'a', 'b', 'b', 'a', HOST],
    currentTurnIndex: 4,
    wrappedGifts: [],
    unwrappedGifts: [['g1', gift(HOST)], ['g2', gift('a')], ['g3', gift('b')]],
  };
  assert.equal(deriveTakeoverAction(boomerang, 'a'), 'keep');

  const bookend = {
    ...buildStandardState({
      partyId: 'p',
      turnOrder: ['a', HOST, 'b'],
      currentTurnIndex: 3,
      wrappedGifts: [],
      unwrappedGifts: [['g1', gift(HOST)], ['g2', gift('a')], ['g3', gift('b')]],
    }),
  };
  assert.equal(deriveTakeoverAction(bookend, 'a'), 'keep_and_end');
});

test('label rule: steal when nothing is wrapped and a legal steal exists; skip when nothing is legal', () => {
  const victim = {
    ...buildStandardState({
      partyId: 'p',
      turnOrder: [HOST, 'a', 'b', 'c'],
      currentTurnIndex: 2,
      wrappedGifts: [],
      unwrappedGifts: [['g1', gift(HOST)], ['g2', gift('b', { lastOwnerId: 'a' })], ['g3', gift('c')]],
    }),
    currentVictim: 'a',
  };
  assert.equal(deriveTakeoverAction(victim, 'a'), 'steal');

  const deadlock = {
    ...victim,
    unwrappedGifts: [['g1', gift(HOST, { isFrozen: true })], ['g2', gift('b', { lastOwnerId: 'a' })]],
  };
  assert.equal(deriveTakeoverAction(deadlock, 'a'), 'skip');
});

test('timing: usable 30s after going away or 90s into the turn, never in the first 3s', () => {
  const turnStartedAt = NOW - 10_000;
  assert.equal(takeoverTiming({ turnStartedAt, awaySince: NOW - AWAY_TAKEOVER_MS, now: NOW }).usable, true);
  assert.equal(takeoverTiming({ turnStartedAt, awaySince: NOW - 29_000, now: NOW }).usable, false);
  assert.equal(takeoverTiming({ turnStartedAt: NOW - IDLE_TAKEOVER_MS, now: NOW }).usable, true);
  assert.equal(takeoverTiming({ turnStartedAt: NOW - 89_000, now: NOW }).usable, false);
  // Away since before their turn: still not in the first 3 seconds of the turn.
  const early = takeoverTiming({ turnStartedAt: NOW - 1000, awaySince: NOW - 120_000, now: NOW });
  assert.equal(early.usable, false);
  assert.equal(early.availableAt, NOW - 1000 + MIN_TURN_AGE_MS);
});

test('timing: a player who returns at 85s gets a fair 30s, and an early tap says they are back', () => {
  const turnStartedAt = NOW - 95_000;
  const returnedAt = NOW - 10_000;
  const timing = takeoverTiming({ turnStartedAt, returnedAt, now: NOW });
  assert.equal(timing.usable, false);
  assert.equal(timing.reason, 'PLAYER_BACK');
  assert.equal(timing.availableAt, returnedAt + RETURN_FAIR_MS);
});

test('turnStartedAt changes only when the turn moves', () => {
  const before = { currentPlayerId: 'a', currentTurnIndex: 1, currentVictim: null, turnStartedAt: 'T0' };
  assert.equal(stampTurnStartedAt(before, { ...before }, 'T1').turnStartedAt, 'T0');
  assert.equal(stampTurnStartedAt(before, { ...before, currentPlayerId: 'b', currentTurnIndex: 2 }, 'T1').turnStartedAt, 'T1');
  assert.equal(stampTurnStartedAt(before, { ...before, currentVictim: 'b', currentPlayerId: 'b' }, 'T1').turnStartedAt, 'T1');
  // Same player again in the next slot (boomerang turnaround) is a new turn.
  assert.equal(stampTurnStartedAt(before, { ...before, currentTurnIndex: 2 }, 'T1').turnStartedAt, 'T1');
});

// ---- Presence ----------------------------------------------------------------------------------

function fakeClock() {
  let now = 1000;
  const timers = [];
  return {
    now: () => now,
    advance(ms) {
      now += ms;
      for (const t of [...timers]) {
        if (!t.cleared && t.at <= now) {
          t.cleared = true;
          t.fn();
        }
      }
    },
    setTimer(fn, ms) {
      const t = { fn, at: now + ms, cleared: false };
      timers.push(t);
      return t;
    },
    clearTimer(t) {
      if (t) t.cleared = true;
    },
  };
}

test('presence: a reload inside the 5s grace never shows away', () => {
  const clock = fakeClock();
  const changes = [];
  const presence = createPresenceTracker({ ...clock, onChange: (partyId, u) => changes.push(u) });
  presence.join('p', 'b', 's1');
  presence.leave('p', 'b', 's1');
  clock.advance(3000);
  presence.join('p', 'b', 's2');
  clock.advance(10_000);
  assert.deepEqual(changes, []);
  assert.deepEqual(presence.snapshot('p'), []);
});

test('presence: away after 5s with awaySince at the disconnect; back at once on return', () => {
  const clock = fakeClock();
  const changes = [];
  const presence = createPresenceTracker({ ...clock, onChange: (partyId, u) => changes.push(u) });
  presence.join('p', 'b', 's1');
  presence.leave('p', 'b', 's1');
  const disconnectedAt = clock.now();
  clock.advance(5000);
  assert.deepEqual(changes, [{ userId: 'b', away: true, awaySince: disconnectedAt }]);
  assert.deepEqual(presence.snapshot('p'), [{ userId: 'b', awaySince: disconnectedAt }]);
  clock.advance(20_000);
  presence.join('p', 'b', 's2');
  assert.deepEqual(changes[1], { userId: 'b', away: false });
  assert.deepEqual(presence.get('p', 'b'), { awaySince: null, returnedAt: clock.now() });
});

test('presence: two tabs, one closed, is not away', () => {
  const clock = fakeClock();
  const changes = [];
  const presence = createPresenceTracker({ ...clock, onChange: (partyId, u) => changes.push(u) });
  presence.join('p', 'b', 's1');
  presence.join('p', 'b', 's2');
  presence.leave('p', 'b', 's1');
  clock.advance(60_000);
  assert.deepEqual(changes, []);
});

// ---- Atomic executor -----------------------------------------------------------------------------

test('pick for an away player opens one wrapped gift for them, records the host, and moves the turn', async () => {
  const partyId = 'party-pick';
  const state = seed(partyId, pickTurnState(partyId));
  const { newState } = await takeover(partyId, state);
  const held = newState.unwrappedGifts.find(([, g]) => g.ownerId === 'a');
  assert.ok(held, 'a now holds a gift');
  assert.deepEqual(newState.wrappedGifts.length, 1);
  assert.equal(newState.currentPlayerId, 'b');
  assert.notEqual(newState.turnStartedAt, state.turnStartedAt);
  const pick = newState.history.find((h) => h.type === 'PICK');
  assert.deepEqual({ playerId: pick.playerId, assistedBy: pick.assistedBy, giftId: pick.giftId }, {
    playerId: 'a',
    assistedBy: HOST,
    giftId: held[0],
  });
});

test('a double tap acts once: the second request sees the turn already moved', async () => {
  const partyId = 'party-double';
  const state = seed(partyId, pickTurnState(partyId));
  const results = await Promise.allSettled([takeover(partyId, state), takeover(partyId, state)]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const refused = results.find((r) => r.status === 'rejected');
  assert.equal(refused.reason.code, 'TURN_MOVED');
  const final = await stored(partyId);
  assert.equal(final.history.filter((h) => h.type === 'PICK').length, 1);
  assert.equal(final.wrappedGifts.length, 1);
});

test('a second tap after the first landed is refused and changes nothing', async () => {
  const partyId = 'party-second';
  const state = seed(partyId, pickTurnState(partyId));
  await takeover(partyId, state);
  const afterFirst = await stored(partyId);
  assert.equal(await rejectionCode(takeover(partyId, state)), 'TURN_MOVED');
  assert.deepEqual(await stored(partyId), afterFirst);
});

test('refusals: stale turn key, mismatched action, too early, player back, host turn, bot, ended', async () => {
  const partyId = 'party-refuse';
  const state = seed(partyId, pickTurnState(partyId));
  const untouched = await stored(partyId);

  assert.equal(await rejectionCode(takeover(partyId, state, { turnKey: iso(NOW - 99_000) })), 'TURN_MOVED');
  assert.equal(await rejectionCode(takeover(partyId, state, { action: 'keep' })), 'TURN_MOVED');
  assert.equal(await rejectionCode(takeover(partyId, state, { presence: awayFor(10_000) })), 'NOT_YET');
  assert.equal(
    await rejectionCode(
      takeover(partyId, state, { presence: () => ({ awaySince: null, returnedAt: NOW - 5000 }) }),
    ),
    'PLAYER_BACK',
  );
  assert.equal(await rejectionCode(takeover(partyId, state, { playerId: 'b' })), 'TURN_MOVED');
  assert.deepEqual(await stored(partyId), untouched, 'no refusal changes the game');

  const hostTurn = seed('party-host-turn', pickTurnState('party-host-turn', { currentTurnIndex: 0, currentPlayerId: HOST, unwrappedGifts: [], wrappedGifts: ['g1', 'g2', 'g3'] }));
  assert.equal(await rejectionCode(takeover('party-host-turn', hostTurn, { playerId: HOST })), 'TURN_MOVED');

  const botTurn = seed('party-bot', pickTurnState('party-bot', { turnOrder: [HOST, 'bot_1', 'b'], turnQueue: [HOST, 'bot_1', 'b', HOST], currentPlayerId: 'bot_1' }));
  assert.equal(await rejectionCode(takeover('party-bot', botTurn, { playerId: 'bot_1', action: 'pick' })), 'TURN_MOVED');

  const ended = seed('party-ended', pickTurnState('party-ended', { phase: 'ENDED' }));
  assert.equal(await rejectionCode(takeover('party-ended', ended)), 'TURN_MOVED');
});

test('idle rule: a connected player can be helped at 90s, not before', async () => {
  const partyId = 'party-idle';
  const early = seed(partyId, pickTurnState(partyId, { turnStartedAt: iso(NOW - 80_000) }));
  assert.equal(await rejectionCode(takeover(partyId, early, { presence: connected })), 'NOT_YET');
  const late = seed(partyId, pickTurnState(partyId, { turnStartedAt: iso(NOW - IDLE_TAKEOVER_MS) }));
  const { newState } = await takeover(partyId, late, { presence: connected });
  assert.equal(newState.currentPlayerId, 'b');
});

test('boomerang keep: the away player keeps their gift and the turn goes to the next player in the snake order', async () => {
  const partyId = 'party-boomerang';
  const state = seed(partyId, {
    ...pickTurnState(partyId),
    config: { maxSteals: 3, returnToStart: true },
    turnQueue: [HOST, 'a', 'b', 'b', 'a', HOST],
    currentTurnIndex: 4,
    currentPlayerId: 'a',
    isBoomerangPhase: true,
    wrappedGifts: [],
    unwrappedGifts: [['g1', gift(HOST)], ['g2', gift('a')], ['g3', gift('b')]],
  });
  assert.equal(deriveTakeoverAction(state, 'a'), 'keep');
  const { newState } = await takeover(partyId, state);
  assert.equal(newState.phase, 'ACTIVE');
  assert.equal(newState.currentPlayerId, HOST);
  assert.equal(new Map(newState.unwrappedGifts).get('g2').ownerId, 'a');
  const skip = newState.history.find((h) => h.type === 'END_TURN');
  assert.deepEqual({ playerId: skip.playerId, assistedBy: skip.assistedBy }, { playerId: 'a', assistedBy: HOST });
});

test('bookend keep_and_end: the away player 1 keeps their gift and the game ends', async () => {
  const partyId = 'party-bookend';
  const state = seed(partyId, {
    ...buildStandardState({
      partyId,
      turnOrder: ['a', HOST, 'b'],
      currentTurnIndex: 3,
      wrappedGifts: [],
      unwrappedGifts: [['g1', gift(HOST)], ['g2', gift('a')], ['g3', gift('b')]],
    }),
    turnStartedAt: iso(NOW - 40_000),
  });
  assert.equal(deriveTakeoverAction(state, 'a'), 'keep_and_end');
  const { newState } = await takeover(partyId, state);
  assert.equal(newState.phase, 'ENDED');
  assert.equal(new Map(newState.unwrappedGifts).get('g2').ownerId, 'a');
  assert.equal(newState.history.at(-1).assistedBy, HOST);
});

test('steal for an away victim takes a random legal gift, never the one just taken from them', async () => {
  const partyId = 'party-steal';
  const state = seed(partyId, {
    ...buildStandardState({
      partyId,
      turnOrder: [HOST, 'a', 'b', 'c'],
      currentTurnIndex: 2,
      wrappedGifts: [],
      unwrappedGifts: [['g1', gift(HOST)], ['g2', gift('b', { lastOwnerId: 'a' })], ['g3', gift('c')]],
    }),
    currentVictim: 'a',
    currentPlayerId: 'a',
    turnStartedAt: iso(NOW - 40_000),
  });
  for (const random of [() => 0, () => 0.99]) {
    store.reset();
    seed(partyId, state);
    const { newState } = await takeover(partyId, state, { random });
    const steal = newState.history.at(-1);
    assert.equal(steal.type, 'STEAL');
    assert.equal(steal.assistedBy, HOST);
    assert.notEqual(steal.giftId, 'g2');
    assert.equal(new Map(newState.unwrappedGifts).get(steal.giftId).ownerId, 'a');
  }
});

test('skip for an away victim with no legal move ends their turn', async () => {
  const partyId = 'party-skip';
  const state = seed(partyId, {
    ...buildStandardState({
      partyId,
      turnOrder: [HOST, 'a', 'b'],
      currentTurnIndex: 2,
      wrappedGifts: [],
      unwrappedGifts: [['g1', gift(HOST, { isFrozen: true })], ['g2', gift('b', { lastOwnerId: 'a' })]],
    }),
    currentVictim: 'a',
    currentPlayerId: 'a',
    turnStartedAt: iso(NOW - 40_000),
  });
  assert.equal(deriveTakeoverAction(state, 'a'), 'skip');
  const { newState } = await takeover(partyId, state);
  assert.notEqual(newState.currentPlayerId, 'a');
  assert.equal(newState.history.at(0).assistedBy, HOST);
});

// ---- Socket handler --------------------------------------------------------------------------------

const hostToken = { uid: HOST, firebase: { sign_in_provider: 'google.com' } };

function handlerDeps(overrides = {}) {
  const replies = [];
  const io = mockIo();
  const calls = { execute: 0, finalize: 0, bot: 0 };
  return {
    replies,
    io,
    calls,
    deps: {
      data: { partyId: 'party-h', playerId: 'a', action: 'pick', turnKey: iso(NOW - 40_000) },
      socket: { user: hostToken, userId: HOST },
      io,
      presence: { get: () => ({ awaySince: NOW - 60_000, returnedAt: null }) },
      loadParty: async () => ({ adminId: HOST, status: 'ACTIVE' }),
      finalizeEndedGame: async () => {
        calls.finalize += 1;
      },
      scheduleBotMove: () => {
        calls.bot += 1;
      },
      executeTakeover: async () => {
        calls.execute += 1;
        return { newState: { phase: 'ACTIVE', history: [{ type: 'PICK', playerId: 'a', giftId: 'g2', assistedBy: HOST }] } };
      },
      now: () => NOW,
      reply: (r) => replies.push(r),
      ...overrides,
    },
  };
}

test('handler: a non-host is refused with NOT_HOST and nothing runs', async () => {
  for (const user of [
    { uid: 'b', firebase: { sign_in_provider: 'google.com' } },
    { uid: HOST, firebase: { sign_in_provider: 'anonymous' } },
  ]) {
    const { deps, replies, calls, io } = handlerDeps({ socket: { user, userId: user.uid } });
    await handleHostTakeTurn(deps);
    assert.deepEqual(replies, [{ ok: false, code: 'NOT_HOST', serverNow: NOW }]);
    assert.equal(calls.execute, 0);
    assert.deepEqual(io.emissions, []);
  }
});

test('handler: a party in LOBBY or ENDED is refused with TURN_MOVED', async () => {
  for (const status of ['LOBBY', 'ENDED']) {
    const { deps, replies, calls } = handlerDeps({ loadParty: async () => ({ adminId: HOST, status }) });
    await handleHostTakeTurn(deps);
    assert.deepEqual(replies, [{ ok: false, code: 'TURN_MOVED', serverNow: NOW }]);
    assert.equal(calls.execute, 0);
  }
});

test('handler: bad payloads are refused before any read', async () => {
  for (const data of [null, { partyId: 'p' }, { partyId: 'p', playerId: 'a', action: 'end_game', turnKey: 'x' }, { partyId: '../x', playerId: 'a', action: 'pick', turnKey: 'x' }]) {
    let read = false;
    const { deps, replies } = handlerDeps({ data, loadParty: async () => { read = true; return null; } });
    await handleHostTakeTurn(deps);
    assert.deepEqual(replies, [{ ok: false, code: 'FAILED', serverNow: NOW }]);
    assert.equal(read, false);
  }
});

test('handler: success broadcasts one game-updated, answers ok, and resumes bots', async () => {
  const { deps, replies, calls, io } = handlerDeps();
  await handleHostTakeTurn(deps);
  assert.deepEqual(replies, [{ ok: true, serverNow: NOW }]);
  assert.deepEqual(io.emissions.map((e) => e.event), ['action_started', 'game-updated']);
  assert.deepEqual(calls, { execute: 1, finalize: 0, bot: 1 });
});

test('handler: a keep that ends the game finalizes it (winners, game-ended) instead of scheduling bots', async () => {
  const { deps, calls, io } = handlerDeps({
    executeTakeover: async () => ({ newState: { phase: 'ENDED', history: [{ type: 'END_TURN', playerId: 'a', assistedBy: HOST }] } }),
  });
  await handleHostTakeTurn(deps);
  assert.deepEqual(io.emissions.map((e) => e.event), ['game-updated']);
  assert.deepEqual({ finalize: calls.finalize, bot: calls.bot }, { finalize: 1, bot: 0 });
});

test('handler: an executor refusal is passed through as its code', async () => {
  const { HostTakeoverRejectedError } = await import(path.join(serverRoot, 'utils/game-turn-handler.mjs'));
  const { deps, replies, io } = handlerDeps({
    executeTakeover: async () => {
      throw new HostTakeoverRejectedError('PLAYER_BACK');
    },
  });
  await handleHostTakeTurn(deps);
  assert.deepEqual(replies, [{ ok: false, code: 'PLAYER_BACK', serverNow: NOW }]);
  assert.deepEqual(io.emissions, []);
});
