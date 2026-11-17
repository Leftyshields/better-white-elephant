import { describe, expect, it } from 'vitest';
import { DEFAULT_AUTH_DOMAIN, resolveAuthDomain } from '../../utils/authDomain.js';

describe('resolveAuthDomain', () => {
  it('defaults to stealorreveal.com when the env value is missing or blank', () => {
    expect(DEFAULT_AUTH_DOMAIN).toBe('stealorreveal.com');
    expect(resolveAuthDomain(undefined)).toBe('stealorreveal.com');
    expect(resolveAuthDomain(null)).toBe('stealorreveal.com');
    expect(resolveAuthDomain('')).toBe('stealorreveal.com');
    expect(resolveAuthDomain('   ')).toBe('stealorreveal.com');
  });

  it('uses an explicit env value when one is set', () => {
    expect(resolveAuthDomain('stealorreveal.com')).toBe('stealorreveal.com');
    expect(resolveAuthDomain('test.firebaseapp.com')).toBe('test.firebaseapp.com');
  });
});
