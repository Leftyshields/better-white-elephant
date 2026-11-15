import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  displayNameMatchesEmailLocalPart,
  emailLocalPart,
  pickDisplayName,
  pickHostNameForInvite,
  resolveSyncedFirestoreDisplayName,
} from './display-names.js';

describe('display name privacy', () => {
  test('emailLocalPart extracts only the local segment', () => {
    assert.equal(emailLocalPart('alice@example.com'), 'alice');
    assert.equal(emailLocalPart('not-an-email'), '');
  });

  test('displayNameMatchesEmailLocalPart detects leaked names', () => {
    assert.equal(
      displayNameMatchesEmailLocalPart('alice', 'alice@example.com'),
      true,
    );
    assert.equal(
      displayNameMatchesEmailLocalPart('Alice', 'alice@example.com'),
      false,
    );
    assert.equal(
      displayNameMatchesEmailLocalPart('Real Name', 'alice@example.com'),
      false,
    );
  });

  test('pickHostNameForInvite never uses email local-part as host name', () => {
    const uid = 'host-user-abc12345';
    const email = 'secret.local@example.com';
    assert.equal(pickHostNameForInvite(uid, 'secret.local', email), 'Player host-use');
    assert.equal(pickHostNameForInvite(uid, '', email), 'Player host-use');
    assert.equal(pickHostNameForInvite(uid, null, email), 'Player host-use');
    assert.equal(pickHostNameForInvite(uid, 'Party Host', email), 'Party Host');
  });

  test('pickDisplayName skips full email strings but not arbitrary local-part alone', () => {
    assert.equal(
      pickDisplayName('u1', 'user@domain.com', 'Visible'),
      'Visible',
    );
  });

  test('resolveSyncedFirestoreDisplayName never derives from email', () => {
    assert.equal(resolveSyncedFirestoreDisplayName(null, undefined), '');
    assert.equal(resolveSyncedFirestoreDisplayName('  ', ' kept '), 'kept');
    assert.equal(resolveSyncedFirestoreDisplayName('Profile', 'legacy.local'), 'Profile');
  });
});