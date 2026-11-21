/**
 * PR 135 v3 UX item 1 (HIGH), port of UX's emulator probe A on the real Firestore emulator with the
 * real rules: a seated anonymous guest updates their own seat (ready true, then the undo, the
 * writes GuestJoinCard sends). With the default listener the guest only ever sees the local pending
 * snapshot. With { includeMetadataChanges: true } (what useParty.js now passes) the server-confirmed
 * snapshot (hasPendingWrites false) follows, and docChanges({ includeMetadataChanges: true }) is
 * non-empty for it, so useParty's "no seat changed" skip does not drop it.
 * Runs inside `npm run test:firestore-rules`.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RULES_PATH = resolve(__dirname, '../firestore.rules');
const PROJECT_ID = 'better-white-elephant-rules-test';
const PARTY_ID = 'meta-party';
const HOST_ID = 'meta-host';
const GUEST_ID = 'meta-guest';

/** @type {import('@firebase/rules-unit-testing').RulesTestEnvironment} */
let testEnv;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function seed() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'parties', PARTY_ID), { adminId: HOST_ID, title: 'Meta', status: 'LOBBY', participantCount: 2 });
    await setDoc(doc(db, 'parties', PARTY_ID, 'participants', HOST_ID), { status: 'GOING', turnNumber: null, ready: false });
    await setDoc(doc(db, 'parties', PARTY_ID, 'participants', GUEST_ID), { status: 'GOING', turnNumber: null, ready: true, displayName: 'Sam' });
  });
}

function guestDb() {
  return testEnv.authenticatedContext(GUEST_ID, { firebase: { sign_in_provider: 'anonymous' } }).firestore();
}

/** Listen to the participants collection and record the guest's seat events. */
function listen(db, options) {
  const events = [];
  const col = collection(db, 'parties', PARTY_ID, 'participants');
  const onNext = (snap) => {
    const changed = snap.docChanges({ includeMetadataChanges: true }).length;
    snap.docs.forEach((d) => {
      if (d.id === GUEST_ID) events.push({ ready: d.data().ready, pending: d.metadata.hasPendingWrites, changed });
    });
  };
  const unsubscribe = options ? onSnapshot(col, options, onNext) : onSnapshot(col, onNext);
  return { events, unsubscribe };
}

before(async () => {
  testEnv = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { rules: readFileSync(RULES_PATH, 'utf8') } });
});

after(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await seed();
});

describe('own seat write: pending, then confirmed', () => {
  it('default listener: the undo only shows up as a pending snapshot, never confirmed (the bug)', async () => {
    const db = guestDb();
    const { events, unsubscribe } = listen(db);
    await sleep(300);
    events.length = 0;
    await updateDoc(doc(db, 'parties', PARTY_ID, 'participants', GUEST_ID), { ready: false, updatedAt: new Date() });
    await sleep(800);
    unsubscribe();
    assert.deepEqual(events.map(({ ready, pending }) => ({ ready, pending })), [{ ready: false, pending: true }]);
  });

  it('includeMetadataChanges: the undo arrives pending, then confirmed with a doc change', async () => {
    const db = guestDb();
    const { events, unsubscribe } = listen(db, { includeMetadataChanges: true });
    await sleep(300);
    events.length = 0;
    await updateDoc(doc(db, 'parties', PARTY_ID, 'participants', GUEST_ID), { ready: false, updatedAt: new Date() });
    await sleep(800);
    unsubscribe();
    assert.deepEqual(events.map(({ ready, pending }) => ({ ready, pending })), [
      { ready: false, pending: true },
      { ready: false, pending: false },
    ]);
    assert.ok(events[1].changed > 0, 'the confirmed snapshot carries a metadata doc change');
  });

  it('includeMetadataChanges: a ready save is confirmed the same way', async () => {
    const db = guestDb();
    await updateDoc(doc(db, 'parties', PARTY_ID, 'participants', GUEST_ID), { ready: false, updatedAt: new Date() });
    const { events, unsubscribe } = listen(db, { includeMetadataChanges: true });
    await sleep(300);
    events.length = 0;
    await updateDoc(doc(db, 'parties', PARTY_ID, 'participants', GUEST_ID), { ready: true, updatedAt: new Date() });
    await sleep(800);
    unsubscribe();
    assert.deepEqual(events.at(-1), { ready: true, pending: false, changed: events.at(-1).changed });
    assert.ok(events.some((e) => e.pending === true), 'saw the local pending snapshot first');
  });
});
