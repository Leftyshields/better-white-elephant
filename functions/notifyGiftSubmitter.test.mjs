import test from 'node:test';
import assert from 'node:assert/strict';
import {
  logNotifyGiftSubmitterFailure,
  notifyGiftSubmittersForWinnerAddress,
  resolveGiftSubmitterNotifyUpdate,
} from './notifyGiftSubmitterLogic.js';
import {
  GIFT_SUBMITTER_NOTIFY_NO_ADDRESS_SHARED_MESSAGE,
} from './sendPartyInviteLogic.js';
import {
  hasSenderShareConsent,
  pickShippingAddress,
} from './winnerShippingAddressConsent.js';
import { hasSenderShareConsent as serverHasConsent } from '../server/utils/winner-shipping-address.js';

const sampleAddress = {
  name: 'Winner Person',
  street: '123 Main St',
  city: 'Portland',
  state: 'OR',
  zip: '97201',
  country: 'US',
};

function makeDbMock({ gifts = [], users = {} } = {}) {
  return {
    collection(name) {
      if (name === 'gifts') {
        return {
          where(field, op, value) {
            assert.equal(field, 'winnerId');
            assert.equal(op, '==');
            const matched = gifts.filter((g) => g.winnerId === value);
            return {
              async get() {
                return {
                  empty: matched.length === 0,
                  docs: matched.map((g) => ({
                    id: g.id,
                    data: () => ({
                      submitterId: g.submitterId,
                      winnerId: g.winnerId,
                      partyId: g.partyId,
                    }),
                  })),
                };
              },
            };
          },
        };
      }
      if (name === 'users') {
        return {
          doc(uid) {
            return {
              async get() {
                const data = users[uid];
                return {
                  exists: Boolean(data),
                  data: () => data,
                };
              },
            };
          },
        };
      }
      throw new Error(`unexpected collection ${name}`);
    },
  };
}

test('hasSenderShareConsent matches server util', () => {
  const cases = [
    [{}, false],
    [{ shippingAddressSenderShareConsentAt: null }, false],
    [{ shippingAddressSenderShareConsentAt: new Date('2026-01-01') }, true],
    [{ shippingAddressSenderShareConsentAt: 'not-a-date' }, false],
    [{ shippingAddressSenderShareConsentAt: '2026-01-01T00:00:00Z' }, true],
    [{ shippingAddressSenderShareConsentAt: { toDate: () => new Date() } }, true],
  ];
  for (const [userData, expected] of cases) {
    assert.equal(hasSenderShareConsent(userData), serverHasConsent(userData));
    assert.equal(hasSenderShareConsent(userData), expected);
  }
});

test('resolveGiftSubmitterNotifyUpdate fires when consent is added with existing address', () => {
  const before = {
    shippingAddress: sampleAddress,
  };
  const after = {
    shippingAddress: sampleAddress,
    shippingAddressSenderShareConsentAt: new Date('2026-02-01T00:00:00Z'),
  };
  const update = resolveGiftSubmitterNotifyUpdate(before, after);
  assert.equal(update.shouldNotify, true);
  assert.equal(update.emailMode, 'with_address');
});

test('resolveGiftSubmitterNotifyUpdate does not fire on unrelated profile edits', () => {
  const consentAt = new Date('2026-01-01T00:00:00Z');
  const before = {
    displayName: 'A',
    shippingAddress: sampleAddress,
    shippingAddressSenderShareConsentAt: consentAt,
  };
  const after = {
    displayName: 'B',
    shippingAddress: sampleAddress,
    shippingAddressSenderShareConsentAt: consentAt,
  };
  assert.equal(resolveGiftSubmitterNotifyUpdate(before, after).shouldNotify, false);
});

test('no consent sends no-address email to assigned sender only', async () => {
  const sends = [];
  const db = makeDbMock({
    gifts: [
      { id: 'gift-1', winnerId: 'winner-1', submitterId: 'sender-1', partyId: 'party-1' },
      { id: 'gift-2', winnerId: 'winner-1', submitterId: 'sender-2', partyId: 'party-1' },
      { id: 'gift-3', winnerId: 'other-winner', submitterId: 'sender-3', partyId: 'party-1' },
    ],
    users: {
      'sender-1': { email: 'sender-1@example.com' },
      'sender-2': { email: 'sender-2@example.com' },
    },
  });

  const result = await notifyGiftSubmittersForWinnerAddress(db, {
    userId: 'winner-1',
    winnerUser: {
      displayName: 'Winner',
      shippingAddress: sampleAddress,
    },
    shippingAddressRaw: sampleAddress,
    emailMode: 'no_address_shared',
    getResend: () => ({
      emails: {
        send: async (payload) => {
          sends.push(payload);
        },
      },
    }),
    resolveFromEmail: () => 'noreply@example.com',
  });

  assert.equal(result.sentCount, 2);
  assert.equal(result.emailMode, 'no_address_shared');
  const recipients = sends.map((s) => s.to).sort();
  assert.deepEqual(recipients, ['sender-1@example.com', 'sender-2@example.com']);
  assert.ok(
    sends.every((s) =>
      s.html.includes("Your giftee hasn&#39;t shared a shipping address yet."),
    ),
  );
  assert.ok(sends.every((s) => !s.html.includes('123 Main St')));
});

test('with consent email includes address for assigned senders only', async () => {
  const sends = [];
  const db = makeDbMock({
    gifts: [
      { id: 'gift-a', winnerId: 'winner-1', submitterId: 'sender-a', partyId: 'party-1' },
      { id: 'gift-b', winnerId: 'winner-1', submitterId: 'sender-b', partyId: 'party-1' },
      { id: 'gift-c', winnerId: 'other-winner', submitterId: 'sender-c', partyId: 'party-1' },
    ],
    users: {
      'sender-a': { email: 'sender-a@example.com' },
      'sender-b': { email: 'sender-b@example.com' },
      'sender-c': { email: 'sender-c@example.com' },
    },
  });

  const result = await notifyGiftSubmittersForWinnerAddress(db, {
    userId: 'winner-1',
    winnerUser: {
      displayName: 'Winner',
      shippingAddressSenderShareConsentAt: new Date('2026-01-01T00:00:00Z'),
    },
    shippingAddressRaw: sampleAddress,
    emailMode: 'with_address',
    getResend: () => ({
      emails: {
        send: async (payload) => {
          sends.push(payload);
        },
      },
    }),
    resolveFromEmail: () => 'noreply@example.com',
  });

  assert.equal(result.sentCount, 2);
  const recipients = sends.map((s) => s.to).sort();
  assert.deepEqual(recipients, ['sender-a@example.com', 'sender-b@example.com']);
  assert.ok(sends.every((s) => s.html.includes('123 Main St')));
  assert.ok(pickShippingAddress(sampleAddress));
});

test('later consent triggers with_address path through resolver then send', async () => {
  const before = {
    shippingAddress: sampleAddress,
  };
  const after = {
    shippingAddress: sampleAddress,
    shippingAddressSenderShareConsentAt: new Date('2026-03-01T00:00:00Z'),
  };
  const update = resolveGiftSubmitterNotifyUpdate(before, after);
  assert.equal(update.emailMode, 'with_address');

  const sends = [];
  const db = makeDbMock({
    gifts: [{ id: 'gift-1', winnerId: 'winner-1', submitterId: 'sender-1', partyId: 'party-1' }],
    users: { 'sender-1': { email: 'sender@example.com' } },
  });

  const result = await notifyGiftSubmittersForWinnerAddress(db, {
    userId: 'winner-1',
    winnerUser: after,
    shippingAddressRaw: after.shippingAddress,
    emailMode: update.emailMode,
    getResend: () => ({
      emails: {
        send: async (payload) => {
          sends.push(payload);
        },
      },
    }),
    resolveFromEmail: () => 'noreply@example.com',
  });

  assert.equal(result.sentCount, 1);
  assert.ok(sends[0].html.includes('123 Main St'));
  assert.doesNotMatch(sends[0].html, new RegExp(GIFT_SUBMITTER_NOTIFY_NO_ADDRESS_SHARED_MESSAGE));
});

test('logNotifyGiftSubmitterFailure omits PII from logs', () => {
  const lines = [];
  const original = console.error;
  console.error = (payload) => {
    lines.push(typeof payload === 'string' ? payload : JSON.stringify(payload));
  };
  try {
    logNotifyGiftSubmitterFailure({
      code: 'resend/invalid',
      name: 'ResendError',
      message: 'Failed for winner@example.com at 123 Main St',
      stack: 'Error: leaked',
    });
  } finally {
    console.error = original;
  }
  assert.equal(lines.length, 1);
  const logged = lines[0];
  assert.match(logged, /resend\/invalid/);
  assert.match(logged, /ResendError/);
  assert.doesNotMatch(logged, /@/);
  assert.doesNotMatch(logged, /Main St/);
  assert.doesNotMatch(logged, /winner/);
});