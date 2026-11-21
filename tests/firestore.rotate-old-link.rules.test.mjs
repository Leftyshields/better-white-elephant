/**
 * G23: the host's "Make a new code and link" (POST /api/party-code/rotate -> issuePartyCode with
 * rotate) must stop the OLD invite link as well as the old code. Runs the real server rotate
 * (Admin SDK) and the real client join batch against the real firestore.rules on the emulator.
 * Run with: npm run test:firestore-rules
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { issuePartyCode, resolvePartyCodeAndSeat } from '../server/lib/party-code.js';
import { joinPartyWithInviteToken } from './helpers/party-invite-batches.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ID = 'better-white-elephant-rules-test';
const PARTY = 'g23-party';
const HOST = 'g23-host';
const SEAT = { status: 'GOING', turnNumber: null, ready: false };

let testEnv;
let adminApp;
let adminDb;

const anonDb = (uid) =>
  testEnv.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore();

async function seatExists(uid) {
  return (await adminDb.doc(`parties/${PARTY}/participants/${uid}`).get()).exists;
}

async function count() {
  return (await adminDb.doc(`parties/${PARTY}`).get()).data().participantCount;
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8') },
  });
  adminApp = initializeApp({ projectId: PROJECT_ID }, 'g23-rotate');
  adminDb = getFirestore(adminApp);
});

after(async () => {
  await deleteApp(adminApp);
  await testEnv.cleanup();
});

// Home.jsx creates the party with a client-made token; the share box later adds the code and keeps
// that token, so the link a host copies before rotating carries this token.
const CLIENT_TOKEN = 'aaaaaaaaaaaaaaaabbbbbbbbbbbbbbbb';

beforeEach(async () => {
  await testEnv.clearFirestore();
  await adminDb.doc(`parties/${PARTY}`).set({ adminId: HOST, status: 'LOBBY', participantCount: 1 });
  await adminDb.doc(`parties/${PARTY}/participants/${HOST}`).set({ status: 'GOING', ready: false });
  await adminDb.doc(`parties/${PARTY}/private/invite`).set({ token: CLIENT_TOKEN, updatedAt: new Date() });
});

async function shareThenRotate() {
  const shared = await issuePartyCode(adminDb, PARTY);
  assert.equal(shared.ok, true);
  assert.equal(shared.token, CLIENT_TOKEN, 'share keeps the existing link token');
  const rotated = await issuePartyCode(adminDb, PARTY, { rotate: true });
  assert.equal(rotated.ok, true);
  assert.notEqual(rotated.token, CLIENT_TOKEN);
  assert.notEqual(rotated.code, shared.code);
  return { oldCode: shared.code, newToken: rotated.token };
}

describe('G23: "Make a new code and link" stops the old link', () => {
  it('a new guest on the old link is refused, with no seat, no join proof and no count bump', async () => {
    const { oldCode } = await shareThenRotate();

    await assertFails(joinPartyWithInviteToken(anonDb('late-old'), PARTY, 'late-old', CLIENT_TOKEN, SEAT));
    assert.equal(await seatExists('late-old'), false);
    assert.equal((await adminDb.doc(`parties/${PARTY}/joinProofs/late-old`).get()).exists, false);
    assert.equal(await count(), 1);

    // Same outcome as the old code on the server path.
    assert.deepEqual(
      await resolvePartyCodeAndSeat(adminDb, { uid: 'late-code', ipHash: 'ip', rawCode: oldCode }),
      { result: 'failed' },
    );
    assert.equal(await seatExists('late-code'), false);
  });

  it('a new guest on the new link is seated', async () => {
    const { newToken } = await shareThenRotate();
    await assertSucceeds(joinPartyWithInviteToken(anonDb('late-new'), PARTY, 'late-new', newToken, SEAT));
    assert.equal(await seatExists('late-new'), true);
    assert.equal(await count(), 2);
  });

  it('a guest seated before the rotate keeps their seat; reopening the old link adds nothing', async () => {
    await assertSucceeds(joinPartyWithInviteToken(anonDb('early'), PARTY, 'early', CLIENT_TOKEN, SEAT));
    await shareThenRotate();
    assert.equal(await seatExists('early'), true);
    await assertFails(joinPartyWithInviteToken(anonDb('early'), PARTY, 'early', CLIENT_TOKEN, SEAT));
    assert.equal(await count(), 2);
  });
});
