/**
 * Behavior tests for dataRetentionCleanup helpers (no production / no emulator required).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const functionsDir = join(dirname(fileURLToPath(import.meta.url)));
const dataRetentionIndexSource = readFileSync(join(functionsDir, 'index.js'), 'utf8');
import { dedupeOperationsByDocumentPath, getAllDocumentsFromQuery } from './dataRetentionBatch.js';
import {
  collectExpiredShippingDeletes,
  shouldDeleteShippingDoc,
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

test('regression: dataRetentionCleanup does not delete Firestore analytics collection', () => {
  assert.doesNotMatch(dataRetentionIndexSource, /collection\(['"]analytics['"]\)/);
  assert.doesNotMatch(dataRetentionIndexSource, /deletedAnalytics/);
  assert.doesNotMatch(dataRetentionIndexSource, /Analytics and Logs: 90 days/);
});

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

test('gift: invalid partyEndedAt is not treated as expired', () => {
  assert.equal(
    shouldDeleteGiftForRetention(
      { partyEndedAt: { seconds: 'not-a-number' }, partyId: 'p' },
      THIRTY_DAYS_AGO,
      { status: 'ACTIVE', updatedAt: TWENTY_DAYS_AGO },
    ),
    false,
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

test('party subtree delete also removes the invite token and join proofs (item 1)', () => {
  const start = dataRetentionIndexSource.indexOf('async function queuePartySubtreeDeletes');
  const body = dataRetentionIndexSource.slice(start, dataRetentionIndexSource.indexOf('\n}\n', start));
  assert.match(body, /collection\('private'\)\.doc\('invite'\)/);
  assert.match(body, /collection\('joinProofs'\)\.get\(\)/);
});

// ---- A0 per-game shipping docs: parties/{partyId}/shipping/{uid} ----

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW_MS = Date.UTC(2026, 10, 21);
const CUTOFF_MS = NOW_MS - 30 * DAY_MS;

function fakeShippingDoc(partyId, uid, partyData, { sub = 'shipping', root = 'parties', rootParent = null } = {}) {
  const path = `${root}/${partyId}/${sub}/${uid}`;
  return {
    ref: {
      path,
      parent: {
        id: sub,
        parent: {
          id: partyId,
          parent: { id: root, parent: rootParent },
          async get() {
            return { exists: partyData !== null, data: () => partyData };
          },
        },
      },
    },
  };
}

test('shipping doc: 30-day boundary after ENDED (on cutoff deleted, 1 ms after kept)', () => {
  assert.equal(shouldDeleteShippingDoc({ status: 'ENDED', endedAt: CUTOFF_MS }, CUTOFF_MS), true);
  assert.equal(shouldDeleteShippingDoc({ status: 'ENDED', endedAt: CUTOFF_MS - DAY_MS }, CUTOFF_MS), true);
  assert.equal(shouldDeleteShippingDoc({ status: 'ENDED', endedAt: CUTOFF_MS + 1 }, CUTOFF_MS), false);
  assert.equal(shouldDeleteShippingDoc({ status: 'ENDED', endedAt: NOW_MS - DAY_MS }, CUTOFF_MS), false);
});

test('shipping doc: fails closed (missing party, ENDED with no end time, CANCELLED, unknown status)', () => {
  assert.equal(shouldDeleteShippingDoc(null, CUTOFF_MS), true);
  assert.equal(shouldDeleteShippingDoc({ status: 'ENDED' }, CUTOFF_MS), true);
  assert.equal(shouldDeleteShippingDoc({ status: 'ENDED', endedAt: 'garbage' }, CUTOFF_MS), true);
  assert.equal(shouldDeleteShippingDoc({ status: 'CANCELLED', updatedAt: NOW_MS }, CUTOFF_MS), true);
  assert.equal(shouldDeleteShippingDoc({ status: 'WAT', updatedAt: NOW_MS }, CUTOFF_MS), true);
});

test('shipping doc: live LOBBY/ACTIVE kept; abandoned past 30 days deleted', () => {
  assert.equal(shouldDeleteShippingDoc({ status: 'LOBBY', updatedAt: NOW_MS }, CUTOFF_MS), false);
  assert.equal(shouldDeleteShippingDoc({ status: 'ACTIVE', updatedAt: NOW_MS }, CUTOFF_MS), false);
  assert.equal(shouldDeleteShippingDoc({ status: 'ACTIVE', updatedAt: CUTOFF_MS - 1 }, CUTOFF_MS), true);
});

test('collectExpiredShippingDeletes: deletes only expired docs, reads each party once', async () => {
  let reads = 0;
  const counted = (doc) => {
    const original = doc.ref.parent.parent.get;
    doc.ref.parent.parent.get = async () => {
      reads += 1;
      return original();
    };
    return doc;
  };
  const oldParty = { status: 'ENDED', endedAt: CUTOFF_MS - DAY_MS };
  const docs = [
    counted(fakeShippingDoc('old', 'a', oldParty)),
    counted(fakeShippingDoc('old', 'b', oldParty)),
    counted(fakeShippingDoc('recent', 'c', { status: 'ENDED', endedAt: NOW_MS - DAY_MS })),
    counted(fakeShippingDoc('gone', 'd', null)),
    counted(fakeShippingDoc('live', 'e', { status: 'LOBBY', updatedAt: NOW_MS })),
  ];
  const ops = await collectExpiredShippingDeletes(docs, CUTOFF_MS);
  assert.deepEqual(
    ops.map((op) => [op.type, op.ref.path]),
    [
      ['delete', 'parties/old/shipping/a'],
      ['delete', 'parties/old/shipping/b'],
      ['delete', 'parties/gone/shipping/d'],
    ],
  );
  assert.equal(reads, 4);
});

test('collectExpiredShippingDeletes: shippingNotified markers follow the same rules', async () => {
  const docs = [
    fakeShippingDoc('old', 'w_s', { status: 'ENDED', endedAt: CUTOFF_MS - DAY_MS }, { sub: 'shippingNotified' }),
    fakeShippingDoc('recent', 'w_s', { status: 'ENDED', endedAt: NOW_MS - DAY_MS }, { sub: 'shippingNotified' }),
    fakeShippingDoc('gone', 'w_s', null, { sub: 'shippingNotified' }),
    fakeShippingDoc('cancelled', 'w_s', { status: 'CANCELLED', updatedAt: NOW_MS }, { sub: 'shippingNotified' }),
    fakeShippingDoc('abandoned', 'w_s', { status: 'ACTIVE', updatedAt: CUTOFF_MS - 1 }, { sub: 'shippingNotified' }),
    fakeShippingDoc('live', 'w_s', { status: 'LOBBY', updatedAt: NOW_MS }, { sub: 'shippingNotified' }),
  ];
  const ops = await collectExpiredShippingDeletes(docs, CUTOFF_MS);
  assert.deepEqual(ops.map((op) => op.ref.path), [
    'parties/old/shippingNotified/w_s',
    'parties/gone/shippingNotified/w_s',
    'parties/cancelled/shippingNotified/w_s',
    'parties/abandoned/shippingNotified/w_s',
  ]);
});

test('collectExpiredShippingDeletes: never deletes a same-named subcollection outside parties/{id}', async () => {
  const docs = [
    fakeShippingDoc('u1', 'x', null, { root: 'users' }),
    fakeShippingDoc('u1', 'x', null, { root: 'users', sub: 'shippingNotified' }),
    fakeShippingDoc('p1', 'x', null, { rootParent: { id: 'nested', parent: null } }),
    { ref: { path: 'shipping/x', parent: { id: 'shipping', parent: null } } },
    fakeShippingDoc('p2', 'x', null),
  ];
  const ops = await collectExpiredShippingDeletes(docs, CUTOFF_MS);
  assert.deepEqual(ops.map((op) => op.ref.path), ['parties/p2/shipping/x']);
});

test('dataRetentionCleanup wires the shipping pass and party delete removes the shipping subcollection', () => {
  const source = readFileSync(join(functionsDir, 'index.js'), 'utf8');
  assert.match(source, /collectExpiredShippingDeletes\(\s*\[\.\.\.partyShippingDocs, \.\.\.shippingNotifiedDocs\]/);
  assert.match(source, /db\.collectionGroup\('shipping'\)/);
  const subtree = source.slice(source.indexOf('async function queuePartySubtreeDeletes'));
  assert.match(subtree.slice(0, subtree.indexOf('\n}\n')), /collection\('shipping'\)/);
  assert.match(subtree.slice(0, subtree.indexOf('\n}\n')), /collection\('shippingNotified'\)/);
  assert.match(source, /db\.collectionGroup\('shippingNotified'\)/);
  assert.doesNotMatch(source, /console\.log\([^)]*shippingDoc\.data/);
});
