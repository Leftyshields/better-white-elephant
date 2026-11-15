import { hasCompleteShippingFields, SHIPPING_FIELD_KEYS } from '../../utils/shippingAddressFields.js';

export const LOBBY_STEP_STATUS = {
  LOCKED: 'LOCKED',
  ACTIVE: 'ACTIVE',
  DONE: 'DONE',
  WAITING: 'WAITING',
};

export function addressSummaryCity(shippingAddress) {
  if (!shippingAddress?.city?.trim()) {
    return '';
  }
  return shippingAddress.city.trim();
}

export function isAddressStepDone(shippingAddress) {
  return hasCompleteShippingFields(shippingAddress || {});
}

export function guestReadyMissingKeys({ hasGift, hasAddress }) {
  if (!hasGift && !hasAddress) {
    return 'both';
  }
  if (!hasGift) {
    return 'gift';
  }
  if (!hasAddress) {
    return 'address';
  }
  return null;
}

export function guestReadyLockedStringKey(missingKey) {
  if (missingKey === 'gift') return 'guest.ready.locked.gift';
  if (missingKey === 'address') return 'guest.ready.locked.address';
  if (missingKey === 'both') return 'guest.ready.locked.both';
  return null;
}

export function hostStartMissingToken(missingKey) {
  if (missingKey === 'gift') return 'guest.ready.missing.gift';
  if (missingKey === 'address') return 'guest.ready.missing.address';
  if (missingKey === 'both') return 'guest.ready.missing.both';
  return '';
}

export function areAllShippingFieldsEmpty(address) {
  return SHIPPING_FIELD_KEYS.every((key) => !address?.[key]?.trim());
}