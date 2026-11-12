import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchWinnerShippingAddressForSender } from '../utils/winner-shipping-address.js';

const PARTY_ID = 'party-1';
const GIFT_ID = 'gift-1';
const SENDER_ID = 'sender-user';
const WINNER_ID = 'winner-user';
const HOST_ID = 'host-user';
const RANDOM_ID = 'random-user';
const OTHER_MEMBER_ID = 'member-user';

const sampleAddress = {
  name: 'Winner Person',
  street: '123 Main St',
  city: 'Portland',
  state: 'OR',
  zip: '97201',
  country: 'US',
};

function makeFirestoreMock(overrides = {}) {
  const parties = {
    [PARTY_ID]: {
      adminId: HOST_ID,
      status: 'ENDED',
      config: { maxSteals: 3, returnToStart: false },
    },
    'party-active': {
      adminId: HOST_ID,
      status: 'ACTIVE',
      config: { maxSteals: 3, returnToStart: false },
    },
    ...overrides.parties,
  };

  const gifts = {
    [GIFT_ID]: {
      partyId: PARTY_ID,
      submitterId: SENDER_ID,
      winnerId: WINNER_ID,
      title: 'Cool Gift',
      url: 'https://example.com',
    },
    'gift-wrong-party': {
      partyId: 'other-party',
      submitterId: SENDER_ID,
      winnerId: WINNER_ID,
      title: 'Other',
      url: 'https://example.com',
    },
    ...overrides.gifts,
  };

  const users = {
    [WINNER_ID]: {
      displayName: 'Winner',
      email: 'winner@example.com',
      shippingAddress: sampleAddress,
      shippingAddressSenderShareConsentAt: new Date('2026-01-01T00:00:00Z'),
    },
    [SENDER_ID]: {
      displayName: 'Sender',
      email: 'sender@example.com',
    },
    ...overrides.users,
  };

  function docSnapshot(id, data, exists = true) {
    return {
      exists,
      id,
      data: () => (exists ? data : undefined),
    };
  }

  const db = {
    collection(name) {
      const tables = { parties, gifts, users };
      const table = tables[name] || {};
      return {
        doc(id) {
          return {
            async get() {
              if (name === 'parties') {
                const row = table[id];
                return docSnapshot(id, row, Boolean(row));
              }
              if (name === 'gifts') {
                const row = table[id];
                return docSnapshot(id, row, Boolean(row));
              }
              if (name === 'users') {
                const row = table[id];
                return docSnapshot(id, row, Boolean(row));
              }
              return docSnapshot(id, null, false);
            },
          };
        },
      };
    },
  };

  return db;
}

test('unauthenticated request is denied', async () => {
  const db = makeFirestoreMock();
  const result = await fetchWinnerShippingAddressForSender(db, {
    callerUid: null,
    partyId: PARTY_ID,
    giftId: GIFT_ID,
  });
  assert.equal(result.status, 401);
});

test('assigned sender succeeds when game ended, address and consent present', async () => {
  const db = makeFirestoreMock();
  const result = await fetchWinnerShippingAddressForSender(db, {
    callerUid: SENDER_ID,
    partyId: PARTY_ID,
    giftId: GIFT_ID,
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.shippingAddress, sampleAddress);
  assert.equal(result.shippingAddress.email, undefined);
});

test('other party member is denied', async () => {
  const db = makeFirestoreMock();
  const result = await fetchWinnerShippingAddressForSender(db, {
    callerUid: OTHER_MEMBER_ID,
    partyId: PARTY_ID,
    giftId: GIFT_ID,
  });
  assert.equal(result.status, 403);
});

test('host who is not the sender is denied', async () => {
  const db = makeFirestoreMock();
  const result = await fetchWinnerShippingAddressForSender(db, {
    callerUid: HOST_ID,
    partyId: PARTY_ID,
    giftId: GIFT_ID,
  });
  assert.equal(result.status, 403);
});

test('random user is denied', async () => {
  const db = makeFirestoreMock();
  const result = await fetchWinnerShippingAddressForSender(db, {
    callerUid: RANDOM_ID,
    partyId: PARTY_ID,
    giftId: GIFT_ID,
  });
  assert.equal(result.status, 403);
});

test('wrong party/gift combination is denied', async () => {
  const db = makeFirestoreMock();
  const result = await fetchWinnerShippingAddressForSender(db, {
    callerUid: SENDER_ID,
    partyId: PARTY_ID,
    giftId: 'gift-wrong-party',
  });
  assert.equal(result.status, 403);
});

test('assigned sender is denied if the game has not ended', async () => {
  const db = makeFirestoreMock({
    parties: {
      [PARTY_ID]: {
        adminId: HOST_ID,
        status: 'ACTIVE',
        config: { maxSteals: 3, returnToStart: false },
      },
    },
  });
  const result = await fetchWinnerShippingAddressForSender(db, {
    callerUid: SENDER_ID,
    partyId: PARTY_ID,
    giftId: GIFT_ID,
  });
  assert.equal(result.status, 403);
  assert.match(result.error, /not ended/i);
});

test('assigned sender is denied if winner has no address', async () => {
  const db = makeFirestoreMock({
    users: {
      [WINNER_ID]: {
        displayName: 'Winner',
        email: 'winner@example.com',
        shippingAddressSenderShareConsentAt: new Date(),
      },
    },
  });
  const result = await fetchWinnerShippingAddressForSender(db, {
    callerUid: SENDER_ID,
    partyId: PARTY_ID,
    giftId: GIFT_ID,
  });
  assert.equal(result.status, 404);
});

test('assigned sender is denied if winner has address but no consent', async () => {
  const db = makeFirestoreMock({
    users: {
      [WINNER_ID]: {
        displayName: 'Winner',
        email: 'winner@example.com',
        shippingAddress: sampleAddress,
      },
    },
  });
  const result = await fetchWinnerShippingAddressForSender(db, {
    callerUid: SENDER_ID,
    partyId: PARTY_ID,
    giftId: GIFT_ID,
  });
  assert.equal(result.status, 403);
  assert.match(result.error, /consent/i);
});

test('response does not include email or other profile fields', async () => {
  const db = makeFirestoreMock();
  const result = await fetchWinnerShippingAddressForSender(db, {
    callerUid: SENDER_ID,
    partyId: PARTY_ID,
    giftId: GIFT_ID,
  });
  assert.equal(result.status, 200);
  const keys = Object.keys(result.shippingAddress).sort();
  assert.deepEqual(keys, ['city', 'country', 'name', 'state', 'street', 'zip']);
});
