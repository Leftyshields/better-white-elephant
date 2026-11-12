import { beforeEach, describe, expect, it } from 'vitest';
import {
  OPEN_CREATE_PARTY_AFTER_AUTH_KEY,
  clearOpenCreatePartyAfterAuthUnlessGoogleSignInSucceeded,
} from '../../pages/Home.jsx';

describe('clearOpenCreatePartyAfterAuthUnlessGoogleSignInSucceeded', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('removes the flag when Google sign-in does not succeed', () => {
    window.sessionStorage.setItem(OPEN_CREATE_PARTY_AFTER_AUTH_KEY, '1');
    clearOpenCreatePartyAfterAuthUnlessGoogleSignInSucceeded({ success: false, error: 'popup closed' });
    expect(window.sessionStorage.getItem(OPEN_CREATE_PARTY_AFTER_AUTH_KEY)).toBeNull();
  });

  it('keeps the flag when Google sign-in succeeds', () => {
    window.sessionStorage.setItem(OPEN_CREATE_PARTY_AFTER_AUTH_KEY, '1');
    clearOpenCreatePartyAfterAuthUnlessGoogleSignInSucceeded({ success: true, user: { uid: 'u1' } });
    expect(window.sessionStorage.getItem(OPEN_CREATE_PARTY_AFTER_AUTH_KEY)).toBe('1');
  });
});
