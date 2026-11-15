import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  displayNameMatchesEmailLocalPart,
  emailLocalPart,
  pickDisplayName,
  hostDisplayNameForPartyDoc,
  isValidPublicHostDisplayName,
  pickHostNameForInvite,
  PARTY_INVITE_INTRO_ANONYMOUS,
  buildPartyInviteIntroParagraph,
  resolveSyncedFirestoreDisplayName,
  sanitizeUserChosenDisplayName,
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

  test('hostDisplayNameForPartyDoc matches trimmed invite host picker', () => {
    const uid = 'party-host-abcd1234';
    assert.equal(
      hostDisplayNameForPartyDoc(uid, 'Display', 'nope@example.com'),
      pickHostNameForInvite(uid, 'Display', 'nope@example.com'),
    );
  });

  test('isValidPublicHostDisplayName matches Firestore validHostDisplayName', () => {
    assert.equal(isValidPublicHostDisplayName('Good Name'), true);
    assert.equal(isValidPublicHostDisplayName('bad@mail.com'), false);
    assert.equal(isValidPublicHostDisplayName('x'.repeat(65)), false);
    assert.equal(isValidPublicHostDisplayName(''), false);
    assert.equal(isValidPublicHostDisplayName(' padded '), false);
    assert.equal(isValidPublicHostDisplayName('A'), true);
  });

  test('hostDisplayNameForPartyDoc caps values longer than 64 characters', () => {
    const uid = 'party-host-abcd1234';
    const long = 'L'.repeat(80);
    assert.equal(
      hostDisplayNameForPartyDoc(uid, long, 'safe@example.com').length,
      64,
    );
    assert.equal(
      isValidPublicHostDisplayName(hostDisplayNameForPartyDoc(uid, long, 'safe@example.com')),
      true,
    );
  });

  test('resolveSyncedFirestoreDisplayName never derives from email', () => {
    assert.equal(resolveSyncedFirestoreDisplayName(null, undefined), '');
    assert.equal(resolveSyncedFirestoreDisplayName('  ', ' kept '), 'kept');
    assert.equal(resolveSyncedFirestoreDisplayName('Profile', 'legacy.local'), 'Profile');
    assert.equal(resolveSyncedFirestoreDisplayName('user@auth.com', ''), '');
    assert.equal(resolveSyncedFirestoreDisplayName('', 'stored@email.com'), '');
    assert.equal(resolveSyncedFirestoreDisplayName('stored@email.com', 'Backup Name'), 'Backup Name');
    assert.equal(resolveSyncedFirestoreDisplayName('full@email.com', 'also@bad.com'), '');
  });

  test('sanitizeUserChosenDisplayName rejects full email strings', () => {
    assert.equal(sanitizeUserChosenDisplayName('user@domain.com'), '');
    assert.equal(sanitizeUserChosenDisplayName('  Real Name '), 'Real Name');
  });

  test('buildPartyInviteIntroParagraph omits Player fallback from email copy', () => {
    const html = buildPartyInviteIntroParagraph('Player abcdefgh', 'abcdefgh123');
    assert.ok(html.includes(PARTY_INVITE_INTRO_ANONYMOUS));
    assert.ok(!html.includes('Player abcdefgh'));
  });
});