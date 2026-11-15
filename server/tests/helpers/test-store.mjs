/**
 * In-memory stand-ins for Redis and game state persistence in regression tests.
 */
export function createTestStore() {
  const gameStates = new Map();
  const redis = new Map();
  const counters = new Map();

  return {
    gameStates,
    redis,
    counters,
    async loadGameState(partyId) {
      const state = gameStates.get(partyId);
      return state ? structuredClone(state) : null;
    },
    async saveGameState(partyId, state) {
      const copy = structuredClone(state);
      gameStates.set(partyId, copy);
      const stamped = {
        ...copy,
        partyId,
        stateVersion: copy.stateVersion ?? 1,
        updatedAt: copy.updatedAt ?? new Date().toISOString(),
      };
      redis.set(`game:${partyId}`, JSON.stringify(stamped));
    },
    reset() {
      gameStates.clear();
      redis.clear();
      counters.clear();
    },
  };
}

export function giftEntry(giftId, ownerId, overrides = {}) {
  return [
    giftId,
    {
      ownerId,
      stealCount: 0,
      isFrozen: false,
      lastOwnerId: null,
      lastInteractedAt: Date.now(),
      ...overrides,
    },
  ];
}

export function buildStandardState({
  partyId = 'party-test',
  turnOrder,
  currentTurnIndex,
  wrappedGifts,
  unwrappedGifts = [],
  turnAction = null,
}) {
  const turnQueue = [...turnOrder, turnOrder[0]];
  const defaultTurnAction = turnOrder.map((id) => [id, null]);
  return {
    partyId,
    phase: 'ACTIVE',
    config: { maxSteals: 3, returnToStart: false },
    turnOrder: [...turnOrder],
    turnQueue,
    currentTurnIndex,
    currentVictim: null,
    currentPlayerId: turnQueue[currentTurnIndex],
    wrappedGifts: [...wrappedGifts],
    unwrappedGifts: [...unwrappedGifts],
    turnAction: turnAction ?? defaultTurnAction,
    history: [],
    stealStack: [],
    isBoomerangPhase: false,
  };
}

export function mockIo() {
  const emissions = [];
  return {
    emissions,
    to() {
      return {
        emit(event, payload) {
          emissions.push({ event, payload });
        },
      };
    },
  };
}
