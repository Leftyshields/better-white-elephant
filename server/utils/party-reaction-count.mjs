/**
 * Reaction hype counter stored outside game state so send_reaction never rewrites turns.
 */
import redisClient from './redis.js';
import { REDIS_TTL_ACTIVE_SECONDS } from './redis-game-ttl.mjs';

export function partyReactionRedisKey(partyId) {
  return `game:${partyId}:reactions`;
}

export async function getPartyReactionCount(partyId) {
  const raw = await redisClient.get(partyReactionRedisKey(partyId));
  if (raw == null) {
    return 0;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}

export async function incrementPartyReactionCount(partyId) {
  const key = partyReactionRedisKey(partyId);
  const gameKey = `game:${partyId}`;
  const count = await redisClient.incr(key);
  let ttl = await redisClient.ttl(gameKey);
  if (!Number.isFinite(ttl) || ttl <= 0) {
    ttl = REDIS_TTL_ACTIVE_SECONDS;
  }
  await redisClient.expire(key, ttl);
  return count;
}

export async function attachReactionCount(partyId, gameState) {
  if (!gameState || typeof gameState !== 'object') {
    return gameState;
  }
  gameState.reactionCount = await getPartyReactionCount(partyId);
  return gameState;
}

export async function deletePartyReactionCount(partyId) {
  await redisClient.del(partyReactionRedisKey(partyId));
}