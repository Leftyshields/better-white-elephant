/** 30 days — matches Privacy Section 5 game/party data retention */
export const REDIS_TTL_ENDED_SECONDS = 30 * 24 * 60 * 60;

/** Active / unknown party: long TTL so in-progress games do not expire in Redis */
export const REDIS_TTL_ACTIVE_SECONDS = 63072000;

/**
 * @param {string|undefined|null} status — parties/{id}.status
 */
export function redisTtlSecondsForPartyStatus(status) {
  if (status === 'ENDED') {
    return REDIS_TTL_ENDED_SECONDS;
  }
  return REDIS_TTL_ACTIVE_SECONDS;
}

/** @param {string|undefined|null} partyStatus @param {string|undefined|null} gameStatePhase */
export function isEndedPartyOrGameState(partyStatus, gameStatePhase) {
  return partyStatus === 'ENDED' || gameStatePhase === 'ENDED';
}

/**
 * ENDED games always get the 30-day Redis TTL (clamps legacy 1y/2y keys on the next persist).
 * @param {string|undefined|null} partyStatus
 * @param {string|undefined|null} gameStatePhase
 * @param {number|null|undefined} requestedTtl
 */
export function resolveRedisTtlSeconds(partyStatus, gameStatePhase, requestedTtl) {
  if (isEndedPartyOrGameState(partyStatus, gameStatePhase)) {
    return REDIS_TTL_ENDED_SECONDS;
  }
  if (requestedTtl != null) {
    return requestedTtl;
  }
  return redisTtlSecondsForPartyStatus(partyStatus);
}

/**
 * Re-set an existing Redis payload so legacy long TTLs on ended games expire in 30 days.
 * @param {import('redis').RedisClientType} client
 */
export async function clampEndedRedisKeyTtl(client, redisKey, redisPayload, partyStatus, gameStatePhase) {
  if (!isEndedPartyOrGameState(partyStatus, gameStatePhase)) {
    return false;
  }
  const currentTtl = await client.ttl(redisKey);
  if (currentTtl > 0 && currentTtl <= REDIS_TTL_ENDED_SECONDS) {
    return false;
  }
  await client.setEx(redisKey, REDIS_TTL_ENDED_SECONDS, redisPayload);
  return true;
}
