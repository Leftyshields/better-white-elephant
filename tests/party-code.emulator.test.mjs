/**
 * Item 10 on the real Firestore emulator (Admin SDK, as the game server runs it): the resolve + seat
 * transaction, the unique code index, LOBBY-only, the 30-seat cap under concurrent joins, and the
 * per-uid lockout. Runs inside `npm run test:firestore-rules` (firebase emulators:exec sets
 * FIRESTORE_EMULATOR_HOST).
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  PARTY_CODE_LIMITS,
  issuePartyCode,
  resolvePartyCodeAndSeat,
} from '../server/lib/party-code.js';

const PROJECT_ID = 'better-white-elephant-rules-test';
const PARTY = 'emu-code-party';
const TOKEN = 'aaaaaaaaaaaaaaaabbbbbbbbbbbbbbbb';

let app;
let db;

async function clear() {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  await fetch(`http://${host}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: 'DELETE' });
}

async function seed({ status = 'LOBBY', participantCount = 1 } = {}) {
  await db.doc(`parties/${PARTY}`).set({ adminId: 'host', status, participantCount });
  await db.doc(`parties/${PARTY}/private/invite`).set({ token: TOKEN });
  const issued = await issuePartyCode(db, PARTY);
  assert.equal(issued.ok, true);
  return issued.code;
}

before(() => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'run under firebase emulators:exec');
  app = initializeApp({ projectId: PROJECT_ID }, 'party-code-emulator');
  db = getFirestore(app);
});

after(async () => {
  await deleteApp(app);
});

beforeEach(clear);

describe('party code on the emulator', () => {
  it('issues a code with an index doc and seats an anonymous guest in one transaction', async () => {
    const code = await seed();
    assert.deepEqual((await db.doc(`partyCodes/${code}`).get()).data().partyId, PARTY);
    const display = `${code.slice(0, 4)}-${code.slice(4).toLowerCase()}`;
    const out = await resolvePartyCodeAndSeat(db, { uid: 'anon-1', ipHash: 'ip-1', rawCode: display });
    assert.deepEqual(out, { result: 'seated', partyId: PARTY });
    assert.equal((await db.doc(`parties/${PARTY}`).get()).data().participantCount, 2);
    assert.equal((await db.doc(`parties/${PARTY}/participants/anon-1`).get()).data().status, 'GOING');
  });

  it('skips a candidate whose index doc already exists', async () => {
    await db.doc('partyCodes/AAAAAAAA').set({ partyId: 'other', createdAt: Date.now() });
    await db.doc(`parties/${PARTY}`).set({ adminId: 'host', status: 'LOBBY', participantCount: 1 });
    const seq = [...Array(8).fill(8), ...Array(8).fill(9)];
    const out = await issuePartyCode(db, PARTY, { pick: () => seq.shift() });
    assert.equal(out.code, 'BBBBBBBB');
    assert.equal((await db.doc('partyCodes/AAAAAAAA').get()).data().partyId, 'other');
  });

  it('rejects a non-LOBBY party with the generic failure and writes no seat', async () => {
    const code = await seed();
    await db.doc(`parties/${PARTY}`).update({ status: 'ACTIVE' });
    assert.deepEqual(await resolvePartyCodeAndSeat(db, { uid: 'anon-2', ipHash: 'ip-2', rawCode: code }), { result: 'failed' });
    assert.equal((await db.doc(`parties/${PARTY}/participants/anon-2`).get()).exists, false);
  });

  it('two concurrent joins for the last seat: exactly one is seated, the other is full', async () => {
    const code = await seed({ participantCount: 29 });
    const results = await Promise.all([
      resolvePartyCodeAndSeat(db, { uid: 'race-a', ipHash: 'ip-a', rawCode: code }),
      resolvePartyCodeAndSeat(db, { uid: 'race-b', ipHash: 'ip-b', rawCode: code }),
    ]);
    assert.deepEqual(results.map((r) => r.result).sort(), ['full', 'seated']);
    assert.equal((await db.doc(`parties/${PARTY}`).get()).data().participantCount, 30);
  });

  it('locks a uid out after 5 wrong codes, even for the right code', async () => {
    const code = await seed();
    for (let i = 0; i < PARTY_CODE_LIMITS.perUid; i += 1) {
      await resolvePartyCodeAndSeat(db, { uid: 'guesser', ipHash: `ip-${i}`, rawCode: 'ZZZZZZZZ' });
    }
    assert.deepEqual(await resolvePartyCodeAndSeat(db, { uid: 'guesser', ipHash: 'ip-new', rawCode: code }), { result: 'failed' });
    assert.equal((await db.doc('_rateLimits/partyCodeUids/records/guesser').get()).data().failures, PARTY_CODE_LIMITS.perUid);
  });
});
