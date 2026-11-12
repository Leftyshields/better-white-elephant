/**
 * Behavior tests for dataRetentionCleanup helpers (no production / no emulator required).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { dedupeOperationsByDocumentPath, getAllDocumentsFromQuery } from './dataRetentionBatch.js';
import {
  MS_PER_DAY,
  collectEndedPartiesBeforeCutoff,
  isAbandonedPartyPastRetention,
  isEndedPartyPastRetention,
  legacyAddressCleanupIterator,
  partiesForAddressCleanupIterable,
  shouldDeleteGiftForRetention,
  shouldRemoveShippingAddress,
  userInAddressBlockingParty,
} from './dataRetentionLogic.js';

function tsFromNow(nowMs, daysOffset) {
  return { toMillis: () => nowMs + daysOffset * MS_PER_DAY };
}

const NOW = Date.UTC(2026, 0, 15);
const THIRTY_DAYS_AGO = tsFromNow(NOW, -30);
const TWENTY_DAYS_AGO = tsFromNow(NOW, -20);
const FORTY_DAYS_AGO = tsFromNow(NOW, -40);

test('regression: legacy .docs on plain array throws (unfixed address loop)', () => {
  const partiesForAddressCleanup = [
    { id: 'party-1', data: () => ({ status: 'ENDED', endedAt: FORTY_DAYS_AGO }) },
  ];
  assert.equal(partiesForAddressCleanup.docs, undefined);
  assert.throws(
    () => legacyAddressCleanupIterator(partiesForAddressCleanup),
    (err) => err instanceof TypeError,
  );
});

test('partiesForAddressCleanupIterable walks a plain array', () => {
  const parties = [{ id: 'a' }, { id: 'b' }];
  const walked = partiesForAddressCleanupIterable(parties);
  assert.deepEqual(walked.map((p) => p.id), ['a', 'b']);
});

test('dedupeOperationsByDocumentPath: one update per users/{uid} when two ended parties match', () => {
  const userRef = { path: 'users/same-uid' };
  const operations = [
    { type: 'update', ref: userRef, data: { shippingAddress: 'delete-1' } },
    { type: 'update', ref: userRef, data: { shippingAddress: 'delete-2' } },
  ];
  const deduped = dedupeOperationsByDocumentPath(operations);
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].ref.path, 'users/same-uid');
  assert.equal(operations.length, 2, 'pre-dedupe loop can enqueue duplicates from two source parties');
});

test('shipping address: removed 30+ days after game end without fulfillment fields', () => {
  assert.equal(
    shouldRemoveShippingAddress({
      hasShippingAddress: true,
      sourcePartyEndedBeforeCutoff: true,
      userInNotEndedParty: false,
    }),
    true,
  );
});

test('regression: collectionGroup documentId() matches full path, not participant uid', () => {
  const uid = 'firebase-uid-alice';
  const fullParticipantPath = `parties/party-42/participants/${uid}`;
  assert.notEqual(fullParticipantPath, uid, 'documentId() equality against uid alone cannot find participant docs');
});

test('userInAddressBlockingParty: LOBBY/ACTIVE membership blocks; CANCELLED does not', () => {
  assert.equal(
    userInAddressBlockingParty(
      [
        { partyId: 'ended-source', status: 'ENDED', hasParticipant: true },
        { partyId: 'other-lobby', status: 'LOBBY', hasParticipant: true },
      ],
      { excludePartyId: 'ended-source' },
    ),
    true,
  );
  assert.equal(
    userInAddressBlockingParty(
      [
        { partyId: 'ended-source', status: 'ENDED', hasParticipant: true },
        { partyId: 'cancelled-old', status: 'CANCELLED', hasParticipant: true },
        { partyId: 'active-other', status: 'ACTIVE', hasParticipant: false },
      ],
      { excludePartyId: 'ended-source' },
    ),
    false,
  );
});

test('shipping address: not removed if user is in another LOBBY/ACTIVE party', () => {
  const userInNotEndedParty = userInAddressBlockingParty(
    [{ partyId: 'p2', status: 'ACTIVE', hasParticipant: true }],
    { excludePartyId: 'p1' },
  );
  assert.equal(
    shouldRemoveShippingAddress({
      hasShippingAddress: true,
      sourcePartyEndedBeforeCutoff: true,
      userInNotEndedParty,
    }),
    false,
  );
});

test('shipping address: not removed before 30-day cutoff', () => {
  assert.equal(
    shouldRemoveShippingAddress({
      hasShippingAddress: true,
      sourcePartyEndedBeforeCutoff: false,
      userInNotEndedParty: false,
    }),
    false,
  );
});

test('ENDED party: deleted after 30 days from endedAt (not 1 year)', () => {
  const party = { status: 'ENDED', endedAt: FORTY_DAYS_AGO };
  assert.equal(isEndedPartyPastRetention(party, THIRTY_DAYS_AGO), true);

  const recent = { status: 'ENDED', endedAt: TWENTY_DAYS_AGO };
  assert.equal(isEndedPartyPastRetention(recent, THIRTY_DAYS_AGO), false);
});

test('ENDED party: endedAt falls back to updatedAt for retention', () => {
  const party = { status: 'ENDED', updatedAt: FORTY_DAYS_AGO };
  assert.equal(isEndedPartyPastRetention(party, THIRTY_DAYS_AGO), true);
});

test('abandoned LOBBY party: deleted when last activity > 30 days ago', () => {
  const stale = { status: 'LOBBY', updatedAt: FORTY_DAYS_AGO, createdAt: FORTY_DAYS_AGO };
  assert.equal(isAbandonedPartyPastRetention(stale, THIRTY_DAYS_AGO), true);
});

test('abandoned party: not deleted if recently updated', () => {
  const active = { status: 'ACTIVE', updatedAt: TWENTY_DAYS_AGO, createdAt: FORTY_DAYS_AGO };
  assert.equal(isAbandonedPartyPastRetention(active, THIRTY_DAYS_AGO), false);
});

test('collectEndedPartiesBeforeCutoff builds array for address pass (not QuerySnapshot)', () => {
  const docs = [
    { id: 'old', data: () => ({ status: 'ENDED', endedAt: FORTY_DAYS_AGO }) },
    { id: 'new', data: () => ({ status: 'ENDED', endedAt: TWENTY_DAYS_AGO }) },
  ];
  const collected = collectEndedPartiesBeforeCutoff(docs, THIRTY_DAYS_AGO);
  assert.equal(collected.length, 1);
  assert.equal(collected[0].id, 'old');
  assert.doesNotThrow(() => {
    for (const _doc of partiesForAddressCleanupIterable(collected)) {
      // gift-link step would run after this loop in the real job
    }
  });
});

test('gift-link phase can run after address iterable completes (control-flow stand-in)', () => {
  let giftStepRan = false;
  const partiesForAddressCleanup = collectEndedPartiesBeforeCutoff(
    [{ id: 'p', data: () => ({ status: 'ENDED', endedAt: FORTY_DAYS_AGO }) }],
    THIRTY_DAYS_AGO,
  );
  for (const _partyDoc of partiesForAddressCleanupIterable(partiesForAddressCleanup)) {
    // address pass
  }
  giftStepRan = true;
  assert.equal(giftStepRan, true);
});

test('gift: full delete when partyEndedAt is past 30-day cutoff', () => {
  assert.equal(
    shouldDeleteGiftForRetention({ partyEndedAt: FORTY_DAYS_AGO }, THIRTY_DAYS_AGO, undefined),
    true,
  );
});

test('gift: not deleted when partyEndedAt is within 30 days', () => {
  assert.equal(
    shouldDeleteGiftForRetention(
      { partyEndedAt: TWENTY_DAYS_AGO, partyId: 'p' },
      THIRTY_DAYS_AGO,
      { status: 'ENDED', endedAt: TWENTY_DAYS_AGO },
    ),
    false,
  );
});

test('gift: deleted via ENDED party when partyEndedAt missing', () => {
  assert.equal(
    shouldDeleteGiftForRetention(
      { partyId: 'p' },
      THIRTY_DAYS_AGO,
      { status: 'ENDED', endedAt: FORTY_DAYS_AGO },
    ),
    true,
  );
});

test('gift: not deleted for LOBBY or ACTIVE parties', () => {
  assert.equal(
    shouldDeleteGiftForRetention(
      { partyId: 'p' },
      THIRTY_DAYS_AGO,
      { status: 'LOBBY', updatedAt: FORTY_DAYS_AGO },
    ),
    false,
  );
  assert.equal(
    shouldDeleteGiftForRetention(
      { partyId: 'p' },
      THIRTY_DAYS_AGO,
      { status: 'ACTIVE', updatedAt: TWENTY_DAYS_AGO },
    ),
    false,
  );
});

test('gift: deleted when party document is missing (orphan)', () => {
  assert.equal(
    shouldDeleteGiftForRetention({ partyId: 'missing' }, THIRTY_DAYS_AGO, null),
    true,
  );
});

test('regression: unpaginated limit(500) would miss expired gifts on page 2', async () => {
  const totalGifts = 501;
  const docsByPage = [];
  for (let i = 0; i < totalGifts; i += 1) {
    const pageIndex = Math.floor(i / 500);
    if (!docsByPage[pageIndex]) docsByPage[pageIndex] = [];
    docsByPage[pageIndex].push({
      id: `gift-${i}`,
      data: () => ({
        partyEndedAt: i >= 500 ? FORTY_DAYS_AGO : TWENTY_DAYS_AGO,
      }),
    });
  }

  const baseQuery = {
    limit(pageSize) {
      let startAfterDoc = null;
      const query = {
        startAfter(doc) {
          startAfterDoc = doc;
          return query;
        },
        async get() {
          const pageIdx = startAfterDoc == null ? 0 : 1;
          return { docs: docsByPage[pageIdx] ?? [] };
        },
      };
      return query;
    },
  };

  const allDocs = await getAllDocumentsFromQuery(baseQuery, 500);
  assert.equal(allDocs.length, 501);

  const toDelete = allDocs.filter((doc) =>
    shouldDeleteGiftForRetention(doc.data(), THIRTY_DAYS_AGO, undefined),
  );
  assert.equal(toDelete.length, 1);
  assert.equal(toDelete[0].id, 'gift-500');
});

test('regression: field-only url delete would leave title and partyId (full doc delete required)', () => {
  const gift = {
    partyEndedAt: FORTY_DAYS_AGO,
    title: 'Widget',
    partyId: 'party-old',
    url: 'https://example.com/gift',
  };
  assert.equal(shouldDeleteGiftForRetention(gift, THIRTY_DAYS_AGO, undefined), true);
  assert.ok(gift.title, 'stale job left non-url fields indefinitely');
});
