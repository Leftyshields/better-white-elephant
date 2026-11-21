/**
 * After Google sign-in, Home reads sessionStorage.redirectAfterAuth and
 * navigates there. Only same-origin paths that start with exactly one '/'
 * are allowed (no '//' protocol-relative URLs, no backslash). Any #t= invite
 * token is stripped so it is not stored or replayed after auth.
 */

/**
 * @param {unknown} raw
 * @returns {string | null} a safe path+query (and any leftover hash), or null
 */
export function safeRedirectAfterAuth(raw) {
  if (typeof raw !== 'string' || raw.length === 0) {
    return null;
  }

  const hashIndex = raw.indexOf('#');
  const pathAndQuery = hashIndex === -1 ? raw : raw.slice(0, hashIndex);
  let hash = hashIndex === -1 ? '' : raw.slice(hashIndex);
  if (hash) {
    const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
    params.delete('t');
    const rest = params.toString();
    hash = rest ? `#${rest}` : '';
  }
  const next = `${pathAndQuery}${hash}`;

  if (!next.startsWith('/') || next.startsWith('//') || next.includes('\\')) {
    return null;
  }
  return next;
}

/** Value to store after sign-in: current path and query, with #t= removed. */
export function redirectAfterAuthFromLocation(loc = window.location) {
  if (!loc) return null;
  return safeRedirectAfterAuth(`${loc.pathname || ''}${loc.search || ''}${loc.hash || ''}`);
}

/**
 * Read and clear redirectAfterAuth. Navigate only when the stored value is a
 * safe same-origin path. Returns true when navigation was requested.
 */
export function takeRedirectAfterAuth(storage, navigate) {
  if (!storage || typeof storage.getItem !== 'function') {
    return false;
  }
  const stored = storage.getItem('redirectAfterAuth');
  if (stored === null) {
    return false;
  }
  storage.removeItem('redirectAfterAuth');
  const redirectPath = safeRedirectAfterAuth(stored);
  if (redirectPath && typeof navigate === 'function') {
    navigate(redirectPath);
    return true;
  }
  return false;
}
