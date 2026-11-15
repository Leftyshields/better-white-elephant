/**
 * Firestore rules: _rateLimits must be denied to all clients (Admin SDK only).
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, beforeEach, describe, it } from 'node:test';
import {
  initializeTestEnvironment,
  assertFails,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RULES_PATH = resolve(__dirname, '../firestore.rules');
const PROJECT_ID = 'better-white-elephant-rules-test';

const HOST_ID = 'host-rate-limit-001';

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
    await setDoc(doc(db, '_rateLimits', 'partyInviteHosts', 'records', HOST_ID), {
      hourCount: 1,
    });
  });
});

describe('_rateLimits', () => {
  it('denies unauthenticated read', async () => {
    const ref = doc(
      unauthedDb(),
      '_rateLimits',
      'partyInviteHosts',
      'records',
      HOST_ID,
    );
    await assertFails(getDoc(ref));
  });

  it('denies authenticated read', async () => {
    const ref = doc(
      authedDb(HOST_ID),
      '_rateLimits',
      'partyInviteHosts',
      'records',
      HOST_ID,
    );
    await assertFails(getDoc(ref));
  });

  it('denies authenticated write', async () => {
    const ref = doc(
      authedDb(HOST_ID),
      '_rateLimits',
      'partyInviteRecipients',
      'records',
      'abc123hash',
    );
    await assertFails(
      setDoc(ref, { hourCount: 99 }, { merge: true }),
    );
  });
});