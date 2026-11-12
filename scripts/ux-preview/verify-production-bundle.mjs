#!/usr/bin/env node
/**
 * Regression: default production build must not ship UX preview sign-in or emulator init.
 */
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const CLIENT = join(ROOT, 'client');
const DIST = join(CLIENT, 'dist');

function bundleText() {
  const assetsDir = join(DIST, 'assets');
  const chunks = readdirSync(assetsDir).filter((name) => name.endsWith('.js'));
  return chunks.map((name) => readFileSync(join(assetsDir, name), 'utf8')).join('\n');
}

function build(mode) {
  if (existsSync(DIST)) {
    rmSync(DIST, { recursive: true, force: true });
  }
  const script = mode === 'ux-preview' ? 'build:ux-preview' : 'build';
  execSync(`npm run ${script}`, {
    cwd: CLIENT,
    env: {
      ...process.env,
      VITE_FIREBASE_API_KEY: 'test-key',
      VITE_FIREBASE_AUTH_DOMAIN: 'test.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: 'test-project',
      VITE_FIREBASE_STORAGE_BUCKET: 'test-project.appspot.com',
      VITE_FIREBASE_MESSAGING_SENDER_ID: '123456789',
      VITE_FIREBASE_APP_ID: '1:123456789:web:abc123',
      VITE_SERVER_URL: 'http://localhost:3001',
    },
    stdio: 'inherit',
  });
}

const FORBIDDEN_IN_PRODUCTION = [
  /UX preview sign-in/,
  /Preview sign in/,
  /preview\.stealorreveal\.test/,
  /ux-preview-lobby/,
  /initPreviewFirebase/,
  /VITE_USE_FIREBASE_EMULATORS/,
];

build('production');
const productionBundle = bundleText();
for (const pattern of FORBIDDEN_IN_PRODUCTION) {
  if (pattern.test(productionBundle)) {
    console.error(`Production bundle failed guard: matched ${pattern}`);
    process.exit(1);
  }
}

build('ux-preview');
const previewBundle = bundleText();
if (!/UX preview sign-in/.test(previewBundle) || !/preview\.stealorreveal\.test/.test(previewBundle)) {
  console.error('Preview build did not contain expected preview-only UI (negative control).');
  process.exit(1);
}

console.log('UX preview production bundle guard passed.');
