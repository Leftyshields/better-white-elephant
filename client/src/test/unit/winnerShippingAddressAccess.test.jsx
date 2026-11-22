import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const clientSrc = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(join(clientSrc, path), 'utf8');

describe('shipping address client access (A0 per-game address)', () => {
  it('GiftToSendCard does not read winner shippingAddress from Firestore', () => {
    const source = read('components/GiftToSendCard.jsx');
    expect(source).not.toMatch(/firebase\/firestore/);
    expect(source).not.toMatch(/onSnapshot/);
    expect(source).toContain('fetchWinnerShippingAddress');
  });

  it('ShippingAddressViewModal uses sender-scoped API', () => {
    const source = read('components/ShippingAddressViewModal.jsx');
    expect(source).not.toMatch(/firebase\/firestore/);
    expect(source).toContain('fetchWinnerShippingAddress');
  });

  it('the per-game form talks only to the server route, never Firestore', () => {
    const source = read('components/ShippingAddressSection.jsx');
    expect(source).not.toMatch(/firebase\/firestore/);
    expect(source).toContain('saveMyPartyShipping');
    expect(source).toContain('fetchMyPartyShipping');
  });

  it('no client code reads or writes a profile address or the consent stamp any more', () => {
    for (const path of ['pages/Profile.jsx', 'hooks/useAuth.js', 'components/PartyLobby.jsx', 'components/GameBoard.jsx']) {
      const source = read(path);
      expect(source, path).not.toContain('shippingAddressSenderShareConsentAt');
      expect(source, path).not.toMatch(/shippingAddress\s*:/);
      expect(source, path).not.toContain('userData.shippingAddress');
    }
    expect(existsSync(join(clientSrc, 'components/AddressModal.jsx'))).toBe(false);
  });

  it('no checkbox, agreement or notice line in the copy module (Brian, Nov 21)', () => {
    const copyModule = read('utils/shippingAddressCopy.js');
    expect(copyModule).toContain("The winner hasn't shared a shipping address yet.");
    expect(copyModule).toContain("heading: 'Shipping address'");
    expect(copyModule).not.toMatch(/I agree|check the box|You must agree|Only .* sees your address/);
    expect(copyModule).not.toContain('[COPYWRITER PLACEHOLDER]');
    expect(copyModule).not.toContain('TODO(Copywriter)');
  });
});
