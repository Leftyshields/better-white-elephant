import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  isLeakedDisplayNameRecord,
  planLeakedDisplayNameFix,
} from './backfill-leaked-display-names.js';

describe('backfill leaked displayName matching', () => {
  test('isLeakedDisplayNameRecord matches exact local-part only', () => {
    assert.equal(
      isLeakedDisplayNameRecord({
        displayName: 'alice',
        email: 'alice@example.com',
      }),
      true,
    );
    assert.equal(
      isLeakedDisplayNameRecord({
        displayName: 'Alice',
        email: 'alice@example.com',
      }),
      false,
    );
    assert.equal(
      isLeakedDisplayNameRecord({
        displayName: 'Real Name',
        email: 'alice@example.com',
      }),
      false,
    );
    assert.equal(
      isLeakedDisplayNameRecord({
        displayName: 'alice',
        email: 'missing-email',
      }),
      false,
    );
  });

  test('planLeakedDisplayNameFix clears when no alternate name exists', () => {
    const uid = 'user-abcdefgh';
    const plan = planLeakedDisplayNameFix(uid, {
      displayName: 'secret.user',
      email: 'secret.user@example.org',
    });
    assert.ok(plan);
    assert.equal(plan.displayName, '');
    assert.notEqual(plan.displayName, 'secret.user');
  });

  test('isLeakedDisplayNameRecord matches full email address stored as displayName', () => {
    assert.equal(
      isLeakedDisplayNameRecord({
        displayName: 'stored@email.example',
        email: 'other@example.com',
      }),
      true,
    );
  });

  test('planLeakedDisplayNameFix uses profile name when available', () => {
    const uid = 'user-abcdefgh';
    const plan = planLeakedDisplayNameFix(uid, {
      displayName: 'secret.user',
      email: 'secret.user@example.org',
      name: 'Preferred Name',
    });
    assert.equal(plan.displayName, 'Preferred Name');
  });
});