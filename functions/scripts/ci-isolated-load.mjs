#!/usr/bin/env node
/**
 * Deploy isolation check: functions/ must load with only its own tree (no ../lib imports).
 */
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const functionsDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const tempRoot = mkdtempSync(join(tmpdir(), 'bwe-functions-isolated-'));

try {
  cpSync(functionsDir, tempRoot, { recursive: true, filter: (src) => !src.includes('node_modules') });
  const hasLock = existsSync(join(tempRoot, 'package-lock.json'));
  const install = spawnSync('npm', hasLock ? ['ci'] : ['install'], { cwd: tempRoot, stdio: 'inherit' });
  if (install.status !== 0) {
    process.exit(install.status ?? 1);
  }
  const indexPath = join(tempRoot, 'index.js');
  await import(`file://${indexPath}`);
  console.log('functions isolated load ok');
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}