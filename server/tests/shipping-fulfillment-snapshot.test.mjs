import test from 'node:test';
import assert from 'node:assert/strict';
import {
  saveShippingFulfillmentSnapshot,
  loadShippingFulfillmentSnapshot,
} from '../utils/shipping-fulfillment-snapshot.js';
import { fetchWinnerShippingAddressForSender } from '../utils/winner-shipping-address.js';

const PARTY_ID = 'party-reend';
const GIFT_ID = 'gift-reend';
const TRUE_SENDER_ID = 'true-sender';
const HOST_ID = 'host-attacker';
const WINNER_ID = 'winner-user';

function createMemoryRedis() {
  const store = new Map();
  return {
    async set(key, value, options = {}) {
      if (options.NX && store.has(key)) {
        return null;
      }
      store.set(key, { value, ex: options.EX });
      return 'OK';
    },
    async get(key) {
      const row = store.get(key);
      return row ? row.value : null;
    },
    _store: store,
  };
}

function createGiftDb(giftRows) {
  return {
    collection(name) {
      if (name !== 'gifts') {
        throw new Error(`unexpected collection ${name}`);
      }
      return {
        doc(id) {
          return {
            async get() {
              const row = giftRows[id];
              return {
                exists: Boolean(row),
                data: () => row,
              };
            },
          };
        },
      };
    },
  };
}

test('fulfillment snapshot is write-once (NX)', async () => {
  const redis = createMemoryRedis();
  const db = createGiftDb({
    [GIFT_ID]: {
      partyId: PARTY_ID,
      submitterId: TRUE_SENDER_ID,
    },
  });
  const ownership = { [GIFT_ID]: WINNER_ID };

  const first = await saveShippingFulfillmentSnapshot(PARTY_ID, ownership, db, redis);
  assert.equal(first, true);

  const loaded = await loadShippingFulfillmentSnapshot(PARTY_ID, redis);
  assert.deepEqual(loaded, {
    [GIFT_ID]: { submitterId: TRUE_SENDER_ID, winnerId: WINNER_ID },
  });

  const dbHacked = createGiftDb({
    [GIFT_ID]: {
      partyId: PARTY_ID,
      submitterId: HOST_ID,
    },
  });
  const second = await saveShippingFulfillmentSnapshot(PARTY_ID, ownership, dbHacked, redis);
  assert.equal(second, false);

  const unchanged = await loadShippingFulfillmentSnapshot(PARTY_ID, redis);
  assert.deepEqual(unchanged, {
    [GIFT_ID]: { submitterId: TRUE_SENDER_ID, winnerId: WINNER_ID },
  });
});

test('after submitterId rewrite, re-end cannot overwrite snapshot and host is denied', async () => {
  const redis = createMemoryRedis();
  const db = createGiftDb({
    [GIFT_ID]: {
      partyId: PARTY_ID,
      submitterId: TRUE_SENDER_ID,
    },
  });
  await saveShippingFulfillmentSnapshot(PARTY_ID, { [GIFT_ID]: WINNER_ID }, db, redis);

  const dbRewritten = createGiftDb({
    [GIFT_ID]: {
      partyId: PARTY_ID,
      submitterId: HOST_ID,
      winnerId: WINNER_ID,
    },
  });
  const rewriteAttempt = await saveShippingFulfillmentSnapshot(
    PARTY_ID,
    { [GIFT_ID]: WINNER_ID },
    dbRewritten,
    redis,
  );
  assert.equal(rewriteAttempt, false);

  const winnerAddress = {
    name: 'Winner',
    street: '1 Main',
    city: 'City',
    state: 'ST',
    zip: '11111',
    country: 'US',
  };

  const apiDb = {
    collection(name) {
      if (name === 'parties') {
        return {
          doc(id) {
            return {
              async get() {
                return { exists: true, data: () => ({ adminId: HOST_ID }) };
              },
              collection(sub) {
                return {
                  doc(uid) {
                    return {
                      async get() {
                        const rows = {
                          [TRUE_SENDER_ID]: { status: 'GOING' },
                          [HOST_ID]: { status: 'GOING' },
                          [WINNER_ID]: { status: 'GOING' },
                        };
                        return {
                          exists: Boolean(rows[uid]),
                          data: () => rows[uid],
                        };
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }
      if (name === 'gifts') {
        return {
          doc(id) {
            return {
              async get() {
                return {
                  exists: true,
                  data: () => ({
                    partyId: PARTY_ID,
                    submitterId: HOST_ID,
                    winnerId: WINNER_ID,
                  }),
                };
              },
            };
          },
        };
      }
      if (name === 'users') {
        return {
          doc(id) {
            return {
              async get() {
                if (id !== WINNER_ID) {
                  return { exists: false };
                }
                return {
                  exists: true,
                  data: () => ({
                    shippingAddress: winnerAddress,
                    shippingAddressSenderShareConsentAt: new Date(),
                  }),
                };
              },
            };
          },
        };
      }
      throw new Error(`unexpected collection ${name}`);
    },
  };

  const snapshot = await loadShippingFulfillmentSnapshot(PARTY_ID, redis);
  const result = await fetchWinnerShippingAddressForSender(
    apiDb,
    { callerUid: HOST_ID, partyId: PARTY_ID, giftId: GIFT_ID },
    {
      loadGameState: async () => ({ phase: 'ENDED', finalOwnership: { [GIFT_ID]: WINNER_ID } }),
      loadFulfillmentSnapshot: async () => snapshot,
    },
  );
  assert.equal(result.status, 403);
});
