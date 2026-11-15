/**
 * Helpers for display names stored on users/{uid} (may be publicly readable).
 * Never persist a full email address as displayName.
 */

function trimmed(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function looksLikeEmail(value) {
  return trimmed(value).includes('@');
}

/**
 * Safe displayName to persist on users/{uid}.
 *
 * @param {object} options
 * @param {string} [options.authDisplayName] - Firebase Auth displayName
 * @param {string} [options.existingDisplayName] - Current Firestore displayName
 * @param {string} [options.formDisplayName] - Profile/signup form value (honored when provided)
 */
export function displayNameForFirestoreDoc({
  authDisplayName,
  existingDisplayName,
  formDisplayName,
} = {}) {
  if (formDisplayName !== undefined) {
    const form = trimmed(formDisplayName);
    if (form && !looksLikeEmail(form)) {
      return form;
    }
    const auth = trimmed(authDisplayName);
    if (auth && !looksLikeEmail(auth)) {
      return auth;
    }
    return '';
  }

  const auth = trimmed(authDisplayName);
  if (auth && !looksLikeEmail(auth)) {
    return auth;
  }

  const existing = trimmed(existingDisplayName);
  if (existing && !looksLikeEmail(existing)) {
    return existing;
  }

  return '';
}

/**
 * displayName from a public users/{uid} read — hide legacy email-shaped values.
 */
export function publicDisplayNameFromUserDoc(displayName) {
  const value = trimmed(displayName);
  if (!value || looksLikeEmail(value)) {
    return null;
  }
  return value;
}