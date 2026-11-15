/**
 * Firestore rules tests: pendingInvites stay admin-write-only (no loosening for join flow).
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
import { doc, setDoc, updateDoc, getDoc } from 'firebase/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RULES_PATH = resolve(__dirname, '../firestore.rules');
const PROJECT_ID = 'better-white-elephant-rules-test';

const HOST_ID = 'host-admin-001';
const INVITEE_ID = 'invitee-002';
const PARTY_ID = 'party-rules-invite';

/** @type {import('@firebase/rules-unit-testing').RulesTestEnvironment} */
let testEnv;

function authedDb(uid) {
  return testEnv.authenticatedContext(uid).firestore();
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
    await setDoc(doc(db, 'parties', PARTY_ID), {
      adminId: HOST_ID,
      status: 'LOBBY',
      title: 'Rules Test Party',
    });
    await setDoc(doc(db, 'parties', PARTY_ID, 'participants', INVITEE_ID), {
      status: 'GOING',
      joinedAt: new Date(),
    });
    await setDoc(doc(db, 'parties', PARTY_ID, 'pendingInvites', 'invitee_example_com'), {
      email: 'invitee@example.com',
      status: 'PENDING',
    });
  });
});

describe('pendingInvites security', () => {
  it('allows party admin to read and update invites', async () => {
    const db = authedDb(HOST_ID);
    const ref = doc(db, 'parties', PARTY_ID, 'pendingInvites', 'invitee_example_com');
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(
      updateDoc(ref, { status: 'ACCEPTED', userId: INVITEE_ID, updatedAt: new Date() })
    );
  });

  it('denies non-admin participants from writing pendingInvites', async () => {
    const db = authedDb(INVITEE_ID);
    const ref = doc(db, 'parties', PARTY_ID, 'pendingInvites', 'invitee_example_com');
    await assertFails(
      updateDoc(ref, { status: 'ACCEPTED', userId: INVITEE_ID, updatedAt: new Date() })
    );
  });
});