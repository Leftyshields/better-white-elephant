/**
 * A0 per-game shipping address: parties/{partyId}/shipping/{uid} is closed to every client.
 * The owner, the giver, the host, other players and outsiders can't get, list, create, update or
 * delete it. Only the game server (Admin SDK) touches it.
 * The shippingNotified email markers next to it are closed the same way (Functions only).
 * Run with: npm run test:firestore-rules
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, beforeEach, describe, it } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ID = 'better-white-elephant-rules-test';

const PARTY = 'a0-party';
const HOST = 'a0-host';
const WINNER = 'a0-winner';
const GIVER = 'a0-giver';
const OTHER = 'a0-other';
const STRANGER = 'a0-stranger';
const MARKER = `${WINNER}_${GIVER}`;
const ADDRESS = { name: 'Win Ner', street: '1 Main St', city: 'Town', state: 'OR', zip: '97201', country: 'US' };

let testEnv;
const googleDb = (uid) =>
  testEnv.authenticatedContext(uid, { firebase: { sign_in_provider: 'google.com' } }).firestore();
const anonDb = (uid) =>
  testEnv.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore();

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
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'parties', PARTY), {
      adminId: HOST,
      status: 'ENDED',
      endedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    for (const uid of [HOST, WINNER, GIVER, OTHER]) {
      await setDoc(doc(db, 'parties', PARTY, 'participants', uid), { status: 'GOING' });
    }
    await setDoc(doc(db, 'parties', PARTY, 'shipping', WINNER), { ...ADDRESS, savedAt: new Date() });
    await setDoc(doc(db, 'parties', PARTY, 'shippingNotified', MARKER), { notifiedAt: new Date() });
  });
});

const callers = () => [
  ['owner (winner)', googleDb(WINNER)],
  ['owner as anonymous guest', anonDb(WINNER)],
  ['giver', googleDb(GIVER)],
  ['host', googleDb(HOST)],
  ['other player', googleDb(OTHER)],
  ['outsider', googleDb(STRANGER)],
  ['signed out', testEnv.unauthenticatedContext().firestore()],
];

describe('parties/{partyId}/shipping/{uid}: deny all client reads', () => {
  it('nobody can get the doc, including its owner', async () => {
    for (const [label, db] of callers()) {
      await assertFails(getDoc(doc(db, 'parties', PARTY, 'shipping', WINNER)), label);
    }
  });

  it('nobody can list the subcollection or run a collection group query on shipping', async () => {
    for (const [label, db] of callers()) {
      await assertFails(getDocs(collection(db, 'parties', PARTY, 'shipping')), label);
      await assertFails(getDocs(collectionGroup(db, 'shipping')), label);
    }
  });
});

describe('parties/{partyId}/shipping/{uid}: deny all client writes', () => {
  it('owner cannot create, update or delete their own doc directly', async () => {
    const db = googleDb(OTHER);
    await assertFails(setDoc(doc(db, 'parties', PARTY, 'shipping', OTHER), { ...ADDRESS, savedAt: new Date() }));
    const winner = googleDb(WINNER);
    await assertFails(updateDoc(doc(winner, 'parties', PARTY, 'shipping', WINNER), { street: '2 Main St' }));
    await assertFails(deleteDoc(doc(winner, 'parties', PARTY, 'shipping', WINNER)));
  });

  it('giver, host, other player and outsider cannot write anyone\'s doc', async () => {
    for (const [label, db] of callers()) {
      await assertFails(
        setDoc(doc(db, 'parties', PARTY, 'shipping', WINNER), { ...ADDRESS, street: '9 Evil Way' }),
        label,
      );
      await assertFails(deleteDoc(doc(db, 'parties', PARTY, 'shipping', WINNER)), label);
    }
  });
});

describe('parties/{partyId}/shippingNotified/{markerId}: deny all client access', () => {
  it('nobody can get, list or collection-group query the markers', async () => {
    for (const [label, db] of callers()) {
      await assertFails(getDoc(doc(db, 'parties', PARTY, 'shippingNotified', MARKER)), label);
      await assertFails(getDocs(collection(db, 'parties', PARTY, 'shippingNotified')), label);
      await assertFails(getDocs(collectionGroup(db, 'shippingNotified')), label);
    }
  });

  it('nobody can create, update or delete a marker (so no one can suppress or re-arm an email)', async () => {
    for (const [label, db] of callers()) {
      await assertFails(setDoc(doc(db, 'parties', PARTY, 'shippingNotified', `${OTHER}_${GIVER}`), { notifiedAt: new Date() }), label);
      await assertFails(updateDoc(doc(db, 'parties', PARTY, 'shippingNotified', MARKER), { notifiedAt: new Date() }), label);
      await assertFails(deleteDoc(doc(db, 'parties', PARTY, 'shippingNotified', MARKER)), label);
    }
  });
});
