/**
 * Minimal Redis client with per-connection WATCH / MULTI / EXEC (mirrors duplicate()).
 */
function buildConnection(store) {
  let watchKey = null;
  let watchSnapshot = undefined;

  const connection = {
    async watch(key) {
      watchKey = key;
      watchSnapshot = store.redis.get(key) ?? null;
    },
    async unwatch() {
      watchKey = null;
      watchSnapshot = undefined;
    },
    async get(key) {
      if (store.counters.has(key)) {
        return String(store.counters.get(key));
      }
      return store.redis.get(key) ?? null;
    },
    async setEx(key, _ttl, value) {
      store.redis.set(key, value);
      const partyId = key.replace(/^game:/, '');
      try {
        store.gameStates.set(partyId, JSON.parse(value));
      } catch {
        /* ignore */
      }
    },
    async set(key, value, options = {}) {
      if (options.NX && store.redis.has(key)) {
        return null;
      }
      store.redis.set(key, value);
      const partyId = key.replace(/^game:/, '');
      try {
        store.gameStates.set(partyId, JSON.parse(value));
      } catch {
        /* ignore */
      }
      return 'OK';
    },
    multi() {
      let pending = null;
      return {
        setEx(key, ttl, value) {
          pending = { key, ttl, value };
          return this;
        },
        async exec() {
          if (watchKey != null) {
            const current = store.redis.get(watchKey) ?? null;
            if (current !== watchSnapshot) {
              watchKey = null;
              watchSnapshot = undefined;
              return null;
            }
          }
          if (pending) {
            await connection.setEx(pending.key, pending.ttl, pending.value);
          }
          watchKey = null;
          watchSnapshot = undefined;
          return ['OK'];
        },
      };
    },
    async ttl() {
      return 3600;
    },
    async incr(key) {
      const next = (store.counters.get(key) ?? 0) + 1;
      store.counters.set(key, next);
      return next;
    },
    async expire() {},
    async del(key) {
      store.redis.delete(key);
      const partyId = key.replace(/^game:/, '');
      store.gameStates.delete(partyId);
    },
    duplicate() {
      return buildConnection(store);
    },
    isOpen: true,
    async quit() {},
    async connect() {},
  };

  return connection;
}

export function createAtomicRedis(store) {
  return buildConnection(store);
}

export function seedRedisGameState(store, partyId, state) {
  const stamped = {
    ...structuredClone(state),
    partyId,
    stateVersion: state.stateVersion ?? 1,
    updatedAt: state.updatedAt ?? new Date().toISOString(),
  };
  const json = JSON.stringify(stamped);
  store.redis.set(`game:${partyId}`, json);
  store.gameStates.set(partyId, stamped);
}