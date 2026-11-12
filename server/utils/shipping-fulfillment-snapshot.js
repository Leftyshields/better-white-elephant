/**
 * Server-owned gift fulfillment mapping (submitter + winner per gift) written at game end.
 */
import { REDIS_TTL_ENDED_SECONDS } from './redis-game-ttl.mjs';

let defaultRedisPromise;
async function resolveRedis(redis) {
  if (redis) {
    return redis;
  }
  if (!defaultRedisPromise) {
    defaultRedisPromise = import('./redis.js').then((mod) => mod.default);
  }
  return defaultRedisPromise;
}

function fulfillmentRedisKey(partyId) {
  return `fulfillment:${partyId}`;
}

/**
 * @param {string} partyId
 * @param {Record<string, string>} finalOwnership giftId -> winnerId
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {import('redis').RedisClientType} [redis]
 * @returns {Promise<boolean>} true if a new snapshot was written
 */
export async function saveShippingFulfillmentSnapshot(partyId, finalOwnership, db, redis) {
  if (!partyId || !finalOwnership || typeof finalOwnership !== 'object') {
    return false;
  }

  const snapshot = {};
  for (const [giftId, winnerId] of Object.entries(finalOwnership)) {
    if (!giftId || !winnerId) {
      continue;
    }
    const giftDoc = await db.collection('gifts').doc(giftId).get();
    if (!giftDoc.exists) {
      continue;
    }
    const giftData = giftDoc.data();
    if (giftData.partyId !== partyId || !giftData.submitterId) {
      continue;
    }
    snapshot[giftId] = {
      submitterId: giftData.submitterId,
      winnerId,
    };
  }

  if (Object.keys(snapshot).length === 0) {
    return false;
  }

  const client = await resolveRedis(redis);
  const wrote = await client.set(fulfillmentRedisKey(partyId), JSON.stringify(snapshot), {
    NX: true,
    EX: REDIS_TTL_ENDED_SECONDS,
  });
  return Boolean(wrote);
}

/**
 * @param {string} partyId
 * @param {import('redis').RedisClientType} [redis]
 * @returns {Promise<Record<string, { submitterId: string, winnerId: string }> | null>}
 */
export async function loadShippingFulfillmentSnapshot(partyId, redis) {
  const client = await resolveRedis(redis);
  const raw = await client.get(fulfillmentRedisKey(partyId));
  if (!raw) {
    return null;
  }
  return JSON.parse(raw);
}
