/**
 * Firestore security rules tests for party hostDisplayName (public invite landing).
 * Run with: npm run test:firestore-rules
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { isValidPublicHostDisplayName } from '../server/lib/display-names.js';
import { createPartyWithInviteToken } from './helpers/party-invite-batches.mjs';

const HOST_SEAT = { status: 'PENDING', turnNumber: null, ready: false };

const __dirname = dirname(fileURLToPath(import.meta.url));
const RULES_PATH = resolve(__dirname, '../firestore.rules');
const PROJECT_ID = 'better-white-elephant-rules-test';

const HOST_ID = 'party-host-001';
const OTHER_ID = 'party-other-002';
const PARTY_ID = 'rules-test-party';

const baseParty = {
  adminId: HOST_ID,
  title: 'Rules Test Party',
  status: 'LOBBY',
  config: { maxSteals: 3, returnToStart: false },
};

/** @type {import('@firebase/rules-unit-testing').RulesTestEnvironment} */
let testEnv;

function authedDb(uid) {
  // Hosts must sign in with Google (item 1 gate); model existing users as Google sign-ins.
  return testEnv.authenticatedContext(uid, { firebase: { sign_in_provider: 'google.com' } }).firestore();
}

function unauthedDb() {
  return testEnv.unauthenticatedContext().firestore();
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(RULES_PATH, 'utf8'),
    },
  });
});

after(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

describe('parties — hostDisplayName validation', () => {
  it('host can create a party with a valid hostDisplayName', async () => {
    const db = authedDb(HOST_ID);
    const hostDisplayName = 'Holiday Host';
    assert.ok(isValidPublicHostDisplayName(hostDisplayName));
    await assertSucceeds(
      createPartyWithInviteToken(db, HOST_ID, {
        ...baseParty,
        hostDisplayName,
      }, HOST_SEAT),
    );
  });

  it('rejects create when hostDisplayName looks like an email', async () => {
    const db = authedDb(HOST_ID);
    await assertFails(
      createPartyWithInviteToken(db, HOST_ID, {
        ...baseParty,
        hostDisplayName: 'leak@example.com',
      }, HOST_SEAT),
    );
  });

  it('rejects create when hostDisplayName exceeds max length', async () => {
    const db = authedDb(HOST_ID);
    await assertFails(
      createPartyWithInviteToken(db, HOST_ID, {
        ...baseParty,
        hostDisplayName: 'x'.repeat(65),
      }, HOST_SEAT),
    );
  });

  it('rejects create when hostDisplayName has leading or trailing whitespace', async () => {
    const db = authedDb(HOST_ID);
    await assertFails(
      createPartyWithInviteToken(db, HOST_ID, {
        ...baseParty,
        hostDisplayName: ' Trimmed Host ',
      }, HOST_SEAT),
    );
  });

  it('host can update hostDisplayName on their party', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'parties', PARTY_ID), {
        ...baseParty,
        hostDisplayName: 'Original Host',
      });
    });

    const db = authedDb(HOST_ID);
    await assertSucceeds(
      updateDoc(doc(db, 'parties', PARTY_ID), {
        hostDisplayName: 'Updated Host',
      }),
    );
  });

  it('non-admin cannot set hostDisplayName on someone else’s party', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'parties', PARTY_ID), {
        ...baseParty,
        hostDisplayName: 'Original Host',
      });
    });

    const db = authedDb(OTHER_ID);
    await assertFails(
      updateDoc(doc(db, 'parties', PARTY_ID), {
        hostDisplayName: 'Hijacked Name',
      }),
    );
  });

  it('unauthenticated invitee can read party hostDisplayName', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'parties', PARTY_ID), {
        ...baseParty,
        hostDisplayName: 'Visible Host',
      });
    });

    const db = unauthedDb();
    const snap = await assertSucceeds(getDoc(doc(db, 'parties', PARTY_ID)));
    assert.strictEqual(snap.data().hostDisplayName, 'Visible Host');
  });
});
describe('parties — list is host-only (no bulk reads)', () => {
  const OTHER_PARTY_ID = 'rules-test-party-other-host';

  async function seedTwoHosts() {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'parties', PARTY_ID), {
        ...baseParty,
        hostDisplayName: 'Host One',
      });
      await setDoc(doc(db, 'parties', OTHER_PARTY_ID), {
        ...baseParty,
        adminId: OTHER_ID,
        status: 'CANCELLED',
        hostDisplayName: 'Host Two',
      });
    });
  }

  function anonDb(uid) {
    return testEnv.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore();
  }

  it('signed-out user cannot list the parties collection', async () => {
    await seedTwoHosts();
    await assertFails(getDocs(collection(unauthedDb(), 'parties')));
  });

  it('signed-out user cannot list parties even when filtering by a host id', async () => {
    await seedTwoHosts();
    const db = unauthedDb();
    await assertFails(getDocs(query(collection(db, 'parties'), where('adminId', '==', HOST_ID))));
  });

  it('signed-out user cannot list parties by status', async () => {
    await seedTwoHosts();
    const db = unauthedDb();
    await assertFails(getDocs(query(collection(db, 'parties'), where('status', '==', 'LOBBY'))));
  });

  it('signed-in non-host cannot list all parties', async () => {
    await seedTwoHosts();
    await assertFails(getDocs(collection(authedDb(OTHER_ID), 'parties')));
  });

  it("signed-in non-host cannot list another host's parties", async () => {
    await seedTwoHosts();
    const db = authedDb(OTHER_ID);
    await assertFails(getDocs(query(collection(db, 'parties'), where('adminId', '==', HOST_ID))));
  });

  it('signed-in user cannot list parties by status without an adminId filter', async () => {
    await seedTwoHosts();
    const db = authedDb(OTHER_ID);
    await assertFails(getDocs(query(collection(db, 'parties'), where('status', 'in', ['LOBBY', 'CANCELLED']))));
  });

  it('anonymous (guest) user cannot list all parties', async () => {
    await seedTwoHosts();
    await assertFails(getDocs(collection(anonDb('anon-guest-003'), 'parties')));
  });

  it('collection-group query on parties is denied', async () => {
    await seedTwoHosts();
    await assertFails(getDocs(collectionGroup(authedDb(HOST_ID), 'parties')));
    await assertFails(getDocs(collectionGroup(unauthedDb(), 'parties')));
  });

  it('host cannot list without filtering to their own adminId', async () => {
    await seedTwoHosts();
    await assertFails(getDocs(collection(authedDb(HOST_ID), 'parties')));
  });

  it('signed-out user can still get a single party by id (invite landing)', async () => {
    await seedTwoHosts();
    const snap = await assertSucceeds(getDoc(doc(unauthedDb(), 'parties', PARTY_ID)));
    assert.strictEqual(snap.data().title, 'Rules Test Party');
  });

  it("host can list their own parties (Home: where adminId == uid)", async () => {
    await seedTwoHosts();
    const db = authedDb(HOST_ID);
    const snap = await assertSucceeds(
      getDocs(query(collection(db, 'parties'), where('adminId', '==', HOST_ID))),
    );
    assert.deepStrictEqual(snap.docs.map((d) => d.id), [PARTY_ID]);
  });

  it('host can list own LOBBY/CANCELLED parties (display-name sync query)', async () => {
    await seedTwoHosts();
    const db = authedDb(OTHER_ID);
    const snap = await assertSucceeds(
      getDocs(
        query(
          collection(db, 'parties'),
          where('adminId', '==', OTHER_ID),
          where('status', 'in', ['LOBBY', 'CANCELLED']),
        ),
      ),
    );
    assert.deepStrictEqual(snap.docs.map((d) => d.id), [OTHER_PARTY_ID]);
  });
});
