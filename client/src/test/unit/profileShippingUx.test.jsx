import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const clientSrc = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('Profile shipping UX must-fixes', () => {
  const profile = readFileSync(join(clientSrc, 'pages/Profile.jsx'), 'utf8');
  const copyModule = readFileSync(join(clientSrc, 'utils/shippingAddressCopy.js'), 'utf8');
  const addressModal = readFileSync(join(clientSrc, 'components/AddressModal.jsx'), 'utf8');

  it('includes SHIPPING_ADDRESS_SAVED_NEEDS_CONSENT_PROFILE final copy', () => {
    expect(copyModule).toContain('SHIPPING_ADDRESS_SAVED_NEEDS_CONSENT_PROFILE');
    expect(copyModule).toContain(
      "This address isn't shared with the person mailing your gift until you check the box and save.",
    );
  });

  it('Save is only disabled while saving (not when consent unchecked)', () => {
    expect(profile).toContain('const hasShippingFields = hasCompleteShippingFields(address)');
    expect(profile).toContain('const saveDisabled = saving');
    expect(profile).toContain('disabled={saveDisabled}');
    expect(profile).not.toContain('saveDisabled = saving || (hasShippingFields && !shareConsent)');
  });

  it('shows inline consent-required message instead of alert', () => {
    expect(profile).toContain('SHIPPING_ADDRESS_CONSENT_REQUIRED_PROFILE');
    expect(profile).toMatch(/hasShippingFields && !shareConsent[\s\S]*SHIPPING_ADDRESS_CONSENT_REQUIRED_PROFILE/);
    expect(profile).not.toContain('alert(SHIPPING_ADDRESS_CONSENT_REQUIRED_PROFILE)');
  });

  it('shows honesty note only for loaded saved address without persisted consent', () => {
    expect(profile).toContain('showSavedAddressNeedsConsentNote');
    expect(profile).toContain('SHIPPING_ADDRESS_SAVED_NEEDS_CONSENT_PROFILE');
    expect(profile).toContain('loadedHadCompleteAddress && !loadedHadConsent');
    expect(profile).toMatch(/hasShippingFields[\s\S]*setShowSavedAddressNeedsConsentNote\(!shareConsent\)/);
  });

  it('allows clearing address on save when fields empty', () => {
    expect(profile).toMatch(/else \{[\s\S]*shippingAddress = deleteField\(\)/);
  });
});

describe('AddressModal consent contrast', () => {
  it('uses text-slate-300 for consent label', () => {
    const addressModal = readFileSync(join(clientSrc, 'components/AddressModal.jsx'), 'utf8');
    expect(addressModal).toContain('text-sm text-slate-300 cursor-pointer');
    expect(addressModal).not.toMatch(/SHIPPING_ADDRESS_SENDER_SHARE_CONSENT_LABEL[\s\S]*text-gray-700/);
  });
});
