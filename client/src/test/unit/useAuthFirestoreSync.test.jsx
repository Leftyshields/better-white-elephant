import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const useAuthSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../hooks/useAuth.js'),
  'utf8',
);

describe('useAuth Firestore sync', () => {
  it('only includes shippingAddress when one already exists on the user doc', () => {
    expect(useAuthSrc).toMatch(/if \(existingData\.shippingAddress != null\)/);
    expect(useAuthSrc).not.toMatch(/shippingAddress:\s*existingData\.shippingAddress\s*\|\|\s*null/);
  });

  it('does not deleteField or overwrite shippingAddress during auth sync', () => {
    expect(useAuthSrc).not.toMatch(/shippingAddress:\s*deleteField/);
    expect(useAuthSrc).toMatch(/syncPayload\.shippingAddress = existingData\.shippingAddress/);
  });
});