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

  it('does not show SHIPPING_ADDRESS_CONSENT_REQUIRED_PROFILE on Profile', () => {
    expect(profile).not.toContain('SHIPPING_ADDRESS_CONSENT_REQUIRED_PROFILE');
  });

  it('shows optional in-progress withdraw note via shippingAddressCopy constant', () => {
    expect(copyModule).toContain('SHIPPING_ADDRESS_CONSENT_WITHDRAW_PENDING_PROFILE');
    expect(copyModule).toContain(
      'This address will no longer be shared with the person mailing your gift when you save.',
    );
    expect(profile).toContain('SHIPPING_ADDRESS_CONSENT_WITHDRAW_PENDING_PROFILE');
    expect(profile).toContain('showConsentWithdrawPendingNote');
  });

  it('shows honesty note only for loaded saved address without persisted consent', () => {
    expect(profile).toContain('showSavedAddressNeedsConsentNote');
    expect(profile).toContain('SHIPPING_ADDRESS_SAVED_NEEDS_CONSENT_PROFILE');
    expect(profile).toContain('loadedHadCompleteAddress && !loadedHadConsent');
    expect(profile).toMatch(/hasShippingFields[\s\S]*setShowSavedAddressNeedsConsentNote\(!shareConsent\)/);
  });

  it('includes incomplete and delete-confirm copy constants', () => {
    expect(copyModule).toContain('SHIPPING_ADDRESS_INCOMPLETE_PROFILE');
    expect(copyModule).toContain('SHIPPING_ADDRESS_DELETE_CONFIRM_PROFILE');
    expect(copyModule).not.toContain('SHIPPING_ADDRESS_CONSENT_REQUIRED_PROFILE');
  });

  it('requires delete confirmation before deleteField on cleared saved address', () => {
    expect(profile).toContain('showDeleteAddressConfirm');
    expect(profile).toContain('deleteAddress: true');
    expect(profile).toContain('areAllShippingFieldsEmpty');
    expect(profile).toContain('showAddressIncompleteError');
  });
});

describe('AddressModal consent contrast', () => {
  it('uses text-slate-300 for consent label', () => {
    const addressModal = readFileSync(join(clientSrc, 'components/AddressModal.jsx'), 'utf8');
    expect(addressModal).toContain('text-sm text-slate-300 cursor-pointer');
    expect(addressModal).not.toMatch(/SHIPPING_ADDRESS_SENDER_SHARE_CONSENT_LABEL[\s\S]*text-gray-700/);
  });
});
