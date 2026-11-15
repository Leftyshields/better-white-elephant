/**
 * Dedicated Redis connections for WATCH/MULTI/EXEC.
 * WATCH is connection-scoped; the shared app client must not run concurrent watches.
 */
import redisClient from './redis.js';

/**
 * @param {import('redis').RedisClientType} [sharedClient]
 * @returns {Promise<{ client: import('redis').RedisClientType, release: () => Promise<void> }>}
 */
export async function borrowRedisTransactionConnection(sharedClient = redisClient) {
  if (sharedClient && typeof sharedClient.duplicate === 'function') {
    const dedicated = sharedClient.duplicate();
    if (!dedicated.isOpen) {
      await dedicated.connect();
    }
    return {
      client: dedicated,
      release: async () => {
        if (dedicated.isOpen) {
          await dedicated.quit();
        }
      },
    };
  }

  return {
    client: sharedClient,
    release: async () => {},
  };
}

/**
 * @param {import('redis').RedisClientType | undefined} injectedRedis from tests
 */
export async function resolveTransactionRedis(injectedRedis) {
  if (injectedRedis) {
    if (typeof injectedRedis.duplicate === 'function') {
      const dedicated = injectedRedis.duplicate();
      return {
        client: dedicated,
        release: async () => {},
      };
    }
    return {
      client: injectedRedis,
      release: async () => {},
    };
  }
  return borrowRedisTransactionConnection(redisClient);
}