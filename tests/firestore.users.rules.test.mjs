/**
 * Firestore security rules tests for /users PII boundaries (shippingAddress, email).
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
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  limit,
  getDocs,
} from 'firebase/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RULES_PATH = resolve(__dirname, '../firestore.rules');
const PROJECT_ID = 'better-white-elephant-rules-test';

const OWNER_ID = 'user-owner-001';
const OTHER_ID = 'user-other-002';
const VICTIM_ID = 'user-victim-003';

const victimProfile = {
  displayName: 'Victim Player',
  email: 'victim@example.com',
  shippingAddress: {
    line1: '123 Secret St',
    city: 'Testville',
    state: 'TS',
    postalCode: '00000',
  },
};

const ownerProfile = {
  displayName: 'Owner Player',
  email: 'owner@example.com',
  shippingAddress: {
    line1: '456 My Home Rd',
    city: 'Ownertown',
    state: 'OW',
    postalCode: '11111',
  },
};

const publicProfile = {
  displayName: 'Public Host',
  email: 'host@example.com',
};

/** @type {import('@firebase/rules-unit-testing').RulesTestEnvironment} */
let testEnv;

function authedDb(uid) {
  return testEnv.authenticatedContext(uid).firestore();
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
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'users', OWNER_ID), ownerProfile);
    await setDoc(doc(db, 'users', VICTIM_ID), victimProfile);
    await setDoc(doc(db, 'users', OTHER_ID), {
      displayName: 'Other Player',
      email: 'other@example.com',
    });
    await setDoc(doc(db, 'users', 'public-host'), publicProfile);
    await setDoc(doc(db, 'users', 'email-only-victim'), {
      displayName: 'Email Only',
      email: 'emailonly@example.com',
    });
  });
});

describe('users collection — owner access', () => {
  it('owner can read and write their own profile including shippingAddress', async () => {
    const db = authedDb(OWNER_ID);
    await assertSucceeds(getDoc(doc(db, 'users', OWNER_ID)));

    await assertSucceeds(
      setDoc(doc(db, 'users', OWNER_ID), {
        ...ownerProfile,
        shippingAddress: { ...ownerProfile.shippingAddress, line1: '789 Updated Ln' },
      }),
    );
  });
});

describe('users collection — non-owner single-document reads', () => {
  it('another authenticated user cannot get a profile that contains shippingAddress', async () => {
    const db = authedDb(OTHER_ID);
    await assertFails(getDoc(doc(db, 'users', VICTIM_ID)));
  });

  it('unauthenticated user cannot get a profile that contains shippingAddress', async () => {
    const db = unauthedDb();
    await assertFails(getDoc(doc(db, 'users', VICTIM_ID)));
  });

  it('unauthenticated user can get a profile with no shippingAddress (public invite display)', async () => {
    const db = unauthedDb();
    const snap = await assertSucceeds(getDoc(doc(db, 'users', 'public-host')));
    assert.strictEqual(snap.exists(), true);
    assert.strictEqual(snap.data().displayName, 'Public Host');
  });
});

describe('users collection — non-owner queries (PII regression)', () => {
  it('rejects authenticated collection query with limit (regression for main query bypass)', async () => {
    const db = authedDb(OTHER_ID);
    const usersQuery = query(collection(db, 'users'), limit(10));
    await assertFails(getDocs(usersQuery));
  });

  it('rejects unauthenticated collection query on users', async () => {
    const db = unauthedDb();
    const usersQuery = query(collection(db, 'users'), limit(5));
    await assertFails(getDocs(usersQuery));
  });

  it('rejects authenticated users collection query when other profiles only contain email', async () => {
    const db = authedDb(OTHER_ID);
    const usersQuery = query(collection(db, 'users'), limit(25));
    await assertFails(getDocs(usersQuery));
  });
});
