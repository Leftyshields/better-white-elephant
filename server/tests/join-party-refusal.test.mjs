import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  JOIN_PARTY_NOT_PARTICIPANT_MESSAGE,
  joinPartyMembershipRefusal,
} from '../lib/join-party-refusal.mjs';

const serverSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../server.js'), 'utf8');

test('confirmed missing seat is NOT_PARTICIPANT', () => {
  assert.deepEqual(joinPartyMembershipRefusal(false), {
    code: 'NOT_PARTICIPANT',
    message: JOIN_PARTY_NOT_PARTICIPANT_MESSAGE,
  });
});

test('membership read failure is MEMBERSHIP_CHECK_FAILED, not NOT_PARTICIPANT', () => {
  const refusal = joinPartyMembershipRefusal(null);
  assert.equal(refusal.code, 'MEMBERSHIP_CHECK_FAILED');
  assert.notEqual(refusal.code, 'NOT_PARTICIPANT');
});

test('seated callers are not refused', () => {
  assert.equal(joinPartyMembershipRefusal(true), null);
});

test('join-party uses the refusal helper and membership reads that fail return null', () => {
  assert.match(serverSource, /joinPartyMembershipRefusal/);
  assert.match(serverSource, /return null;/);
  const membershipFn = serverSource.slice(
    serverSource.indexOf('async function verifyPartyMembership'),
    serverSource.indexOf('const io = new Server'),
  );
  assert.match(membershipFn, /return null;/);
});
