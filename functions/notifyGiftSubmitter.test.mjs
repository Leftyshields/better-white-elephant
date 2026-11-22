import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  logNotifyGiftSubmitterFailure,
  notifyGiftSubmittersForPartyShipping,
} from './notifyGiftSubmitterLogic.js';
import { buildGiftSubmitterNoAddressOpening } from './sendPartyInviteLogic.js';
import { pickShippingAddress } from './winnerShippingAddressConsent.js';

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

function recorder(failFor) {
  const sends = [];
  return {
    sends,
    getResend: () => ({
      emails: {
        send: async (payload) => {
          if (payload.to === failFor) {
            const err = new Error(`boom ${failFor}`);
            err.code = 'send_failed';
            throw err;
          }
          sends.push(payload);
        },
      },
    }),
    resolveFromEmail: () => 'noreply@example.com',
  };
}

const savedDoc = { ...sampleAddress, savedAt: new Date('2026-11-21T00:00:00Z') };

test('trigger wiring: CREATE on parties/{partyId}/shipping/{userId} only; no users update trigger', () => {
  const source = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
  assert.match(
    source,
    /notifyGiftSubmitterOnShippingCreate = onDocumentCreated\([\s\S]*?'parties\/\{partyId\}\/shipping\/\{userId\}'/,
  );
  assert.doesNotMatch(source, /onDocumentUpdated|onDocumentWritten|onDocumentDeleted/);
  assert.doesNotMatch(source, /export const notifyGiftSubmitter = /);
});

test('pickShippingAddress keeps only the six address fields and needs street + city', () => {
  assert.deepEqual(pickShippingAddress(savedDoc), sampleAddress);
  assert.deepEqual(pickShippingAddress({ ...savedDoc, extra: 'x' }), sampleAddress);
  assert.equal(pickShippingAddress({ ...savedDoc, street: '  ' }), null);
  assert.equal(pickShippingAddress({ city: 'X' }), null);
  assert.equal(pickShippingAddress(null), null);
});

test('create emails the address to assigned senders of gifts won in THIS party only', async () => {
  const r = recorder();
  const db = makeDbMock({
    gifts: [
      { id: 'gift-a', winnerId: 'winner-1', submitterId: 'sender-a', partyId: 'party-1' },
      { id: 'gift-b', winnerId: 'winner-1', submitterId: 'sender-b', partyId: 'party-2' },
      { id: 'gift-c', winnerId: 'other-winner', submitterId: 'sender-c', partyId: 'party-1' },
    ],
    users: {
      'winner-1': { displayName: 'Winner' },
      'sender-a': { email: 'sender-a@example.com' },
      'sender-b': { email: 'sender-b@example.com' },
      'sender-c': { email: 'sender-c@example.com' },
    },
  });
  const result = await notifyGiftSubmittersForPartyShipping(db, {
    partyId: 'party-1',
    userId: 'winner-1',
    shippingDoc: savedDoc,
    ...r,
  });
  assert.equal(result.sentCount, 1);
  assert.deepEqual(r.sends.map((s) => s.to), ['sender-a@example.com']);
  assert.ok(r.sends[0].html.includes('123 Main St'));
  assert.ok(!r.sends[0].html.includes('savedAt'));
});

test('dedupe: one email per sender even if they gave two gifts this user holds; never to self', async () => {
  const r = recorder();
  const db = makeDbMock({
    gifts: [
      { id: 'gift-a', winnerId: 'winner-1', submitterId: 'sender-a', partyId: 'party-1' },
      { id: 'gift-a2', winnerId: 'winner-1', submitterId: 'sender-a', partyId: 'party-1' },
      { id: 'gift-own', winnerId: 'winner-1', submitterId: 'winner-1', partyId: 'party-1' },
    ],
    users: { 'sender-a': { email: 'sender-a@example.com' }, 'winner-1': { email: 'w@example.com' } },
  });
  const result = await notifyGiftSubmittersForPartyShipping(db, {
    partyId: 'party-1', userId: 'winner-1', shippingDoc: savedDoc, ...r,
  });
  assert.equal(result.sentCount, 1);
  assert.deepEqual(r.sends.map((s) => s.to), ['sender-a@example.com']);
});

test('no usable address or no gifts: nothing is sent', async () => {
  const r = recorder();
  const db = makeDbMock({
    gifts: [{ id: 'gift-a', winnerId: 'winner-1', submitterId: 'sender-a', partyId: 'party-1' }],
    users: { 'sender-a': { email: 'sender-a@example.com' } },
  });
  const bad = await notifyGiftSubmittersForPartyShipping(db, {
    partyId: 'party-1', userId: 'winner-1', shippingDoc: { ...savedDoc, street: '' }, ...r,
  });
  assert.equal(bad.reason, 'no_address');
  const none = await notifyGiftSubmittersForPartyShipping(db, {
    partyId: 'party-9', userId: 'winner-1', shippingDoc: savedDoc, ...r,
  });
  assert.equal(none.reason, 'no_gifts');
  assert.equal(r.sends.length, 0);
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
test('no-address opening falls back when winner name is empty', () => {
  assert.equal(buildGiftSubmitterNoAddressOpening('', 'winner-1'), 'Someone ended up with your gift.');
  assert.equal(buildGiftSubmitterNoAddressOpening('  ', 'winner-1'), 'Someone ended up with your gift.');
  assert.equal(buildGiftSubmitterNoAddressOpening('Pat', 'winner-1'), 'Pat ended up with your gift.');
});

test('one failed send does not stop the remaining senders; logs carry no PII', async () => {
  const r = recorder('sender-1@example.com');
  const db = makeDbMock({
    gifts: [
      { id: 'gift-1', winnerId: 'winner-1', submitterId: 'sender-1', partyId: 'party-1' },
      { id: 'gift-2', winnerId: 'winner-1', submitterId: 'sender-2', partyId: 'party-1' },
    ],
    users: {
      'sender-1': { email: 'sender-1@example.com' },
      'sender-2': { email: 'sender-2@example.com' },
    },
  });
  const originalError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  try {
    const result = await notifyGiftSubmittersForPartyShipping(db, {
      partyId: 'party-1', userId: 'winner-1', shippingDoc: savedDoc, ...r,
    });
    assert.equal(result.sentCount, 1);
    assert.equal(result.failedCount, 1);
    assert.deepEqual(r.sends.map((s) => s.to), ['sender-2@example.com']);
    const text = JSON.stringify(logged);
    assert.ok(!text.includes('@example.com'));
    assert.ok(!text.includes('Main St'));
  } finally {
    console.error = originalError;
  }
});
