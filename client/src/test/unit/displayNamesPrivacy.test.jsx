import { describe, expect, it } from 'vitest';
import {
  displayNameMatchesEmailLocalPart,
  pickHostNameForInvite,
  playerFallbackForUserId,
  resolveSyncedFirestoreDisplayName,
} from '../../../../server/lib/display-names.js';

const HOST_UID = 'privacy-host-uid12';

describe('display name privacy regression', () => {
  it('does not use email local-part when picking invite host name', () => {
    const email = 'leaky.prefix@example.com';
    const hostName = pickHostNameForInvite(HOST_UID, 'leaky.prefix', email);
    expect(hostName).not.toBe('leaky.prefix');
    expect(displayNameMatchesEmailLocalPart(hostName, email)).toBe(false);
    expect(hostName).toBe(playerFallbackForUserId(HOST_UID));
  });

  it('keeps a real display name for invites', () => {
    expect(
      pickHostNameForInvite(HOST_UID, 'Holiday Host', 'leaky.prefix@example.com'),
    ).toBe('Holiday Host');
  });

  it('Firestore sync resolver never falls back to email local-part', () => {
    expect(resolveSyncedFirestoreDisplayName('', '')).toBe('');
    expect(resolveSyncedFirestoreDisplayName(null, null)).toBe('');
    const synced = resolveSyncedFirestoreDisplayName(
      undefined,
      'old.local',
    );
    expect(synced).toBe('old.local');
    expect(
      resolveSyncedFirestoreDisplayName(undefined, undefined),
    ).not.toMatch(/@/);
  });
});