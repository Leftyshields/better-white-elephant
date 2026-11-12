/**
 * Server-owned gift fulfillment mapping (submitter + winner per gift) written at game end.
 */
import redisClient from './redis.js';
import { REDIS_TTL_ENDED_SECONDS } from './redis-game-ttl.mjs';

function fulfillmentRedisKey(partyId) {
  return `fulfillment:${partyId}`;
}

/**
 * @param {string} partyId
 * @param {Record<string, string>} finalOwnership giftId -> winnerId
 * @param {import('firebase-admin/firestore').Firestore} db
 */
export async function saveShippingFulfillmentSnapshot(partyId, finalOwnership, db) {
  if (!partyId || !finalOwnership || typeof finalOwnership !== 'object') {
    return;
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
    return;
  }

  const client = redisClient;
  await client.setEx(
    fulfillmentRedisKey(partyId),
    REDIS_TTL_ENDED_SECONDS,
    JSON.stringify(snapshot),
  );
}

/**
 * @param {string} partyId
 * @param {import('redis').RedisClientType} [redis]
 * @returns {Promise<Record<string, { submitterId: string, winnerId: string }> | null>}
 */
export async function loadShippingFulfillmentSnapshot(partyId, redis = redisClient) {
  const raw = await redis.get(fulfillmentRedisKey(partyId));
  if (!raw) {
    return null;
  }
  return JSON.parse(raw);
}
