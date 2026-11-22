/**
 * G5 "What You Need to Send" address card strings.
 *
 * COPY STATUS: verbatim from the Copywriter's signed gameplay-review set
 * (drafts/2026-11-21-sor-gameplay-review-copy.md, section "G5 Address card (gift to send)").
 * Signed for copy only, not merge or go-live: Copywriter re-checks on the PR head SHA.
 * Do not edit these strings without a new Copywriter sign.
 *
 * The "not shared yet" line is the existing SHIPPING_ADDRESS_WINNER_NOT_SHARED_GIFT_TO_SEND
 * (utils/shippingAddressCopy.js), unchanged.
 */
export const GIFT_TO_SEND_COPY = Object.freeze({
  /** Visually hidden while the skeleton shows. */
  addressLoading: "Loading the winner's address",
  addressWillUpdate: 'It will show up here when they add it.',
  addressLoadFailed: "We couldn't load the winner's address.",
  addressRetry: 'Try again',
  addressRetryAria: 'Try loading the address again',
  noWinnerForYourGift: "No one won your gift, so there's nothing to mail.",
});
