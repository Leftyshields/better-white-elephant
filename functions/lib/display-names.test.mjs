import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  displayNameMatchesEmailLocalPart,
  pickHostNameForInvite,
  buildPartyInviteIntroParagraph,
} from './display-names.js';

describe('functions display name privacy', () => {
  test('pickHostNameForInvite never uses email local-part as host name', () => {
    const uid = 'host-user-abc12345';
    const email = 'secret.local@example.com';
    assert.equal(pickHostNameForInvite(uid, 'secret.local', email), 'Player host-use');
  });

  test('invite email HTML never embeds owner email or local-part leak', () => {
    const adminId = 'adminUid12345678';
    const ownerEmail = 'host.prefix@example.com';
    const safeHostName = pickHostNameForInvite(adminId, 'host.prefix', ownerEmail);
    const html = buildPartyInviteIntroParagraph(safeHostName);

    assert.equal(safeHostName, 'Player adminUid');
    assert.ok(!html.includes('@'));
    assert.ok(!html.includes('host.prefix'));
    assert.ok(!html.includes(ownerEmail));
  });
});