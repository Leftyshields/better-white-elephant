import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  displayNameForFirestoreDoc,
  looksLikeEmail,
  publicDisplayNameFromUserDoc,
} from '../../utils/firestoreDisplayName.js';

const clientSrc = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('displayNameForFirestoreDoc', () => {
  it('never returns a value containing @', () => {
    const cases = [
      displayNameForFirestoreDoc({ authDisplayName: 'alice@example.com' }),
      displayNameForFirestoreDoc({ existingDisplayName: 'bob@corp.test' }),
      displayNameForFirestoreDoc({ formDisplayName: '' }),
      displayNameForFirestoreDoc({
        authDisplayName: 'charlie@example.com',
        formDisplayName: '',
      }),
    ];
    for (const value of cases) {
      expect(looksLikeEmail(value)).toBe(false);
      expect(value).not.toContain('@');
    }
  });

  it('profile save with empty form and no auth displayName stores empty string', () => {
    const stored = displayNameForFirestoreDoc({
      authDisplayName: null,
      formDisplayName: '',
    });
    expect(stored).toBe('');
    expect(stored).not.toContain('@');
  });

  it('uses non-email auth displayName when form is empty', () => {
    expect(
      displayNameForFirestoreDoc({
        authDisplayName: 'River Host',
        formDisplayName: '',
      }),
    ).toBe('River Host');
  });

  it('rejects legacy email-shaped existing displayName on auth sync', () => {
    expect(
      displayNameForFirestoreDoc({
        authDisplayName: null,
        existingDisplayName: 'legacy@example.com',
      }),
    ).toBe('');
  });

  it('hides email-shaped names on public user-doc reads', () => {
    expect(publicDisplayNameFromUserDoc('Host Name')).toBe('Host Name');
    expect(publicDisplayNameFromUserDoc('legacy@example.com')).toBeNull();
  });
});

describe('Profile Firestore writes', () => {
  const profile = readFileSync(join(clientSrc, 'pages/Profile.jsx'), 'utf8');

  it('does not fall back to user.email when persisting displayName', () => {
    expect(profile).toContain('displayNameForFirestoreDoc');
    expect(profile).not.toMatch(/displayName:\s*displayName\s*\|\|\s*user\.email/);
  });
});