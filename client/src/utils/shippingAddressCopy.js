/**
 * User-facing strings for shipping addresses (in-app).
 *
 * A0 (per-game address, Nov 21): no checkbox, no agreement, no notice line. Saving is the share.
 * Brian 5:45 PM PT: a visible 'Shipping address' heading. Copywriter 5:41: 'Save address', 'Edit',
 * aria 'Edit your address'. Field labels, placeholders, loading, saving, and the delete confirm are
 * the existing signed strings, moved here from Profile and AddressModal unchanged. Clear-address
 * confirm: Copywriter final 7:01 PM PT Nov 21.
 */

export const SHIPPING_ADDRESS_WINNER_NOT_SHARED_GIFT_TO_SEND =
  "The winner hasn't shared a shipping address yet.";

export const SHIPPING_ADDRESS_WINNER_NOT_SHARED_VIEW_MODAL =
  "The winner hasn't shared a shipping address yet.";

export const SHIPPING_ADDRESS_DELETE_CONFIRM =
  "This removes your address from this game. The person mailing your gift won't be able to see it.";

export const SHIPPING_ADDRESS_DELETE_CONFIRM_ACTION = 'Delete address';

export const SHIPPING_ADDRESS_CANCEL = 'Cancel';

export const SHIPPING_ADDRESS_DELETE_SUCCESS = 'Your shipping address was deleted.';

export const PROFILE_SAVE_SUCCESS_MESSAGE = 'Profile updated successfully!';

export const SHIPPING_ADDRESS_FORM_COPY = Object.freeze({
  heading: 'Shipping address',
  save: 'Save address',
  saving: 'Saving...',
  edit: 'Edit',
  editAria: 'Edit your address',
  loading: 'Loading your address...',
  retry: 'Try again',
  fields: Object.freeze({
    name: { label: 'Full Name', placeholder: 'Enter your full name' },
    street: { label: 'Street Address', placeholder: '123 Main St' },
    city: { label: 'City', placeholder: 'City' },
    state: { label: 'State/Province', placeholder: 'State' },
    zip: { label: 'ZIP/Postal Code', placeholder: '12345' },
    country: { label: 'Country', placeholder: 'Country' },
  }),
  // Copywriter final (7:01 PM PT Nov 21). They show only on a real failed request.
  loadFailed: "We couldn't load your address.",
  saveFailed: "We couldn't save your address. Try again.",
  deleteFailed: "We couldn't delete your address. Try again.",
});
