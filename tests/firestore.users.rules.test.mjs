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
  updateDoc,
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
    name: 'Victim',
    street: '123 Secret St',
    city: 'Testville',
    state: 'TS',
    zip: '00000',
    country: 'US',
  },
  updatedAt: new Date(),
};

const ownerProfile = {
  displayName: 'Owner Player',
  email: 'owner@example.com',
  shippingAddress: {
    name: 'Owner',
    street: '456 My Home Rd',
    city: 'Ownertown',
    state: 'OW',
    zip: '11111',
    country: 'US',
  },
  updatedAt: new Date(),
};

const addresslessProfile = {
  displayName: 'Public Host',
  email: 'host@example.com',
  updatedAt: new Date(),
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
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'users', OWNER_ID), ownerProfile);
    await setDoc(doc(db, 'users', VICTIM_ID), victimProfile);
    await setDoc(doc(db, 'users', OTHER_ID), {
      displayName: 'Other Player',
      email: 'other@example.com',
      updatedAt: new Date(),
    });
    await setDoc(doc(db, 'users', 'public-host'), addresslessProfile);
    await setDoc(doc(db, 'users', 'email-only-victim'), {
      displayName: 'Email Only',
      email: 'emailonly@example.com',
      updatedAt: new Date(),
    });
  });
});

describe('users collection — owner access', () => {
  it('owner can read their own profile and update the display name (legacy address field untouched)', async () => {
    const db = authedDb(OWNER_ID);
    await assertSucceeds(getDoc(doc(db, 'users', OWNER_ID)));

    await assertSucceeds(
      updateDoc(doc(db, 'users', OWNER_ID), {
        displayName: 'Owner Renamed',
        updatedAt: new Date(),
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

  it('authenticated stranger cannot read an addressless profile (email must stay private)', async () => {
    const db = authedDb(OTHER_ID);
    await assertFails(getDoc(doc(db, 'users', 'public-host')));
  });

  it('unauthenticated user cannot read an addressless profile', async () => {
    const db = unauthedDb();
    await assertFails(getDoc(doc(db, 'users', 'public-host')));
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

describe('users collection — lobby and game (PartyLobby, GameBoard, GameRoom)', () => {
  it('party participant can read own profile (PartyLobby shipping / Profile.jsx)', async () => {
    const db = authedDb(OTHER_ID);
    await assertSucceeds(getDoc(doc(db, 'users', OTHER_ID)));
  });

  it('party participant cannot Firestore-get a co-player (display names use POST /api/users/batch)', async () => {
    const db = authedDb(OTHER_ID);
    await assertFails(getDoc(doc(db, 'users', VICTIM_ID)));
    await assertFails(getDoc(doc(db, 'users', OWNER_ID)));
  });

  it('other users emails are not readable via get on addressless profiles', async () => {
    const db = authedDb(OTHER_ID);
    await assertFails(getDoc(doc(db, 'users', 'email-only-victim')));
  });
});

describe('users collection — client write validation', () => {
  it('rejects update with a non-allowlisted top-level field', async () => {
    const db = authedDb(OWNER_ID);
    await assertFails(
      updateDoc(doc(db, 'users', OWNER_ID), {
        adminSecret: 'nope',
        updatedAt: new Date(),
      }),
    );
  });

  it('A0: rejects any shippingAddress write on the profile (update, even a valid address)', async () => {
    const db = authedDb(OWNER_ID);
    await assertFails(
      updateDoc(doc(db, 'users', OWNER_ID), {
        shippingAddress: { ...ownerProfile.shippingAddress, street: '789 Updated Ln' },
        updatedAt: new Date(),
      }),
    );
  });

  it('A0: rejects shippingAddressSenderShareConsentAt writes on the profile', async () => {
    const db = authedDb(OWNER_ID);
    await assertFails(
      updateDoc(doc(db, 'users', OWNER_ID), {
        shippingAddressSenderShareConsentAt: new Date(),
        updatedAt: new Date(),
      }),
    );
  });

  it('A0: rejects creating a profile that carries shippingAddress or the consent stamp', async () => {
    const db = authedDb('fresh-user');
    const base = { displayName: 'Fresh', email: 'fresh@example.com', updatedAt: new Date() };
    await assertFails(setDoc(doc(db, 'users', 'fresh-user'), { ...base, shippingAddress: null }));
    await assertFails(
      setDoc(doc(db, 'users', 'fresh-user'), { ...base, shippingAddressSenderShareConsentAt: new Date() }),
    );
    await assertSucceeds(setDoc(doc(db, 'users', 'fresh-user'), base));
  });

  it('A0: useAuth sign-in sync (merge, no address keys) still works for a user with a legacy address', async () => {
    const db = authedDb(OWNER_ID);
    await assertSucceeds(
      setDoc(
        doc(db, 'users', OWNER_ID),
        { displayName: 'Owner Player', email: 'owner@example.com', createdAt: new Date(), updatedAt: new Date() },
        { merge: true },
      ),
    );
  });
});