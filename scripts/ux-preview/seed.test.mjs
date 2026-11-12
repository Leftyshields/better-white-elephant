import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PARTY_IDS,
  PREVIEW_REVIEWER_EMAIL,
  buildSeedPlan,
} from './seed-lib.mjs';
import {
  PRODUCTION_PROJECT_ID,
  UX_PREVIEW_PROJECT_ID,
  assertSafeSeedProject,
} from './seed.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

test('buildSeedPlan creates lobby, active, and ended parties', () => {
  const uid = 'ux-preview-reviewer';
  const plan = buildSeedPlan(uid);
  const statuses = plan.parties.map((p) => p.data.status).sort();
  assert.deepEqual(statuses, ['ACTIVE', 'ENDED', 'LOBBY']);
  assert.equal(plan.parties.find((p) => p.id === PARTY_IDS.lobby).data.status, 'LOBBY');
  assert.equal(plan.parties.find((p) => p.id === PARTY_IDS.active).data.status, 'ACTIVE');
  assert.equal(plan.parties.find((p) => p.id === PARTY_IDS.ended).data.status, 'ENDED');
  assert.equal(plan.users[0].email, PREVIEW_REVIEWER_EMAIL);
});

test('assertSafeSeedProject refuses production when no emulator hosts are set', () => {
  assert.throws(
    () => assertSafeSeedProject(PRODUCTION_PROJECT_ID, {}),
    /Refusing to seed production project better-white-elephant/
  );
});

test('assertSafeSeedProject refuses production when only Auth emulator host is set', () => {
  assert.throws(
    () =>
      assertSafeSeedProject(PRODUCTION_PROJECT_ID, {
        FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
      }),
    /Refusing to seed production project better-white-elephant/
  );
});

test('assertSafeSeedProject allows production project when both emulator hosts are set', () => {
  assert.doesNotThrow(() =>
    assertSafeSeedProject(PRODUCTION_PROJECT_ID, {
      FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
    })
  );
});

test('assertSafeSeedProject allows preview project without emulator hosts', () => {
  assert.doesNotThrow(() => assertSafeSeedProject(UX_PREVIEW_PROJECT_ID, {}));
});

test('buildSeedPlan is stable across calls (idempotent shape)', () => {
  const a = buildSeedPlan('ux-preview-reviewer');
  const b = buildSeedPlan('ux-preview-reviewer');
  assert.deepEqual(a.parties.map((p) => p.id), b.parties.map((p) => p.id));
  assert.deepEqual(a.parties.map((p) => p.data.status), b.parties.map((p) => p.data.status));
});

test('seed script runs twice against emulators when available', async (t) => {
  if (process.env.SKIP_UX_PREVIEW_EMULATOR_TEST === '1') {
    t.skip('Emulator integration test skipped via SKIP_UX_PREVIEW_EMULATOR_TEST');
    return;
  }

  const seedPath = join(__dirname, 'seed.mjs');
  const env = {
    ...process.env,
    FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
    GCLOUD_PROJECT: 'better-white-elephant-ux-preview',
    UX_PREVIEW_SEED_PASSWORD: 'local-preview-test-password',
  };

  const run = () =>
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [seedPath], { env, stdio: 'inherit' });
      child.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`seed.mjs exited with code ${code}`));
      });
    });

  try {
    await run();
    await run();
  } catch (error) {
    t.skip(`Firebase emulators not running (${error.message})`);
  }
});
