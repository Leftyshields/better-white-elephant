/**
 * Item 2 + 10: party-code index and guess counters are Admin-only, the code on the invite record
 * stays host-only, and an anonymous guest seated by the server can do the one-screen writes
 * (name, gift, ready) with no new client permissions.
 * Run with: npm run test:firestore-rules
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, beforeEach, describe, it } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RULES_PATH = resolve(__dirname, '../firestore.rules');
const PROJECT_ID = 'better-white-elephant-rules-test';

const HOST_ID = 'code-host';
const GUEST_ID = 'code-guest';
const OUTSIDER_ID = 'code-outsider';
const PARTY_ID = 'code-party';
const CODE = 'KX7P4MRB';
const TOKEN = 'aaaaaaaaaaaaaaaabbbbbbbbbbbbbbbb';

/** @type {import('@firebase/rules-unit-testing').RulesTestEnvironment} */
let testEnv;

const dbAs = (uid, provider) =>
  testEnv.authenticatedContext(uid, { firebase: { sign_in_provider: provider } }).firestore();
const anonDb = (uid) => dbAs(uid, 'anonymous');
const googleDb = (uid) => dbAs(uid, 'google.com');
const signedOutDb = () => testEnv.unauthenticatedContext().firestore();

const COUNTER_PATHS = [
  ['_rateLimits', 'partyCodeUids', 'records', GUEST_ID],
  ['_rateLimits', 'partyCodeIps', 'records', 'abcdef0123456789'],
  ['_rateLimits', 'partyCodeBreaker'],
];

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(RULES_PATH, 'utf8') },
  });
});

after(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'parties', PARTY_ID), {
      adminId: HOST_ID,
      title: 'Code Party',
      status: 'LOBBY',
      participantCount: 2,
      config: { maxSteals: 3 },
    });
    await setDoc(doc(db, 'parties', PARTY_ID, 'participants', HOST_ID), { status: 'GOING', ready: false });
    // Seat written by the server route (Admin SDK), exactly as server/lib/party-code.js writes it.
    await setDoc(doc(db, 'parties', PARTY_ID, 'participants', GUEST_ID), {
      status: 'GOING',
      turnNumber: null,
      ready: false,
      joinedAt: new Date(),
      updatedAt: new Date(),
    });
    await setDoc(doc(db, 'parties', PARTY_ID, 'private', 'invite'), { token: TOKEN, code: CODE, updatedAt: new Date() });
    await setDoc(doc(db, 'partyCodes', CODE), { partyId: PARTY_ID, createdAt: Date.now() });
    for (const path of COUNTER_PATHS) await setDoc(doc(db, ...path), { windowStart: Date.now(), failures: 1 });
  });
});

describe('partyCodes index (Admin only)', () => {
  const callers = () => [
    ['signed out', signedOutDb()],
    ['anonymous guest', anonDb(GUEST_ID)],
    ['anonymous outsider', anonDb(OUTSIDER_ID)],
    ['Google host', googleDb(HOST_ID)],
  ];

  it('denies get and list to every client', async () => {
    for (const [, db] of callers()) {
      await assertFails(getDoc(doc(db, 'partyCodes', CODE)));
      await assertFails(getDocs(collection(db, 'partyCodes')));
    }
  });

  it('denies create, overwrite and delete to every client', async () => {
    for (const [, db] of callers()) {
      await assertFails(setDoc(doc(db, 'partyCodes', 'ZZZZZZZZ'), { partyId: PARTY_ID, createdAt: Date.now() }));
      await assertFails(setDoc(doc(db, 'partyCodes', CODE), { partyId: 'hijack', createdAt: Date.now() }));
      await assertFails(deleteDoc(doc(db, 'partyCodes', CODE)));
    }
  });
});

describe('party-code guess counters in _rateLimits (Admin only)', () => {
  it('deny read and write, including to the uid the counter is about', async () => {
    for (const db of [signedOutDb(), anonDb(GUEST_ID), googleDb(HOST_ID)]) {
      for (const path of COUNTER_PATHS) {
        await assertFails(getDoc(doc(db, ...path)));
        await assertFails(setDoc(doc(db, ...path), { windowStart: 0, failures: 0 }));
        await assertFails(deleteDoc(doc(db, ...path)));
      }
    }
  });
});

describe('invite record with a code stays host-only', () => {
  it('Google host can read the code; seated anonymous guest and outsiders cannot', async () => {
    await assertSucceeds(getDoc(doc(googleDb(HOST_ID), 'parties', PARTY_ID, 'private', 'invite')));
    await assertFails(getDoc(doc(anonDb(GUEST_ID), 'parties', PARTY_ID, 'private', 'invite')));
    await assertFails(getDoc(doc(anonDb(OUTSIDER_ID), 'parties', PARTY_ID, 'private', 'invite')));
    await assertFails(getDoc(doc(signedOutDb(), 'parties', PARTY_ID, 'private', 'invite')));
  });

  it('host on a non-Google provider cannot read it, and no client can write a code onto it', async () => {
    await assertFails(getDoc(doc(anonDb(HOST_ID), 'parties', PARTY_ID, 'private', 'invite')));
    await assertFails(
      setDoc(doc(googleDb(HOST_ID), 'parties', PARTY_ID, 'private', 'invite'), { token: TOKEN, code: 'ZZZZZZZZ', updatedAt: new Date() }),
    );
  });
});

describe('anonymous guest one-screen writes (no new permissions)', () => {
  it('seated anonymous guest can save a name, add a gift, and mark ready', async () => {
    const db = anonDb(GUEST_ID);
    await assertSucceeds(
      updateDoc(doc(db, 'parties', PARTY_ID, 'participants', GUEST_ID), { displayName: 'Sam', lastInitial: 'R', updatedAt: new Date() }),
    );
    await assertSucceeds(
      addDoc(collection(db, 'gifts'), {
        partyId: PARTY_ID,
        submitterId: GUEST_ID,
        url: 'https://example.com/kettle',
        title: 'Pour-over Kettle',
        image: null,
        price: null,
        isFrozen: false,
        winnerId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
    await assertSucceeds(updateDoc(doc(db, 'parties', PARTY_ID, 'participants', GUEST_ID), { ready: true, updatedAt: new Date() }));
  });

  it('guest still cannot pick an email-shaped seat name or rename someone else', async () => {
    const db = anonDb(GUEST_ID);
    await assertFails(updateDoc(doc(db, 'parties', PARTY_ID, 'participants', GUEST_ID), { displayName: 'sam@example.com' }));
    await assertFails(updateDoc(doc(db, 'parties', PARTY_ID, 'participants', HOST_ID), { displayName: 'Hacked' }));
  });

  it('an unseated anonymous user still cannot seat themselves without the invite token', async () => {
    const db = anonDb(OUTSIDER_ID);
    const batch = writeBatch(db);
    batch.set(doc(db, 'parties', PARTY_ID, 'participants', OUTSIDER_ID), { status: 'GOING', turnNumber: null, ready: false });
    batch.update(doc(db, 'parties', PARTY_ID), { participantCount: increment(1) });
    await assertFails(batch.commit());
  });

  it('anonymous users still cannot create a party', async () => {
    const db = anonDb(GUEST_ID);
    await assertFails(setDoc(doc(db, 'parties', 'anon-party'), { adminId: GUEST_ID, status: 'LOBBY', participantCount: 1 }));
  });
});
