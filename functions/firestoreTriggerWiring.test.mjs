/**
 * Firestore trigger wiring: each exported Firestore trigger must carry its document path in the
 * built endpoint. The v2 SDK signature is (documentOrOpts, handler); a path passed as a third
 * argument is silently dropped and the deployed trigger matches every document in the database.
 * These tests read the endpoint the deploy CLI reads (__endpoint.eventTrigger).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';

const CREATED = 'google.cloud.firestore.document.v1.created';

// Every Firestore trigger exported from index.js, with its exact path and event type.
const EXPECTED_FIRESTORE_TRIGGERS = {
  acceptInviteOnParticipantJoin: { document: 'parties/{partyId}/participants/{participantId}', eventType: CREATED },
  notifyGiftSubmitterOnShippingCreate: { document: 'parties/{partyId}/shipping/{userId}', eventType: CREATED },
};

function assertFirestoreTrigger(fn, expected) {
  const trigger = fn?.__endpoint?.eventTrigger;
  assert.ok(trigger, 'not an event-triggered function');
  assert.equal(trigger.eventType, expected.eventType);
  assert.equal(trigger.eventFilterPathPatterns?.document, expected.document);
}

const exported = await import('./index.js');

test('notifyGiftSubmitterOnShippingCreate fires only on CREATE of parties/{partyId}/shipping/{userId}', () => {
  assertFirestoreTrigger(
    exported.notifyGiftSubmitterOnShippingCreate,
    EXPECTED_FIRESTORE_TRIGGERS.notifyGiftSubmitterOnShippingCreate,
  );
});

test('acceptInviteOnParticipantJoin fires only on CREATE of parties/{partyId}/participants/{participantId}', () => {
  assertFirestoreTrigger(
    exported.acceptInviteOnParticipantJoin,
    EXPECTED_FIRESTORE_TRIGGERS.acceptInviteOnParticipantJoin,
  );
});

test('every exported Firestore trigger is listed above and has its document path', () => {
  const found = Object.entries(exported)
    .filter(([, fn]) => String(fn?.__endpoint?.eventTrigger?.eventType ?? '').startsWith('google.cloud.firestore.'))
    .map(([name]) => name)
    .sort();
  assert.deepEqual(found, Object.keys(EXPECTED_FIRESTORE_TRIGGERS).sort());
  for (const name of found) assertFirestoreTrigger(exported[name], EXPECTED_FIRESTORE_TRIGGERS[name]);
});

test('the old wrong-arity shape (opts, path, handler) fails the assertion', () => {
  const broken = onDocumentCreated(
    { secrets: [defineSecret('WIRING_TEST_SECRET')] },
    'parties/{partyId}/shipping/{userId}',
    async () => {},
  );
  assert.throws(
    () => assertFirestoreTrigger(broken, EXPECTED_FIRESTORE_TRIGGERS.notifyGiftSubmitterOnShippingCreate),
    assert.AssertionError,
  );
  assert.equal(broken.__endpoint.eventTrigger.eventFilterPathPatterns?.document, undefined);
});
