import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function walkFiles(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (name === 'node_modules' || name === '.git') continue;
      walkFiles(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

test('repo has no localhost:7243 agent debug ingest fetches', () => {
  const hits = [];
  for (const file of walkFiles(repoRoot)) {
    if (!/\.(js|mjs|ts|tsx|jsx|sh)$/.test(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    if (file.endsWith('agent-log-removed.test.mjs')) continue;
    if (text.includes('localhost:7243')) {
      hits.push(path.relative(repoRoot, file));
    }
  }
  assert.deepEqual(hits, []);
});