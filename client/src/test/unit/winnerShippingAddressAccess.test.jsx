import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const clientSrc = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('winner shipping address client access', () => {
  it('GiftToSendCard does not read winner shippingAddress from Firestore', () => {
    const source = readFileSync(join(clientSrc, 'components/GiftToSendCard.jsx'), 'utf8');
    expect(source).not.toMatch(/firebase\/firestore/);
    expect(source).not.toMatch(/onSnapshot/);
    expect(source).toContain('fetchWinnerShippingAddress');
  });

  it('ShippingAddressViewModal uses sender-scoped API', () => {
    const source = readFileSync(join(clientSrc, 'components/ShippingAddressViewModal.jsx'), 'utf8');
    expect(source).not.toMatch(/firebase\/firestore/);
    expect(source).toContain('fetchWinnerShippingAddress');
  });

  it('address forms persist sender share consent field name', () => {
    const addressModal = readFileSync(join(clientSrc, 'components/AddressModal.jsx'), 'utf8');
    const profile = readFileSync(join(clientSrc, 'pages/Profile.jsx'), 'utf8');
    expect(addressModal).toContain('shippingAddressSenderShareConsentAt');
    expect(profile).toContain('shippingAddressSenderShareConsentAt');
    expect(addressModal).toContain('SHIPPING_ADDRESS_SENDER_SHARE_CONSENT_LABEL');
    expect(profile).toContain('SHIPPING_ADDRESS_SENDER_SHARE_CONSENT_LABEL');
  });

  it('sender address UI uses Copywriter placeholder constants for new strings', () => {
    const giftToSend = readFileSync(join(clientSrc, 'components/GiftToSendCard.jsx'), 'utf8');
    const viewModal = readFileSync(join(clientSrc, 'components/ShippingAddressViewModal.jsx'), 'utf8');
    const addressModal = readFileSync(join(clientSrc, 'components/AddressModal.jsx'), 'utf8');
    const profile = readFileSync(join(clientSrc, 'pages/Profile.jsx'), 'utf8');
    const copyModule = readFileSync(join(clientSrc, 'utils/shippingAddressCopy.js'), 'utf8');

    expect(giftToSend).toContain('SHIPPING_ADDRESS_WINNER_NOT_SHARED_GIFT_TO_SEND');
    expect(viewModal).toContain('SHIPPING_ADDRESS_WINNER_NOT_SHARED_VIEW_MODAL');
    expect(addressModal).toContain('SHIPPING_ADDRESS_CONSENT_REQUIRED_ADDRESS_MODAL');
    expect(profile).toContain('SHIPPING_ADDRESS_CONSENT_REQUIRED_PROFILE');

    expect(giftToSend).not.toContain('missing address or consent');
    expect(viewModal).not.toContain('missing address or consent');
    expect(copyModule).toContain('SHIPPING_ADDRESS_WINNER_NOT_SHARED_GIFT_TO_SEND');
    expect(copyModule).toContain('TODO(Copywriter)');
  });
});
