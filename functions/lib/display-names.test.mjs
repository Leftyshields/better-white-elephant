import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  PARTY_INVITE_INTRO_ANONYMOUS,
  displayNameMatchesEmailLocalPart,
  pickHostNameForInvite,
  pickHostNameForInviteFromProfile,
  buildPartyInviteIntroParagraph,
  sanitizeUserChosenDisplayName,
} from './display-names.js';

describe('functions display name privacy', () => {
  test('pickHostNameForInvite never uses email local-part as host name', () => {
    const uid = 'host-user-abc12345';
    const email = 'secret.local@example.com';
    assert.equal(pickHostNameForInvite(uid, 'secret.local', email), 'Player host-use');
  });

  test('invite email HTML uses anonymous Copywriter line when host name is synthetic', () => {
    const adminId = 'adminUid12345678';
    const ownerEmail = 'host.prefix@example.com';
    const safeHostName = pickHostNameForInvite(adminId, 'host.prefix', ownerEmail);
    const html = buildPartyInviteIntroParagraph(safeHostName, adminId);

    assert.equal(safeHostName, 'Player adminUid');
    assert.ok(!html.includes('Player adminUid'));
    assert.ok(!html.includes('Player unknown'));
    assert.ok(html.includes(PARTY_INVITE_INTRO_ANONYMOUS));
    assert.ok(!html.includes('@'));
    assert.ok(!html.includes('host.prefix'));
    assert.ok(!html.includes(ownerEmail));
  });

  test('sanitizeUserChosenDisplayName strips Unicode line and paragraph separators', () => {
    assert.equal(sanitizeUserChosenDisplayName('  Real\u2028Name  '), 'RealName');
  });

  test('pickHostNameForInviteFromProfile uses profile name when displayName is leaked local-part', () => {
    assert.equal(
      pickHostNameForInviteFromProfile('uid-3', {
        email: 'legacy@mail.com',
        displayName: 'legacy',
        name: 'Legal Name',
      }),
      'Legal Name',
    );
  });

  test('invite email HTML uses host name when it is a real display name', () => {
    const adminId = 'adminUid12345678';
    const html = buildPartyInviteIntroParagraph('Holiday Host', adminId);
    assert.ok(html.includes('Holiday Host invited you to a Steal or Reveal game.'));
  });
});