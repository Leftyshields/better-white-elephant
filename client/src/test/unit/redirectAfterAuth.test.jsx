/**
 * redirectAfterAuth must only send the signed-in user to a same-origin path
 * that starts with exactly one '/', and must never keep a #t= invite token.
 * These cases fail on the previous head: Home would navigate to '//' or '\',
 * and LateInviteCard stored '/party/p1#t=abcd'.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { safeRedirectAfterAuth, redirectAfterAuthFromLocation, takeRedirectAfterAuth } from '../../utils/redirectAfterAuth.js';
import { LateInviteCard } from '../../components/LateInviteCard.jsx';
import { LATE_INVITE_COPY } from '../../utils/lateInvite.js';

const signInWithGoogle = vi.fn();
vi.mock('../../hooks/useAuth.js', () => ({
  useAuth: () => ({ user: null, loading: false, signInWithGoogle }),
}));

describe('safeRedirectAfterAuth', () => {
  it('keeps a same-origin path and query, and drops a #t= invite token', () => {
    expect(safeRedirectAfterAuth('/party/p1')).toBe('/party/p1');
    expect(safeRedirectAfterAuth('/party/p1?src=link')).toBe('/party/p1?src=link');
    expect(safeRedirectAfterAuth('/party/p1#t=abcdabcdabcdabcdabcdabcdabcdabcd')).toBe('/party/p1');
    expect(safeRedirectAfterAuth('/party/p1?src=link#t=abcdabcdabcdabcdabcdabcdabcdabcd')).toBe(
      '/party/p1?src=link',
    );
    expect(safeRedirectAfterAuth('/party/p1#t=abcdabcdabcdabcdabcdabcdabcdabcd&ref=host')).toBe(
      '/party/p1#ref=host',
    );
    expect(safeRedirectAfterAuth('/')).toBe('/');
  });

  it('rejects protocol-relative URLs, backslashes, and anything that is not a path', () => {
    expect(safeRedirectAfterAuth('//evil.example')).toBeNull();
    expect(safeRedirectAfterAuth('//evil.example/phish')).toBeNull();
    expect(safeRedirectAfterAuth('/\\evil')).toBeNull();
    expect(safeRedirectAfterAuth('\\party')).toBeNull();
    expect(safeRedirectAfterAuth('/party/p1\\x')).toBeNull();
    expect(safeRedirectAfterAuth('https://evil.example/party')).toBeNull();
    expect(safeRedirectAfterAuth('javascript:alert(1)')).toBeNull();
    expect(safeRedirectAfterAuth('party/p1')).toBeNull();
    expect(safeRedirectAfterAuth('')).toBeNull();
    expect(safeRedirectAfterAuth(null)).toBeNull();
  });

  it('builds the stored value from the location and strips #t=', () => {
    expect(redirectAfterAuthFromLocation({
      pathname: '/party/p1',
      search: '',
      hash: '#t=abcdabcdabcdabcdabcdabcdabcdabcd',
    })).toBe('/party/p1');
    expect(redirectAfterAuthFromLocation({
      pathname: '//evil.example',
      search: '',
      hash: '',
    })).toBeNull();
  });
});

describe('LateInviteCard redirectAfterAuth', () => {
  beforeEach(() => {
    signInWithGoogle.mockReset().mockResolvedValue(undefined);
    window.sessionStorage.clear();
  });

  it('stores path and query only, without the #t= fragment', async () => {
    window.history.replaceState(null, '', '/party/p1?src=link#t=abcdabcdabcdabcdabcdabcdabcdabcd');
    render(
      <LateInviteCard
        state="started"
        partyTitle="Office Swap"
        hostFirstName="Dana"
        showSignIn
      />,
    );
    screen.getByRole('button', { name: LATE_INVITE_COPY.lateSignInLink }).click();
    expect(window.sessionStorage.getItem('redirectAfterAuth')).toBe('/party/p1?src=link');
    expect(window.sessionStorage.getItem('redirectAfterAuth')).not.toMatch(/#t=/);
    expect(signInWithGoogle).toHaveBeenCalledTimes(1);
  });
});

describe('takeRedirectAfterAuth (Home after sign-in)', () => {
  it('navigates to a same-origin path and clears the stored value', () => {
    const storage = {
      getItem: () => '/party/p1',
      removeItem: vi.fn(),
    };
    const navigate = vi.fn();
    expect(takeRedirectAfterAuth(storage, navigate)).toBe(true);
    expect(navigate).toHaveBeenCalledWith('/party/p1');
    expect(storage.removeItem).toHaveBeenCalledWith('redirectAfterAuth');
  });

  it('still navigates after stripping a leftover #t= from a stored value', () => {
    const storage = {
      getItem: () => '/party/p1#t=abcdabcdabcdabcdabcdabcdabcdabcd',
      removeItem: vi.fn(),
    };
    const navigate = vi.fn();
    expect(takeRedirectAfterAuth(storage, navigate)).toBe(true);
    expect(navigate).toHaveBeenCalledWith('/party/p1');
  });

  it('does not navigate to // or \\, and still clears the stored value', () => {
    const navigate = vi.fn();
    for (const bad of ['//evil.example', '/\\evil', '\\party', 'https://evil.example']) {
      const storage = {
        getItem: () => bad,
        removeItem: vi.fn(),
      };
      expect(takeRedirectAfterAuth(storage, navigate)).toBe(false);
      expect(storage.removeItem).toHaveBeenCalledWith('redirectAfterAuth');
    }
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does nothing when the key is missing', () => {
    const storage = {
      getItem: () => null,
      removeItem: vi.fn(),
    };
    const navigate = vi.fn();
    expect(takeRedirectAfterAuth(storage, navigate)).toBe(false);
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
