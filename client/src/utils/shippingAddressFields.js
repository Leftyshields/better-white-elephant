export const SHIPPING_FIELD_KEYS = ['name', 'street', 'city', 'state', 'zip', 'country'];

export const SHIPPING_FIELD_MAX_LENGTH = {
  name: 100,
  street: 200,
  city: 100,
  state: 50,
  zip: 20,
  country: 60,
};

function fieldValueTrimmed(address, key) {
  return String(address?.[key] ?? '').trim();
}

export function hasCompleteShippingFields(address) {
  return SHIPPING_FIELD_KEYS.every((key) => Boolean(fieldValueTrimmed(address, key)));
}

export function trimShippingAddress(address) {
  return SHIPPING_FIELD_KEYS.reduce((acc, key) => {
    acc[key] = fieldValueTrimmed(address, key);
    return acc;
  }, {});
}

export function normalizeShippingAddressFromStorage(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  return trimShippingAddress(raw);
}