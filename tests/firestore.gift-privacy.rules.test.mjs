/**
 * G25 gift privacy: before the game a gift doc is readable only by its submitter. Once the game is
 * ACTIVE or ENDED, seated players can read the party's gifts (the game board needs them). The host
 * can read a LOBBY gift only after its submitter's seat is gone (remove-participant cleanup).
 * G26: participants/{uid}.hasGift + giftId (lobby pot count) can only be set by the seat's owner,
 * only as a boolean, and only while it points at the owner's real gift in this party.
 * Run with: npm run test:firestore-rules
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { createPartyWithInviteToken } from './helpers/party-invite-batches.mjs';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

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

describe('G26: seat hasGift is tied to a real gift', () => {
  const NEW_GIFT = 'g26-new-gift';
  const OTHER_PARTY = 'g26-other-party';
  const OTHER_PARTY_GIFT = 'g26-gift-other-party';
  const seatRef = (db, uid) => doc(db, 'parties', PARTY, 'participants', uid);
  const now = new Date('2026-11-21T00:00:00Z');

  beforeEach(async () => {
    await seed('LOBBY');
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      // SUBMITTER already has GIFT (seeded) but an older seat with no link; OTHER has no gift yet.
      await setDoc(doc(db, 'parties', OTHER_PARTY), { adminId: HOST, title: 'Other', status: 'LOBBY', participantCount: 1 });
      await setDoc(doc(db, 'parties', OTHER_PARTY, 'participants', OTHER), { status: 'GOING', ready: false });
      await setDoc(doc(db, 'gifts', OTHER_PARTY_GIFT), { ...gift(OTHER), partyId: OTHER_PARTY });
    });
  });

  it('the owner can create a gift and link the seat in one batch', async () => {
    const db = anonDb(OTHER);
    const batch = writeBatch(db);
    batch.set(doc(db, 'gifts', NEW_GIFT), {
      partyId: PARTY, submitterId: OTHER, url: 'https://example.com/x', title: 'X', image: null, price: null,
      isFrozen: false, winnerId: null, createdAt: now, updatedAt: now,
    });
    batch.update(seatRef(db, OTHER), { hasGift: true, giftId: NEW_GIFT, ready: true, updatedAt: now });
    await assertSucceeds(batch.commit());
  });

  it('the owner can link an existing own gift (lobby-load repair of an older seat)', async () => {
    await assertSucceeds(updateDoc(seatRef(anonDb(SUBMITTER), SUBMITTER), { hasGift: true, giftId: GIFT }));
  });

  it('forged: hasGift true with no gift behind it is denied', async () => {
    const db = anonDb(OTHER);
    await assertFails(updateDoc(seatRef(db, OTHER), { hasGift: true, giftId: 'no-such-gift' }));
    await assertFails(updateDoc(seatRef(db, OTHER), { hasGift: true }));
  });

  it('mismatched gift id: someone else\'s gift, or my gift in another party, is denied', async () => {
    const db = anonDb(OTHER);
    await assertFails(updateDoc(seatRef(db, OTHER), { hasGift: true, giftId: GIFT })); // SUBMITTER's gift
    await assertFails(updateDoc(seatRef(db, OTHER), { hasGift: true, giftId: OTHER_PARTY_GIFT }));
  });

  it('non-boolean hasGift is denied', async () => {
    const db = anonDb(SUBMITTER);
    await assertFails(updateDoc(seatRef(db, SUBMITTER), { hasGift: 'true', giftId: GIFT }));
    await assertFails(updateDoc(seatRef(db, SUBMITTER), { hasGift: 1, giftId: GIFT }));
  });

  it('the host cannot set a guest\'s hasGift, even pointing at the guest\'s real gift', async () => {
    await assertFails(updateDoc(seatRef(googleDb(HOST), SUBMITTER), { hasGift: true, giftId: GIFT }));
  });

  it('another player cannot set someone else\'s hasGift', async () => {
    await assertFails(updateDoc(seatRef(anonDb(OTHER), SUBMITTER), { hasGift: true, giftId: GIFT }));
  });

  it('a seat cannot be created already claiming a gift (party create batch, with a passing control)', async () => {
    const db = googleDb(STRANGER);
    const party = { adminId: STRANGER, title: 'New', status: 'LOBBY', config: { maxSteals: 3, returnToStart: false } };
    const seat = { status: 'GOING', turnNumber: null, ready: false };
    await assertFails(createPartyWithInviteToken(db, STRANGER, party, { ...seat, hasGift: true, giftId: GIFT }));
    await assertFails(createPartyWithInviteToken(db, STRANGER, party, { ...seat, hasGift: false }));
    await assertSucceeds(createPartyWithInviteToken(db, STRANGER, party, seat));
  });

  describe('with a linked seat', () => {
    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await updateDoc(doc(context.firestore(), 'parties', PARTY, 'participants', SUBMITTER), {
          hasGift: true,
          giftId: GIFT,
        });
      });
    });

    it('delete clears it: deleting my gift and unlinking the seat in one batch is allowed', async () => {
      const db = anonDb(SUBMITTER);
      const batch = writeBatch(db);
      batch.delete(doc(db, 'gifts', GIFT));
      batch.update(seatRef(db, SUBMITTER), { hasGift: false, giftId: deleteField(), status: 'PENDING' });
      await assertSucceeds(batch.commit());
    });

    it('deleting my gift while the seat still links to it is denied', async () => {
      await assertFails(deleteDoc(doc(anonDb(SUBMITTER), 'gifts', GIFT)));
    });

    it('clearing hasGift while the gift still exists is denied', async () => {
      await assertFails(updateDoc(seatRef(anonDb(SUBMITTER), SUBMITTER), { hasGift: false, giftId: deleteField() }));
    });

    it('undo Ready (ready only) leaves the link and is allowed', async () => {
      const db = anonDb(SUBMITTER);
      await assertSucceeds(updateDoc(seatRef(db, SUBMITTER), { ready: false, updatedAt: now }));
      const snap = await getDoc(seatRef(db, SUBMITTER));
      assert.equal(snap.data().hasGift, true);
      assert.equal(snap.data().giftId, GIFT);
    });

    it('the host cannot delete a seated guest\'s gift; after remove participant (seat gone) it can', async () => {
      await assertFails(deleteDoc(doc(googleDb(HOST), 'gifts', GIFT)));
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await deleteDoc(doc(context.firestore(), 'parties', PARTY, 'participants', SUBMITTER));
      });
      await assertSucceeds(deleteDoc(doc(googleDb(HOST), 'gifts', GIFT)));
    });

    it('the host can still change a guest seat\'s other fields (status) without touching the link', async () => {
      await assertSucceeds(updateDoc(seatRef(googleDb(HOST), SUBMITTER), { status: 'GOING', updatedAt: now }));
    });
  });

  it('an older seat with no link can still delete its gift (Change Gift)', async () => {
    await assertSucceeds(deleteDoc(doc(anonDb(SUBMITTER), 'gifts', GIFT)));
  });
});
