/**
 * Shipping address normalization for the per-game doc parties/{partyId}/shipping/{uid} (A0).
 * The doc existing is the share; there is no separate consent stamp.
 * Keep in sync with server/lib/party-shipping.js (pickStoredShipping).
 */
const SHIPPING_ADDRESS_KEYS = ['name', 'street', 'city', 'state', 'zip', 'country'];

export function pickShippingAddress(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const picked = {};
  for (const key of SHIPPING_ADDRESS_KEYS) {
    if (raw[key] == null) {
      continue;
    }
    const trimmed = String(raw[key]).trim();
    if (trimmed) {
      picked[key] = trimmed;
    }
  }
  const hasStreet = picked.street && picked.city;
  return hasStreet ? picked : null;
}
