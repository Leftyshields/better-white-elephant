#!/usr/bin/env node
/**
 * Seed the isolated UX preview Firebase project (or Auth/Firestore emulators).
 *
 * Usage:
 *   UX_PREVIEW_SEED_PASSWORD='...' node scripts/ux-preview/seed.mjs
 *   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 UX_PREVIEW_SEED_PASSWORD='pass' node scripts/ux-preview/seed.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import {
  PREVIEW_REVIEWER_EMAIL,
  PARTY_IDS,
  buildSeedPlan,
} from './seed-lib.mjs';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');

export const PRODUCTION_PROJECT_ID = 'better-white-elephant';
export const UX_PREVIEW_PROJECT_ID = 'better-white-elephant-ux-preview';

/** Fail closed: preview project only without both emulator hosts for any other project id. */
export function assertSafeSeedProject(projectId, env = process.env) {
  if (projectId === UX_PREVIEW_PROJECT_ID) {
    return;
  }
  const authEmulator = Boolean(env.FIREBASE_AUTH_EMULATOR_HOST);
  const firestoreEmulator = Boolean(env.FIRESTORE_EMULATOR_HOST);
  if (!authEmulator || !firestoreEmulator) {
    if (projectId === PRODUCTION_PROJECT_ID) {
      throw new Error(
        'Refusing to seed production project better-white-elephant. Set FIREBASE_AUTH_EMULATOR_HOST and FIRESTORE_EMULATOR_HOST, or use project better-white-elephant-ux-preview.'
      );
    }
    throw new Error(
      `Refusing to seed project ${projectId} without both FIREBASE_AUTH_EMULATOR_HOST and FIRESTORE_EMULATOR_HOST.`
    );
  }
}

function loadProjectId() {
  if (process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID) {
    return process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID;
  }
  const rcPath = join(ROOT, '.firebaserc');
  if (existsSync(rcPath)) {
    const rc = JSON.parse(readFileSync(rcPath, 'utf8'));
    return rc.projects?.['ux-preview'] || rc.projects?.default;
  }
  return 'better-white-elephant-ux-preview';
}

function loadPassword() {
  const fromEnv = process.env.UX_PREVIEW_SEED_PASSWORD;
  if (fromEnv) return fromEnv;
  const localPath = join(__dirname, '.seed-credentials.local');
  if (existsSync(localPath)) {
    const parsed = JSON.parse(readFileSync(localPath, 'utf8'));
    if (parsed.password) return parsed.password;
  }
  throw new Error(
    'Set UX_PREVIEW_SEED_PASSWORD or create scripts/ux-preview/.seed-credentials.local (gitignored) with { "password": "..." }'
  );
}

function initAdmin(projectId) {
  if (getApps().length > 0) {
    return;
  }
  const options = { projectId };
  const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.UX_PREVIEW_SERVICE_ACCOUNT_PATH;
  if (saPath && existsSync(saPath)) {
    options.credential = cert(JSON.parse(readFileSync(saPath, 'utf8')));
  }
  initializeApp(options);
}

function toFirestoreValue(value) {
  if (value instanceof Date) {
    return Timestamp.fromDate(value);
  }
  if (Array.isArray(value)) {
    return value.map(toFirestoreValue);
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      out[key] = toFirestoreValue(val);
    }
    return out;
  }
  return value;
}

async function ensureAuthUser(auth, { email, password, uid, displayName }) {
  try {
    await auth.getUser(uid);
    await auth.updateUser(uid, { email, password, displayName });
    return uid;
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      const created = await auth.createUser({ uid, email, password, displayName });
      return created.uid;
    }
    throw error;
  }
}

async function applySeed(auth, db, password) {
  const reviewer = await ensureAuthUser(auth, {
    email: PREVIEW_REVIEWER_EMAIL,
    password,
    uid: 'ux-preview-reviewer',
    displayName: 'UX Reviewer',
  });

  const plan = buildSeedPlan(reviewer);

  for (const bot of plan.users.filter((u) => u.id !== reviewer)) {
    await ensureAuthUser(auth, {
      email: bot.email,
      password,
      uid: bot.id,
      displayName: bot.displayName,
    });
  }

  for (const user of plan.users) {
    await db.collection('users').doc(user.id).set(
      toFirestoreValue({
        displayName: user.displayName,
        email: user.email,
        shippingAddress: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      { merge: true }
    );
  }

  for (const party of plan.parties) {
    const partyRef = db.collection('parties').doc(party.id);
    await partyRef.set(toFirestoreValue(party.data), { merge: true });

    for (const participant of party.participants) {
      const { id, ...data } = participant;
      await partyRef.collection('participants').doc(id).set(toFirestoreValue(data), { merge: true });
    }

    for (const gift of party.gifts) {
      const { id, ...data } = gift;
      await db.collection('gifts').doc(id).set(toFirestoreValue(data), { merge: true });
    }
  }

  return { reviewerUid: reviewer, partyIds: PARTY_IDS };
}

async function main() {
  const projectId = loadProjectId();
  const password = loadPassword();
  const usingEmulator =
    Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST) &&
    Boolean(process.env.FIRESTORE_EMULATOR_HOST);

  try {
    assertSafeSeedProject(projectId, process.env);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  initAdmin(projectId);
  const auth = getAuth();
  const db = getFirestore();

  console.log(`Seeding UX preview data (project: ${projectId}, emulator: ${usingEmulator})`);
  const result = await applySeed(auth, db, password);
  await applySeed(auth, db, password);
  console.log('Idempotency check: second seed run completed without error.');

  const manifest = {
    projectId,
    reviewerEmail: PREVIEW_REVIEWER_EMAIL,
    reviewerUid: result.reviewerUid,
    parties: result.partyIds,
    seededAt: new Date().toISOString(),
  };
  const manifestPath = join(__dirname, '.preview-manifest.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`Wrote ${manifestPath}`);
}

const isDirectRun =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
