/**
 * Winner shipping address consent and normalization.
 * Keep in sync with server/utils/winner-shipping-address.js (hasSenderShareConsent, pickShippingAddress).
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

export function hasSenderShareConsent(userData) {
  const consentAt = userData?.shippingAddressSenderShareConsentAt;
  if (!consentAt) {
    return false;
  }
  if (consentAt instanceof Date) {
    return !Number.isNaN(consentAt.getTime());
  }
  if (typeof consentAt === 'object' && typeof consentAt.toDate === 'function') {
    return true;
  }
  if (typeof consentAt === 'string' || typeof consentAt === 'number') {
    const d = new Date(consentAt);
    return !Number.isNaN(d.getTime());
  }
  return false;
}