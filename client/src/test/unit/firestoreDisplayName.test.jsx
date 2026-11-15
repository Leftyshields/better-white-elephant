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

describe('looksLikeEmail', () => {
  it('uses includes(@) for read and persist checks', () => {
    expect(looksLikeEmail('a@b.com')).toBe(true);
    expect(looksLikeEmail('Alex @ Home')).toBe(true);
    expect(looksLikeEmail('jane @ example.com')).toBe(true);
    expect(looksLikeEmail('River Host')).toBe(false);
  });
});

describe('displayNameForFirestoreDoc', () => {
  it('profile save with empty form stores empty string without auth fallback', () => {
    const stored = displayNameForFirestoreDoc({
      authDisplayName: 'Google Name',
      formDisplayName: '',
    });
    expect(stored).toBe('');
  });

  it('rejects any display name containing @', () => {
    expect(displayNameForFirestoreDoc({ formDisplayName: 'a@b.com' })).toBe('');
    expect(displayNameForFirestoreDoc({ formDisplayName: 'Alex @ Home' })).toBe('');
  });

  it('allows normal names on profile save', () => {
    expect(displayNameForFirestoreDoc({ formDisplayName: 'Alex' })).toBe('Alex');
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
    expect(publicDisplayNameFromUserDoc('Alex @ Home')).toBeNull();
  });
});

describe('Profile Firestore writes', () => {
  const profile = readFileSync(join(clientSrc, 'pages/Profile.jsx'), 'utf8');

  it('does not fall back to user.email when persisting displayName', () => {
    expect(profile).toContain('displayNameForFirestoreDoc');
    expect(profile).not.toMatch(/displayName:\s*displayName\s*\|\|\s*user\.email/);
  });
});