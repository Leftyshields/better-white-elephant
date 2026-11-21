/**
 * BUG-8: public seat name on parties/{id}/participants/{uid} (displayName, optional lastInitial).
 * Batches mirror client/src/utils/partyInvite.js via tests/helpers/party-invite-batches.mjs.
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
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import {
  createPartyWithInviteToken,
  joinPartyWithInviteToken,
} from './helpers/party-invite-batches.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RULES_PATH = resolve(__dirname, '../firestore.rules');
const PROJECT_ID = 'better-white-elephant-rules-test';

const HOST_ID = 'seat-host';
const GUEST_ID = 'seat-guest';
const PARTY_ID = 'seat-party';
const TOKEN = 'aaaaaaaaaaaaaaaabbbbbbbbbbbbbbbb';
const SEAT = { status: 'GOING', turnNumber: null, ready: false };

/** @type {import('@firebase/rules-unit-testing').RulesTestEnvironment} */
let testEnv;

const googleDb = (uid) =>
  testEnv.authenticatedContext(uid, { firebase: { sign_in_provider: 'google.com' } }).firestore();

async function seedParty() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, `parties/${PARTY_ID}`), {
      adminId: HOST_ID,
      title: 'Seat Party',
      status: 'LOBBY',
      participantCount: 1,
    });
    await setDoc(doc(db, `parties/${PARTY_ID}/participants/${HOST_ID}`), { status: 'PENDING', ready: false });
    await setDoc(doc(db, `parties/${PARTY_ID}/private/invite`), { token: TOKEN });
  });
}

const join = (seat) => joinPartyWithInviteToken(googleDb(GUEST_ID), PARTY_ID, GUEST_ID, TOKEN, seat);

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

describe('seat displayName on join', () => {
  beforeEach(seedParty);

  it('accepts a valid first name and last initial', async () => {
    await assertSucceeds(join({ ...SEAT, displayName: 'Alex', lastInitial: 'K' }));
  });

  it('allows a seat with no name (Player fallback)', async () => {
    await assertSucceeds(join(SEAT));
  });

  it('rejects an email-shaped name', async () => {
    await assertFails(join({ ...SEAT, displayName: 'alex@example.com' }));
  });

  it('rejects a name over 64 characters', async () => {
    await assertFails(join({ ...SEAT, displayName: 'A'.repeat(65) }));
  });

  it('accepts a name of exactly 64 characters', async () => {
    await assertSucceeds(join({ ...SEAT, displayName: 'A'.repeat(64) }));
  });

  for (const name of [' Alex', 'Alex ', '', 42]) {
    it(`rejects displayName ${JSON.stringify(name)}`, async () => {
      await assertFails(join({ ...SEAT, displayName: name }));
    });
  }

  for (const initial of ['k', 'KL', '1', '', 'É']) {
    it(`rejects lastInitial ${JSON.stringify(initial)}`, async () => {
      await assertFails(join({ ...SEAT, displayName: 'Alex', lastInitial: initial }));
    });
  }
});

describe('seat displayName on host create', () => {
  const party = { adminId: HOST_ID, title: 'New', status: 'LOBBY' };

  it('accepts a valid host first name', async () => {
    await assertSucceeds(
      createPartyWithInviteToken(googleDb(HOST_ID), HOST_ID, party, { ...SEAT, displayName: 'Brian', lastInitial: 'S' }),
    );
  });

  it('rejects an email-shaped host seat name', async () => {
    await assertFails(
      createPartyWithInviteToken(googleDb(HOST_ID), HOST_ID, party, { ...SEAT, displayName: 'b@x.com' }),
    );
  });
});

describe('seat displayName on update', () => {
  beforeEach(async () => {
    await seedParty();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      // Legacy seat: an old displayName that would fail today's check.
      await setDoc(doc(context.firestore(), `parties/${PARTY_ID}/participants/${GUEST_ID}`), {
        ...SEAT,
        displayName: ' legacy ',
      });
    });
  });

  const guestSeat = (uid) => doc(googleDb(uid), 'parties', PARTY_ID, 'participants', GUEST_ID);

  it('owner can still change ready on a legacy seat', async () => {
    await assertSucceeds(updateDoc(guestSeat(GUEST_ID), { ready: true }));
  });

  it('owner can set a valid name', async () => {
    await assertSucceeds(updateDoc(guestSeat(GUEST_ID), { displayName: 'Alex' }));
  });

  it('owner cannot set an email-shaped or padded name', async () => {
    await assertFails(updateDoc(guestSeat(GUEST_ID), { displayName: 'a@b.co' }));
    await assertFails(updateDoc(guestSeat(GUEST_ID), { displayName: 'Alex ' }));
    await assertFails(updateDoc(guestSeat(GUEST_ID), { displayName: 'A'.repeat(65) }));
    await assertFails(updateDoc(guestSeat(GUEST_ID), { lastInitial: 'zz' }));
  });

  it('G18: an anonymous guest saves the blur payload to their own seat before ready; nobody else can', async () => {
    const anonSeat = (uid) =>
      doc(
        testEnv.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore(),
        'parties', PARTY_ID, 'participants', GUEST_ID,
      );
    await assertSucceeds(
      updateDoc(anonSeat(GUEST_ID), { displayName: 'Alex', lastInitial: 'K', updatedAt: new Date() }),
    );
    await assertFails(
      updateDoc(anonSeat('someone-else'), { displayName: 'Mallory', updatedAt: new Date() }),
    );
  });

  it('host cannot rename a guest seat but can still change its status', async () => {
    await assertFails(updateDoc(guestSeat(HOST_ID), { displayName: 'Alex' }));
    await assertFails(updateDoc(guestSeat(HOST_ID), { lastInitial: 'Q' }));
    await assertSucceeds(updateDoc(guestSeat(HOST_ID), { status: 'PENDING' }));
  });
});
