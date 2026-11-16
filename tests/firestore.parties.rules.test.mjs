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
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
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