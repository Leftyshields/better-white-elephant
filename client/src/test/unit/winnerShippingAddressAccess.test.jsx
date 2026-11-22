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

  it('pins the Copywriter A0 finals (7:01 PM PT Nov 21)', async () => {
    const copy = await import('../../utils/shippingAddressCopy.js');
    expect(copy.SHIPPING_ADDRESS_FORM_COPY.loadFailed).toBe("We couldn't load your address.");
    expect(copy.SHIPPING_ADDRESS_FORM_COPY.saveFailed).toBe("We couldn't save your address. Try again.");
    expect(copy.SHIPPING_ADDRESS_FORM_COPY.deleteFailed).toBe("We couldn't delete your address. Try again.");
    expect(copy.SHIPPING_ADDRESS_DELETE_CONFIRM).toBe(
      "This removes your address from this game. The person mailing your gift won't be able to see it.",
    );
    expect(copy.SHIPPING_ADDRESS_DELETE_SUCCESS).toBe('Your shipping address was deleted.');
  });

  it('the giver view modal uses the signed not-shared string, not the old unsigned line', () => {
    const viewModal = read('components/ShippingAddressViewModal.jsx');
    expect(viewModal).not.toContain('Winner has not provided their shipping address yet.');
    expect(viewModal).toContain('{SHIPPING_ADDRESS_WINNER_NOT_SHARED_VIEW_MODAL}');
  });
});
