import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { fetchWinnerShippingAddressForSender } from '../utils/winner-shipping-address.js';

const PARTY_ID = 'party-http';
const GIFT_ID = 'gift-http';
const SENDER_ID = 'sender-http';
const WINNER_ID = 'winner-http';
const HOST_ID = 'host-http';

const sampleAddress = {
  name: 'Winner',
  street: '1 Main',
  city: 'City',
  state: 'ST',
  zip: '11111',
  country: 'US',
};

function buildMockDb(overrides = {}) {
  const gifts = {
    [GIFT_ID]: {
      partyId: PARTY_ID,
      submitterId: overrides.giftSubmitterId ?? SENDER_ID,
      winnerId: overrides.giftWinnerId ?? WINNER_ID,
    },
    ...overrides.gifts,
  };

  const users = {
    [WINNER_ID]: {
      shippingAddress: sampleAddress,
      shippingAddressSenderShareConsentAt: new Date(),
    },
    ...(overrides.hackedUser
      ? {
          'victim-hacked': {
            shippingAddress: sampleAddress,
            shippingAddressSenderShareConsentAt: new Date(),
          },
        }
      : {}),
  };

  const participants = {
    [SENDER_ID]: { status: 'GOING' },
    [WINNER_ID]: { status: 'GOING' },
    [HOST_ID]: { status: 'GOING' },
    ...(overrides.hackedUser ? { 'victim-hacked': { status: 'GOING' } } : {}),
  };

  return {
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
                        return {
                          exists: Boolean(participants[uid]),
                          data: () => participants[uid],
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
                const row = gifts[id];
                return { exists: Boolean(row), data: () => row };
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
                const row = users[id];
                return { exists: Boolean(row), data: () => row };
              },
            };
          },
        };
      }
      throw new Error(`unexpected collection ${name}`);
    },
  };
}

async function withHttpServer(handler, run) {
  const app = express();
  app.use((req, _res, next) => {
    const uid = req.headers['x-test-uid'];
    req.user = uid ? { uid } : undefined;
    next();
  });
  app.get('/api/game/winner-shipping-address/:partyId/:giftId', handler);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  try {
    await run(port);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

async function httpGet(port, path, uid) {
  const headers = uid ? { 'x-test-uid': uid } : {};
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { headers });
  const body = await res.json();
  return { status: res.status, body };
}

test('HTTP denies made-up party without server fulfillment snapshot', async () => {
  const db = buildMockDb();

  await withHttpServer(async (req, res) => {
    const result = await fetchWinnerShippingAddressForSender(
      db,
      { callerUid: req.user?.uid, partyId: req.params.partyId, giftId: req.params.giftId },
      {
        loadGameState: async () => ({ phase: 'ENDED', finalOwnership: { [GIFT_ID]: WINNER_ID } }),
        loadFulfillmentSnapshot: async () => null,
      },
    );
    res.status(result.status).json(result.status === 200 ? { shippingAddress: result.shippingAddress } : { error: result.error });
  }, async (port) => {
    const { status, body } = await httpGet(
      port,
      `/api/game/winner-shipping-address/${PARTY_ID}/${GIFT_ID}`,
      SENDER_ID,
    );
    assert.equal(status, 403);
    assert.match(body.error, /fulfillment/i);
  });
});

test('HTTP denies repointed Firestore winnerId when fulfillment names true winner', async () => {
  const db = buildMockDb({
    giftWinnerId: 'victim-hacked',
    hackedUser: true,
  });

  await withHttpServer(async (req, res) => {
    const result = await fetchWinnerShippingAddressForSender(
      db,
      { callerUid: req.user?.uid, partyId: req.params.partyId, giftId: req.params.giftId },
      {
        loadGameState: async () => ({ phase: 'ENDED', finalOwnership: { [GIFT_ID]: WINNER_ID } }),
        loadFulfillmentSnapshot: async () => ({
          [GIFT_ID]: { submitterId: SENDER_ID, winnerId: WINNER_ID },
        }),
      },
    );
    res.status(result.status).json(result.status === 200 ? { shippingAddress: result.shippingAddress } : { error: result.error });
  }, async (port) => {
    const { status, body } = await httpGet(
      port,
      `/api/game/winner-shipping-address/${PARTY_ID}/${GIFT_ID}`,
      SENDER_ID,
    );
    assert.equal(status, 200);
    assert.deepEqual(body.shippingAddress, sampleAddress);
  });
});

test('HTTP denies host who rewrote gift submitterId in Firestore', async () => {
  const db = buildMockDb({ giftSubmitterId: HOST_ID });

  await withHttpServer(async (req, res) => {
    const result = await fetchWinnerShippingAddressForSender(
      db,
      { callerUid: req.user?.uid, partyId: req.params.partyId, giftId: req.params.giftId },
      {
        loadGameState: async () => ({ phase: 'ENDED', finalOwnership: { [GIFT_ID]: WINNER_ID } }),
        loadFulfillmentSnapshot: async () => ({
          [GIFT_ID]: { submitterId: SENDER_ID, winnerId: WINNER_ID },
        }),
      },
    );
    res.status(result.status).json(result.status === 200 ? { shippingAddress: result.shippingAddress } : { error: result.error });
  }, async (port) => {
    const { status } = await httpGet(
      port,
      `/api/game/winner-shipping-address/${PARTY_ID}/${GIFT_ID}`,
      HOST_ID,
    );
    assert.equal(status, 403);
  });
});
