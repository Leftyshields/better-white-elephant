/**
 * G28: the removed-guest marker (parties/{partyId}/removedSeats/{uid}) and the server-only
 * hostRosterLabel. The marker can only ride along with a real host removal, only the removed
 * guest can read it, and clients can never write hostRosterLabel.
 * Run with: npm run test:firestore-rules
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  createPartyWithInviteToken,
  joinPartyWithInviteToken,
  removeParticipantSeat,
} from './helpers/party-invite-batches.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ID = 'better-white-elephant-rules-test';
const PARTY = 'g28-party';
const HOST = 'g28-host';
const GUEST = 'g28-guest';
const OTHER = 'g28-other';
const STRANGER = 'g28-stranger';
const TOKEN = 'aaaaaaaaaaaaaaaabbbbbbbbbbbbbbbb';
const SEAT = { status: 'GOING', turnNumber: null, ready: false };
const MARKER = `parties/${PARTY}/removedSeats/${GUEST}`;

let testEnv;

const dbAs = (uid, provider) =>
  testEnv.authenticatedContext(uid, { firebase: { sign_in_provider: provider } }).firestore();
const googleDb = (uid) => dbAs(uid, 'google.com');
const anonDb = (uid) => dbAs(uid, 'anonymous');

async function withAdmin(fn) {
  let out;
  await testEnv.withSecurityRulesDisabled(async (context) => {
    out = await fn(context.firestore());
  });
  return out;
}

const exists = (path) => withAdmin(async (db) => (await getDoc(doc(db, path))).exists());

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
  await withAdmin(async (db) => {
    await setDoc(doc(db, `parties/${PARTY}`), {
      adminId: HOST,
      title: 'G28 Party',
      status: 'LOBBY',
      participantCount: 3,
      config: { maxSteals: 3, returnToStart: false },
    });
    await setDoc(doc(db, `parties/${PARTY}/participants/${HOST}`), SEAT);
    await setDoc(doc(db, `parties/${PARTY}/participants/${GUEST}`), SEAT);
    await setDoc(doc(db, `parties/${PARTY}/participants/${OTHER}`), SEAT);
    await setDoc(doc(db, `parties/${PARTY}/private/invite`), { token: TOKEN });
  });
});

const party = { id: PARTY, participantCount: 3 };

describe('G28 removal marker: written only with a real host removal', () => {
  it('the host removing a guest writes the seat delete, the marker and the count in one batch', async () => {
    await assertSucceeds(removeParticipantSeat(googleDb(HOST), party, GUEST));
    assert.equal(await exists(`parties/${PARTY}/participants/${GUEST}`), false);
    assert.equal(await exists(MARKER), true);
  });

  it('the host cannot mark a guest who is still seated (no seat delete in the batch)', async () => {
    await assertFails(setDoc(doc(googleDb(HOST), MARKER), { removedAt: serverTimestamp() }));
    assert.equal(await exists(MARKER), false);
  });

  it('the host cannot mark someone who never had a seat', async () => {
    await assertFails(
      setDoc(doc(googleDb(HOST), `parties/${PARTY}/removedSeats/${STRANGER}`), { removedAt: serverTimestamp() }),
    );
  });

  it('the host cannot mark themselves', async () => {
    const db = googleDb(HOST);
    const batch = writeBatch(db);
    batch.delete(doc(db, `parties/${PARTY}/participants/${HOST}`));
    batch.set(doc(db, `parties/${PARTY}/removedSeats/${HOST}`), { removedAt: serverTimestamp() });
    batch.update(doc(db, `parties/${PARTY}`), { participantCount: increment(-1) });
    await assertFails(batch.commit());
  });

  it('a guest cannot remove another guest or forge a marker', async () => {
    await assertFails(removeParticipantSeat(anonDb(OTHER), party, GUEST));
    await assertFails(removeParticipantSeat(googleDb(OTHER), party, GUEST));
    await assertFails(setDoc(doc(anonDb(OTHER), MARKER), { removedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(anonDb(GUEST), MARKER), { removedAt: serverTimestamp() }));
    assert.equal(await exists(MARKER), false);
  });

  it('the marker holds only a server-time removedAt', async () => {
    const tryMarker = async (data) => {
      const db = googleDb(HOST);
      const batch = writeBatch(db);
      batch.delete(doc(db, `parties/${PARTY}/participants/${GUEST}`));
      batch.set(doc(db, MARKER), data);
      batch.update(doc(db, `parties/${PARTY}`), { participantCount: increment(-1) });
      return batch.commit();
    };
    await assertFails(tryMarker({ removedAt: new Date(0) }));
    await assertFails(tryMarker({ removedAt: serverTimestamp(), name: 'Brian S.' }));
    await assertSucceeds(tryMarker({ removedAt: serverTimestamp() }));
  });

  it('a re-invited guest can be removed again', async () => {
    await assertSucceeds(removeParticipantSeat(googleDb(HOST), party, GUEST));
    await assertSucceeds(joinPartyWithInviteToken(anonDb(GUEST), PARTY, GUEST, TOKEN, SEAT));
    await assertSucceeds(removeParticipantSeat(googleDb(HOST), { id: PARTY, participantCount: 3 }, GUEST));
  });
});

describe('G28 removal marker: only the removed guest can read it', () => {
  beforeEach(async () => {
    await assertSucceeds(removeParticipantSeat(googleDb(HOST), party, GUEST));
  });

  it('the removed guest can read their own marker', async () => {
    const snap = await assertSucceeds(getDoc(doc(anonDb(GUEST), MARKER)));
    assert.equal(snap.exists(), true);
  });

  it('nobody else can read it: not the host, another guest, a stranger or a signed-out visitor', async () => {
    await assertFails(getDoc(doc(googleDb(HOST), MARKER)));
    await assertFails(getDoc(doc(anonDb(OTHER), MARKER)));
    await assertFails(getDoc(doc(anonDb(STRANGER), MARKER)));
    await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), MARKER)));
  });

  it('nobody can list markers, including the host', async () => {
    await assertFails(getDocs(collection(googleDb(HOST), `parties/${PARTY}/removedSeats`)));
    await assertFails(getDocs(collection(anonDb(GUEST), `parties/${PARTY}/removedSeats`)));
  });

  it('a stranger reading their own (absent) marker learns only that they were not removed', async () => {
    const snap = await assertSucceeds(getDoc(doc(anonDb(STRANGER), `parties/${PARTY}/removedSeats/${STRANGER}`)));
    assert.equal(snap.exists(), false);
  });

  it('no client can delete a marker', async () => {
    await assertFails(deleteDoc(doc(anonDb(GUEST), MARKER)));
    await assertFails(deleteDoc(doc(googleDb(HOST), MARKER)));
  });
});

describe('G28 hostRosterLabel is server-only', () => {
  const payload = { adminId: HOST, title: 'Label Party', status: 'LOBBY', config: { maxSteals: 3, returnToStart: false } };

  it('a host cannot create a party with hostRosterLabel', async () => {
    await assertSucceeds(createPartyWithInviteToken(googleDb(HOST), HOST, payload, SEAT));
    await assertFails(
      createPartyWithInviteToken(googleDb(HOST), HOST, { ...payload, hostRosterLabel: 'Brian S.' }, SEAT),
    );
  });

  it('a host or guest cannot set hostRosterLabel on an existing party', async () => {
    await assertFails(updateDoc(doc(googleDb(HOST), `parties/${PARTY}`), { hostRosterLabel: 'Brian S.' }));
    await assertFails(updateDoc(doc(anonDb(GUEST), `parties/${PARTY}`), { hostRosterLabel: 'Brian S.' }));
  });
});
