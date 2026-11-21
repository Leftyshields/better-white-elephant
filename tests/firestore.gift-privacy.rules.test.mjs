/**
 * G25 gift privacy: before the game a gift doc is readable only by its submitter. Once the game is
 * ACTIVE or ENDED, seated players can read the party's gifts (the game board needs them). The host
 * can read a LOBBY gift only after its submitter's seat is gone (remove-participant cleanup).
 * Run with: npm run test:firestore-rules
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, limit, query, setDoc, where } from 'firebase/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ID = 'better-white-elephant-rules-test';

const PARTY = 'g25-party';
const HOST = 'g25-host';
const SUBMITTER = 'g25-submitter';
const OTHER = 'g25-other-player';
const STRANGER = 'g25-stranger';
const ANON = 'g25-anon-visitor';
const GIFT = 'g25-gift';
const HOST_GIFT = 'g25-host-gift';

let testEnv;

const googleDb = (uid) =>
  testEnv.authenticatedContext(uid, { firebase: { sign_in_provider: 'google.com' } }).firestore();
const anonDb = (uid) =>
  testEnv.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore();

const gift = (submitterId) => ({
  partyId: PARTY,
  submitterId,
  url: 'https://example.com/secret-gift',
  title: 'Secret gift',
  image: null,
  price: '25',
  isFrozen: false,
  winnerId: null,
  createdAt: new Date('2026-11-01T00:00:00Z'),
  updatedAt: new Date('2026-11-01T00:00:00Z'),
});

async function seed(status) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'parties', PARTY), { adminId: HOST, title: 'G25', status, participantCount: 3 });
    for (const uid of [HOST, SUBMITTER, OTHER]) {
      await setDoc(doc(db, 'parties', PARTY, 'participants', uid), { status: 'GOING', ready: true });
    }
    await setDoc(doc(db, 'gifts', GIFT), gift(SUBMITTER));
    await setDoc(doc(db, 'gifts', HOST_GIFT), gift(HOST));
  });
}

const partyGifts = (db) => getDocs(query(collection(db, 'gifts'), where('partyId', '==', PARTY)));
const giftsOf = (db, uid) =>
  getDocs(query(collection(db, 'gifts'), where('partyId', '==', PARTY), where('submitterId', '==', uid), limit(1)));
// The exact query PartyLobby / PartyManagement run after removing a seat.
const removedSeatGifts = (db, uid) =>
  getDocs(query(collection(db, 'gifts'), where('partyId', '==', PARTY), where('submitterId', '==', uid)));

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8') },
  });
});

after(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

describe('G25: LOBBY gifts are private to their submitter', () => {
  beforeEach(() => seed('LOBBY'));

  it('a signed-in stranger cannot get a gift or list the party gifts', async () => {
    await assertFails(getDoc(doc(googleDb(STRANGER), 'gifts', GIFT)));
    await assertFails(partyGifts(googleDb(STRANGER)));
  });

  it('a fresh anonymous account (no seat) cannot get a gift or list the party gifts', async () => {
    await assertFails(getDoc(doc(anonDb(ANON), 'gifts', GIFT)));
    await assertFails(partyGifts(anonDb(ANON)));
    await assertFails(giftsOf(anonDb(ANON), SUBMITTER));
  });

  it('another seated player cannot get, list, or query someone else\'s gift', async () => {
    await assertFails(getDoc(doc(anonDb(OTHER), 'gifts', GIFT)));
    await assertFails(partyGifts(anonDb(OTHER)));
    await assertFails(giftsOf(anonDb(OTHER), SUBMITTER));
  });

  it('the host cannot get, list, or query a seated guest\'s gift', async () => {
    await assertFails(getDoc(doc(googleDb(HOST), 'gifts', GIFT)));
    await assertFails(partyGifts(googleDb(HOST)));
    await assertFails(giftsOf(googleDb(HOST), SUBMITTER));
    await assertFails(removedSeatGifts(googleDb(HOST), SUBMITTER));
  });

  it('the submitter can get their gift and run the own-gift query (PR 136 shape)', async () => {
    const snap = await assertSucceeds(getDoc(doc(anonDb(SUBMITTER), 'gifts', GIFT)));
    assert.equal(snap.data().title, 'Secret gift');
    const own = await assertSucceeds(giftsOf(anonDb(SUBMITTER), SUBMITTER));
    assert.deepEqual(own.docs.map((d) => d.id), [GIFT]);
    // The host's own gift too.
    await assertSucceeds(getDoc(doc(googleDb(HOST), 'gifts', HOST_GIFT)));
    await assertSucceeds(giftsOf(googleDb(HOST), HOST));
  });

  it('remove participant: once the seat is gone the host can find and delete the orphan gift', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await deleteDoc(doc(context.firestore(), 'parties', PARTY, 'participants', SUBMITTER));
    });
    const orphan = await assertSucceeds(removedSeatGifts(googleDb(HOST), SUBMITTER));
    assert.equal(orphan.size, 1);
    await assertSucceeds(deleteDoc(doc(googleDb(HOST), 'gifts', GIFT)));
  });

  it('the orphan exception is host-only: another player still cannot read it', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await deleteDoc(doc(context.firestore(), 'parties', PARTY, 'participants', SUBMITTER));
    });
    await assertFails(removedSeatGifts(anonDb(OTHER), SUBMITTER));
    await assertFails(getDoc(doc(anonDb(OTHER), 'gifts', GIFT)));
  });
});

for (const status of ['ACTIVE', 'ENDED']) {
  describe(`G25: ${status} gifts are readable by seated players only`, () => {
    beforeEach(() => seed(status));

    it('a seated player can list the party gifts and get one (game board)', async () => {
      const all = await assertSucceeds(partyGifts(anonDb(OTHER)));
      assert.equal(all.size, 2);
      await assertSucceeds(getDoc(doc(anonDb(OTHER), 'gifts', GIFT)));
      await assertSucceeds(partyGifts(googleDb(HOST)));
    });

    it('a stranger and an anonymous non-participant are still refused', async () => {
      await assertFails(partyGifts(googleDb(STRANGER)));
      await assertFails(getDoc(doc(anonDb(ANON), 'gifts', GIFT)));
    });
  });
}

describe('G25: CANCELLED gifts stay private', () => {
  beforeEach(() => seed('CANCELLED'));

  it('another player and the host are refused; the submitter can still read their own', async () => {
    await assertFails(partyGifts(anonDb(OTHER)));
    await assertFails(getDoc(doc(googleDb(HOST), 'gifts', GIFT)));
    await assertSucceeds(getDoc(doc(anonDb(SUBMITTER), 'gifts', GIFT)));
  });
});
