/**
 * Google sign-in must use the custom auth domain so the popup
 * and redirect show stealorreveal.com, not the default Firebase domain.
 * Production builds still need VITE_FIREBASE_AUTH_DOMAIN set to
 * stealorreveal.com (the Hosting deploy secret). This fallback
 * covers a missing or blank env value.
 */
export const DEFAULT_AUTH_DOMAIN = 'stealorreveal.com';

export function resolveAuthDomain(envAuthDomain) {
  if (typeof envAuthDomain !== 'string') {
    return DEFAULT_AUTH_DOMAIN;
  }
  const value = envAuthDomain.trim();
  return value || DEFAULT_AUTH_DOMAIN;
}
