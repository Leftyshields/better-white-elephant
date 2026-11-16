/**
 * Item 1: Google host gate, invite-token joins (LOBBY only, 30-seat cap) and the host-only token doc.
 * Write batches mirror client/src/utils/partyInvite.js (see tests/helpers/party-invite-batches.mjs)
 * so the rules are tested against the same documents the app sends.
 * Run with: npm run test:firestore-rules
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, beforeEach, describe, it } from 'node:test';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  deleteDoc,
  doc,
  getDoc,
  increment,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  createPartyWithInviteToken,
  joinPartyWithInviteToken,
  removeParticipantSeat,
  rotateInviteToken,
} from './helpers/party-invite-batches.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RULES_PATH = resolve(__dirname, '../firestore.rules');
const PROJECT_ID = 'better-white-elephant-rules-test';

const HOST_ID = 'item1-host';
const GUEST_ID = 'item1-guest';
const PARTY_ID = 'item1-party';
const TOKEN = 'aaaaaaaaaaaaaaaabbbbbbbbbbbbbbbb';
const WRONG_TOKEN = 'ccccccccccccccccdddddddddddddddd';
const NON_GOOGLE_PROVIDERS = ['anonymous', 'password', 'emailLink', 'custom'];

const SEAT = { status: 'GOING', turnNumber: null, ready: false };

/** @type {import('@firebase/rules-unit-testing').RulesTestEnvironment} */
let testEnv;

function dbAs(uid, provider) {
  const claims = provider ? { firebase: { sign_in_provider: provider } } : {};
  return testEnv.authenticatedContext(uid, claims).firestore();
}

const googleDb = (uid) => dbAs(uid, 'google.com');

async function seed(writes) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const [path, data] of Object.entries(writes)) {
      await setDoc(doc(db, path), data);
    }
  });
}

async function seedParty({ adminId = HOST_ID, status = 'LOBBY', participantCount = 1 } = {}) {
  await seed({
    [`parties/${PARTY_ID}`]: {
      adminId,
      title: 'Item 1 Party',
      status,
      participantCount,
      config: { maxSteals: 3, returnToStart: false },
    },
    [`parties/${PARTY_ID}/participants/${adminId}`]: { status: 'PENDING', ready: false },
    [`parties/${PARTY_ID}/private/invite`]: { token: TOKEN },
  });
}

async function readCount() {
  let count;
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const snap = await getDoc(doc(context.firestore(), 'parties', PARTY_ID));
    count = snap.data().participantCount;
  });
  return count;
}

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
});

describe('google.com host gate', () => {
  const partyPayload = (uid) => ({
    adminId: uid,
    title: 'Gate Party',
    status: 'LOBBY',
    config: { maxSteals: 3, returnToStart: false },
  });

  it('Google user can create a party (party + seat + token batch)', async () => {
    await assertSucceeds(
      createPartyWithInviteToken(googleDb(HOST_ID), HOST_ID, partyPayload(HOST_ID), SEAT),
    );
  });

  for (const provider of [...NON_GOOGLE_PROVIDERS, null]) {
    const label = provider ?? 'no provider claim';
    it(`${label} user cannot create a party`, async () => {
      await assertFails(
        createPartyWithInviteToken(dbAs(HOST_ID, provider), HOST_ID, partyPayload(HOST_ID), SEAT),
      );
    });

    it(`${label} user who owns a party cannot act as its admin`, async () => {
      await seedParty();
      await seed({
        [`parties/${PARTY_ID}/participants/${GUEST_ID}`]: SEAT,
        [`gifts/g1`]: { partyId: PARTY_ID, submitterId: GUEST_ID, title: 'Gift', isFrozen: false, winnerId: null },
      });
      const db = dbAs(HOST_ID, provider);
      await assertFails(updateDoc(doc(db, 'parties', PARTY_ID), { title: 'Hijack' }));
      await assertFails(updateDoc(doc(db, 'parties', PARTY_ID), { status: 'CANCELLED' }));
      await assertFails(
        updateDoc(doc(db, 'parties', PARTY_ID, 'participants', GUEST_ID), { status: 'PENDING' }),
      );
      await assertFails(removeParticipantSeat(db, { id: PARTY_ID, participantCount: 1 }, GUEST_ID));
      await assertFails(
        setDoc(doc(db, 'parties', PARTY_ID, 'pendingInvites', 'x_example_com'), { status: 'PENDING' }),
      );
      await assertFails(getDoc(doc(db, 'parties', PARTY_ID, 'pendingInvites', 'x_example_com')));
      await assertFails(deleteDoc(doc(db, 'gifts', 'g1')));
      await assertFails(getDoc(doc(db, 'parties', PARTY_ID, 'private', 'invite')));
      await assertFails(rotateInviteToken(db, PARTY_ID));
    });
  }

  it('Google host can run the same admin actions', async () => {
    await seedParty({ participantCount: 2 });
    await seed({
      [`parties/${PARTY_ID}/participants/${GUEST_ID}`]: SEAT,
      [`gifts/g1`]: { partyId: PARTY_ID, submitterId: GUEST_ID, title: 'Gift', isFrozen: false, winnerId: null },
    });
    const db = googleDb(HOST_ID);
    await assertSucceeds(updateDoc(doc(db, 'parties', PARTY_ID), { title: 'Renamed' }));
    await assertSucceeds(
      updateDoc(doc(db, 'parties', PARTY_ID, 'participants', GUEST_ID), { status: 'PENDING' }),
    );
    await assertSucceeds(
      setDoc(doc(db, 'parties', PARTY_ID, 'pendingInvites', 'x_example_com'), { status: 'PENDING' }),
    );
    await assertSucceeds(deleteDoc(doc(db, 'gifts', 'g1')));
    await assertSucceeds(getDoc(doc(db, 'parties', PARTY_ID, 'private', 'invite')));
    await assertSucceeds(removeParticipantSeat(db, { id: PARTY_ID, participantCount: 2 }, GUEST_ID));
    assertCount(await readCount(), 1);
  });

  it('party create without the invite token doc is denied', async () => {
    const db = googleDb(HOST_ID);
    const batch = writeBatch(db);
    batch.set(doc(db, 'parties', PARTY_ID), { ...partyPayload(HOST_ID), participantCount: 1 });
    batch.set(doc(db, 'parties', PARTY_ID, 'participants', HOST_ID), SEAT);
    await assertFails(batch.commit());
  });

  it('party create with a seat count other than 1 is denied', async () => {
    const db = googleDb(HOST_ID);
    const batch = writeBatch(db);
    batch.set(doc(db, 'parties', PARTY_ID), { ...partyPayload(HOST_ID), participantCount: 0 });
    batch.set(doc(db, 'parties', PARTY_ID, 'participants', HOST_ID), SEAT);
    batch.set(doc(db, 'parties', PARTY_ID, 'private', 'invite'), { token: TOKEN });
    await assertFails(batch.commit());
  });
});

function assertCount(actual, expected) {
  if (actual !== expected) {
    throw new Error(`participantCount ${actual} !== ${expected}`);
  }
}

describe('joins: invite token, LOBBY only, 30-seat cap', () => {
  it('accepts a join with the correct token in LOBBY and bumps the count', async () => {
    await seedParty();
    await assertSucceeds(joinPartyWithInviteToken(googleDb(GUEST_ID), PARTY_ID, GUEST_ID, TOKEN, SEAT));
    assertCount(await readCount(), 2);
  });

  it('anonymous guest can join with the correct token (guests do not need Google)', async () => {
    await seedParty();
    await assertSucceeds(
      joinPartyWithInviteToken(dbAs(GUEST_ID, 'anonymous'), PARTY_ID, GUEST_ID, TOKEN, SEAT),
    );
  });

  it('rejects a join with no token', async () => {
    await seedParty();
    await assertFails(joinPartyWithInviteToken(googleDb(GUEST_ID), PARTY_ID, GUEST_ID, null, SEAT));
  });

  it('rejects a join with the wrong token', async () => {
    await seedParty();
    await assertFails(
      joinPartyWithInviteToken(googleDb(GUEST_ID), PARTY_ID, GUEST_ID, WRONG_TOKEN, SEAT),
    );
  });

  it('rejects a join after a rotate with the old token, accepts the new one', async () => {
    await seedParty();
    const newToken = await rotateInviteToken(googleDb(HOST_ID), PARTY_ID);
    await assertFails(joinPartyWithInviteToken(googleDb(GUEST_ID), PARTY_ID, GUEST_ID, TOKEN, SEAT));
    await assertSucceeds(
      joinPartyWithInviteToken(googleDb(GUEST_ID), PARTY_ID, GUEST_ID, newToken, SEAT),
    );
  });

  for (const status of ['ACTIVE', 'ENDED', 'CANCELLED']) {
    it(`rejects a join with the correct token when the party is ${status}`, async () => {
      await seedParty({ status });
      await assertFails(
        joinPartyWithInviteToken(googleDb(GUEST_ID), PARTY_ID, GUEST_ID, TOKEN, SEAT),
      );
    });
  }

  it('accepts the 30th player and rejects the 31st', async () => {
    await seedParty({ participantCount: 29 });
    await assertSucceeds(joinPartyWithInviteToken(googleDb('p30'), PARTY_ID, 'p30', TOKEN, SEAT));
    assertCount(await readCount(), 30);
    await assertFails(joinPartyWithInviteToken(googleDb('p31'), PARTY_ID, 'p31', TOKEN, SEAT));
    assertCount(await readCount(), 30);
  });

  it('rejects a seat create that skips the counter bump', async () => {
    await seedParty();
    const db = googleDb(GUEST_ID);
    const batch = writeBatch(db);
    batch.set(doc(db, 'parties', PARTY_ID, 'participants', GUEST_ID), SEAT);
    batch.set(doc(db, 'parties', PARTY_ID, 'joinProofs', GUEST_ID), { token: TOKEN });
    await assertFails(batch.commit());
  });

  it('rejects a join that bumps the counter by more than 1 or touches other party fields', async () => {
    await seedParty();
    const db = googleDb(GUEST_ID);
    const byTwo = writeBatch(db);
    byTwo.set(doc(db, 'parties', PARTY_ID, 'participants', GUEST_ID), SEAT);
    byTwo.set(doc(db, 'parties', PARTY_ID, 'joinProofs', GUEST_ID), { token: TOKEN });
    byTwo.update(doc(db, 'parties', PARTY_ID), { participantCount: increment(2) });
    await assertFails(byTwo.commit());

    const sneaky = writeBatch(db);
    sneaky.set(doc(db, 'parties', PARTY_ID, 'participants', GUEST_ID), SEAT);
    sneaky.set(doc(db, 'parties', PARTY_ID, 'joinProofs', GUEST_ID), { token: TOKEN });
    sneaky.update(doc(db, 'parties', PARTY_ID), { participantCount: increment(1), title: 'Mine' });
    await assertFails(sneaky.commit());
  });

  it('a stranger cannot change participantCount without taking a seat', async () => {
    await seedParty();
    const db = googleDb(GUEST_ID);
    await assertFails(updateDoc(doc(db, 'parties', PARTY_ID), { participantCount: increment(1) }));
    await assertFails(updateDoc(doc(db, 'parties', PARTY_ID), { participantCount: 0 }));
  });

  it('cannot join someone else into the party', async () => {
    await seedParty();
    await assertFails(joinPartyWithInviteToken(googleDb(GUEST_ID), PARTY_ID, 'someone-else', TOKEN, SEAT));
  });

  it('host removing a counted participant must decrement in the same batch', async () => {
    await seedParty({ participantCount: 2 });
    await seed({ [`parties/${PARTY_ID}/participants/${GUEST_ID}`]: SEAT });
    const db = googleDb(HOST_ID);
    await assertFails(deleteDoc(doc(db, 'parties', PARTY_ID, 'participants', GUEST_ID)));
    await assertSucceeds(removeParticipantSeat(db, { id: PARTY_ID, participantCount: 2 }, GUEST_ID));
    assertCount(await readCount(), 1);
  });
});

describe('private/invite and joinProofs access', () => {
  it('only the Google host can read the invite token', async () => {
    await seedParty();
    await seed({ [`parties/${PARTY_ID}/participants/${GUEST_ID}`]: SEAT });
    await assertSucceeds(getDoc(doc(googleDb(HOST_ID), 'parties', PARTY_ID, 'private', 'invite')));
    await assertFails(getDoc(doc(googleDb(GUEST_ID), 'parties', PARTY_ID, 'private', 'invite')));
    await assertFails(
      getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'parties', PARTY_ID, 'private', 'invite')),
    );
  });

  it('only the Google host can write the invite token, and only a well-formed one', async () => {
    await seedParty();
    await seed({ [`parties/${PARTY_ID}/participants/${GUEST_ID}`]: SEAT });
    await assertFails(
      setDoc(doc(googleDb(GUEST_ID), 'parties', PARTY_ID, 'private', 'invite'), { token: WRONG_TOKEN }),
    );
    await assertFails(
      setDoc(doc(googleDb(HOST_ID), 'parties', PARTY_ID, 'private', 'invite'), { token: 'short' }),
    );
    await assertFails(
      setDoc(doc(googleDb(HOST_ID), 'parties', PARTY_ID, 'private', 'other'), { token: WRONG_TOKEN }),
    );
    await assertFails(deleteDoc(doc(googleDb(HOST_ID), 'parties', PARTY_ID, 'private', 'invite')));
    await assertSucceeds(rotateInviteToken(googleDb(HOST_ID), PARTY_ID));
  });

  it('join proofs are never readable, even by their owner or the host', async () => {
    await seedParty();
    await assertSucceeds(joinPartyWithInviteToken(googleDb(GUEST_ID), PARTY_ID, GUEST_ID, TOKEN, SEAT));
    await assertFails(getDoc(doc(googleDb(GUEST_ID), 'parties', PARTY_ID, 'joinProofs', GUEST_ID)));
    await assertFails(getDoc(doc(googleDb(HOST_ID), 'parties', PARTY_ID, 'joinProofs', GUEST_ID)));
  });

  it('a join proof cannot be written outside a join', async () => {
    await seedParty();
    await assertFails(
      setDoc(doc(googleDb(GUEST_ID), 'parties', PARTY_ID, 'joinProofs', GUEST_ID), { token: TOKEN }),
    );
  });
});
