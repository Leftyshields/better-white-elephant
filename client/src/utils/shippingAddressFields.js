export const SHIPPING_FIELD_KEYS = ['name', 'street', 'city', 'state', 'zip', 'country'];

export function hasCompleteShippingFields(address) {
  return SHIPPING_FIELD_KEYS.every((key) => Boolean(address?.[key]?.trim()));
}

export function trimShippingAddress(address) {
  return SHIPPING_FIELD_KEYS.reduce((acc, key) => {
    acc[key] = address[key]?.trim() ?? '';
    return acc;
  }, {});
}