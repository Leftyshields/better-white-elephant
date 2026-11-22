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

const defaultGameState = {
  phase: 'ENDED',
  finalOwnership: { [GIFT_ID]: WINNER_ID },
};

const defaultFulfillment = {
  [GIFT_ID]: { submitterId: SENDER_ID, winnerId: WINNER_ID },
};

function makeFirestoreMock(overrides = {}) {
  const parties = {
    [PARTY_ID]: {
      adminId: HOST_ID,
      status: 'ENDED',
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
    },
    [SENDER_ID]: {
      displayName: 'Sender',
      email: 'sender@example.com',
    },
    ...overrides.users,
  };

  // Per-game address docs: parties/{PARTY_ID}/shipping/{uid} (A0).
  const shipping = Object.hasOwn(overrides, 'shipping')
    ? overrides.shipping
    : { [WINNER_ID]: { ...sampleAddress, savedAt: new Date('2026-01-01T00:00:00Z') } };

  const participants = {
    [PARTY_ID]: {
      [SENDER_ID]: { status: 'GOING' },
      [WINNER_ID]: { status: 'GOING' },
      [HOST_ID]: { status: 'GOING' },
      [OTHER_MEMBER_ID]: { status: 'GOING' },
      ...(overrides.participants?.[PARTY_ID] || {}),
    },
    ...(overrides.participantsExtra || {}),
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
      if (name === 'parties') {
        return {
          doc(id) {
            return {
              async get() {
                const row = parties[id];
                return docSnapshot(id, row, Boolean(row));
              },
              collection(sub) {
                if (sub === 'shipping') {
                  const partyShipping = id === PARTY_ID ? shipping : {};
                  return {
                    doc(uid) {
                      return {
                        async get() {
                          const row = partyShipping[uid];
                          return docSnapshot(uid, row, Boolean(row));
                        },
                      };
                    },
                  };
                }
                if (sub !== 'participants') {
                  throw new Error('unexpected sub');
                }
                const partyParticipants = participants[id] || {};
                return {
                  doc(participantId) {
                    return {
                      async get() {
                        const row = partyParticipants[participantId];
                        return docSnapshot(participantId, row, Boolean(row));
                      },
                    };
                  },
                };
              },
            };
          },
        };
      }

      const tables = { gifts, users };
      const table = tables[name] || {};
      return {
        doc(id) {
          return {
            async get() {
              if (name === 'gifts' || name === 'users') {
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

function defaultDeps(overrides = {}) {
  return {
    loadGameState: async () =>
      Object.hasOwn(overrides, 'gameState') ? overrides.gameState : defaultGameState,
    loadFulfillmentSnapshot: async () =>
      Object.hasOwn(overrides, 'fulfillment') ? overrides.fulfillment : defaultFulfillment,
  };
}

test('unauthenticated request is denied', async () => {
  const db = makeFirestoreMock();
  const result = await fetchWinnerShippingAddressForSender(
    db,
    { callerUid: null, partyId: PARTY_ID, giftId: GIFT_ID },
    defaultDeps(),
  );
  assert.equal(result.status, 401);
});

test('assigned sender succeeds when game ended and the winner saved a per-game address', async () => {
  const db = makeFirestoreMock();
  const result = await fetchWinnerShippingAddressForSender(
    db,
    { callerUid: SENDER_ID, partyId: PARTY_ID, giftId: GIFT_ID },
    defaultDeps(),
  );
  assert.equal(result.status, 200);
  assert.deepEqual(result.shippingAddress, sampleAddress);
  assert.equal(result.shippingAddress.email, undefined);
});

test('other party member is denied', async () => {
  const db = makeFirestoreMock();
  const result = await fetchWinnerShippingAddressForSender(
    db,
    { callerUid: OTHER_MEMBER_ID, partyId: PARTY_ID, giftId: GIFT_ID },
    defaultDeps(),
  );
  assert.equal(result.status, 403);
});

test('host who is not the sender is denied', async () => {
  const db = makeFirestoreMock();
  const result = await fetchWinnerShippingAddressForSender(
    db,
    { callerUid: HOST_ID, partyId: PARTY_ID, giftId: GIFT_ID },
    defaultDeps(),
  );
  assert.equal(result.status, 403);
});

test('random user is denied', async () => {
  const db = makeFirestoreMock();
  const result = await fetchWinnerShippingAddressForSender(
    db,
    { callerUid: RANDOM_ID, partyId: PARTY_ID, giftId: GIFT_ID },
    defaultDeps(),
  );
  assert.equal(result.status, 403);
});

test('wrong party/gift combination is denied', async () => {
  const db = makeFirestoreMock();
  const result = await fetchWinnerShippingAddressForSender(
    db,
    { callerUid: SENDER_ID, partyId: PARTY_ID, giftId: 'gift-wrong-party' },
    defaultDeps(),
  );
  assert.equal(result.status, 403);
});

test('assigned sender is denied if the game has not ended', async () => {
  const db = makeFirestoreMock();
  const result = await fetchWinnerShippingAddressForSender(
    db,
    { callerUid: SENDER_ID, partyId: PARTY_ID, giftId: GIFT_ID },
    defaultDeps({ gameState: { phase: 'ACTIVE' } }),
  );
  assert.equal(result.status, 403);
  assert.match(result.error, /not ended/i);
  assert.equal(result.code, 'GAME_NOT_ENDED');
});

test('assigned sender gets no address (200, not an error) if winner has no per-game address', async () => {
  const db = makeFirestoreMock({ shipping: {} });
  const result = await fetchWinnerShippingAddressForSender(
    db,
    { callerUid: SENDER_ID, partyId: PARTY_ID, giftId: GIFT_ID },
    defaultDeps(),
  );
  assert.deepEqual(result, { status: 200, shippingAddress: null });
});

test('A0: an old profile address is never served (only the per-game doc counts)', async () => {
  const db = makeFirestoreMock({
    shipping: {},
    users: {
      [WINNER_ID]: {
        displayName: 'Winner',
        email: 'winner@example.com',
        shippingAddress: sampleAddress,
        shippingAddressSenderShareConsentAt: new Date('2026-01-01T00:00:00Z'),
      },
    },
  });
  const result = await fetchWinnerShippingAddressForSender(
    db,
    { callerUid: SENDER_ID, partyId: PARTY_ID, giftId: GIFT_ID },
    defaultDeps(),
  );
  assert.deepEqual(result, { status: 200, shippingAddress: null });
});

test('A0: the winner address doc from another party is not served', async () => {
  // The mock only holds shipping docs for PARTY_ID; a different party resolves no doc.
  const db = makeFirestoreMock({
    parties: { 'party-2': { adminId: HOST_ID, status: 'ENDED' } },
    gifts: { 'gift-2': { partyId: 'party-2', submitterId: SENDER_ID, winnerId: WINNER_ID } },
    participantsExtra: { 'party-2': { [SENDER_ID]: { status: 'GOING' }, [WINNER_ID]: { status: 'GOING' } } },
  });
  const result = await fetchWinnerShippingAddressForSender(
    db,
    { callerUid: SENDER_ID, partyId: 'party-2', giftId: 'gift-2' },
    defaultDeps({
      gameState: { phase: 'ENDED', finalOwnership: { 'gift-2': WINNER_ID } },
      fulfillment: { 'gift-2': { submitterId: SENDER_ID, winnerId: WINNER_ID } },
    }),
  );
  assert.deepEqual(result, { status: 200, shippingAddress: null });
});

test('non-sender is still denied (403) when the winner has no address', async () => {
  const db = makeFirestoreMock({ shipping: {} });
  const result = await fetchWinnerShippingAddressForSender(
    db,
    { callerUid: OTHER_MEMBER_ID, partyId: PARTY_ID, giftId: GIFT_ID },
    defaultDeps(),
  );
  assert.equal(result.status, 403);
  assert.equal(result.shippingAddress, undefined);
});

test('whitespace-only street counts as no address (200, no address)', async () => {
  const db = makeFirestoreMock({
    shipping: { [WINNER_ID]: { ...sampleAddress, street: '   ', savedAt: new Date() } },
  });
  const result = await fetchWinnerShippingAddressForSender(
    db,
    { callerUid: SENDER_ID, partyId: PARTY_ID, giftId: GIFT_ID },
    defaultDeps(),
  );
  assert.deepEqual(result, { status: 200, shippingAddress: null });
});

test('response does not include email or other profile fields', async () => {
  const db = makeFirestoreMock();
  const result = await fetchWinnerShippingAddressForSender(
    db,
    { callerUid: SENDER_ID, partyId: PARTY_ID, giftId: GIFT_ID },
    defaultDeps(),
  );
  assert.equal(result.status, 200);
  const keys = Object.keys(result.shippingAddress).sort();
  assert.deepEqual(keys, ['city', 'country', 'name', 'state', 'street', 'zip']);
});

test('denies when fulfillment snapshot is missing (made-up ended party)', async () => {
  const db = makeFirestoreMock();
  const result = await fetchWinnerShippingAddressForSender(
    db,
    { callerUid: SENDER_ID, partyId: PARTY_ID, giftId: GIFT_ID },
    defaultDeps({ fulfillment: null }),
  );
  assert.equal(result.status, 403);
  assert.match(result.error, /fulfillment/i);
  assert.equal(result.code, 'FULFILLMENT_NOT_FOUND');
});

test('denies when Firestore gift winnerId was repointed but fulfillment is authoritative', async () => {
  const db = makeFirestoreMock({
    gifts: {
      [GIFT_ID]: {
        partyId: PARTY_ID,
        submitterId: SENDER_ID,
        winnerId: 'hacked-winner',
        title: 'Cool Gift',
        url: 'https://example.com',
      },
    },
    shipping: {
      [WINNER_ID]: { ...sampleAddress, savedAt: new Date() },
      'hacked-winner': { ...sampleAddress, name: 'Hacked', savedAt: new Date() },
    },
    participants: {
      [PARTY_ID]: {
        [SENDER_ID]: { status: 'GOING' },
        [WINNER_ID]: { status: 'GOING' },
        'hacked-winner': { status: 'GOING' },
      },
    },
  });
  const result = await fetchWinnerShippingAddressForSender(
    db,
    { callerUid: SENDER_ID, partyId: PARTY_ID, giftId: GIFT_ID },
    defaultDeps(),
  );
  assert.equal(result.status, 200);
  assert.deepEqual(result.shippingAddress, sampleAddress);
});

test('denies when Firestore submitterId was rewritten to match attacker', async () => {
  const db = makeFirestoreMock({
    gifts: {
      [GIFT_ID]: {
        partyId: PARTY_ID,
        submitterId: HOST_ID,
        winnerId: WINNER_ID,
        title: 'Cool Gift',
        url: 'https://example.com',
      },
    },
  });
  const result = await fetchWinnerShippingAddressForSender(
    db,
    { callerUid: HOST_ID, partyId: PARTY_ID, giftId: GIFT_ID },
    defaultDeps(),
  );
  assert.equal(result.status, 403);
});
