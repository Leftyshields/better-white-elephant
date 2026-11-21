/**
 * Guest one-screen join (batch 2 item 4). Every string is Copywriter-signed:
 * - Batch 2 slots: /home/box/.../2026-11-21-sor-polish-batch2.md (Nov 21)
 * - Onboarding / lobby slots (guest.welcome.*, guest.ready.*, guest.name.*, gift.*): Nov 15 sheet
 */
export const GUEST_JOIN_COPY = {
  // Batch 2 (Nov 21)
  stepsLeft: (remaining) => `${remaining} steps left`,
  oneStepLeft: '1 step left',
  allStepsDone: "Your name and gift are in. Tap I'm ready.",
  stepArrived: "You're here",
  readySaving: 'Saving...',
  joinFailedToast: "We couldn't get you ready. Try again in a moment.",
  // Onboarding / lobby (Nov 15)
  stepName: 'Your name',
  stepGift: 'Your gift',
  nameLabel: 'Your name',
  nameError: 'Add a first name or nickname, not an email.',
  welcomeTitle: (partyName) => `Hiya pal, welcome to ${partyName}!`,
  welcomeBody: (hostFirstName) =>
    hostFirstName
      ? `${hostFirstName} here. Please go find a gift and share it here. I'll wait.`
      : 'Please go find a gift and share it here. Your host will wait.',
  readyCta: "I'm ready",
  readyDone: "You're in! Hang tight while everyone else gets ready.",
  // [S:guest.welcome.done] Ready state: replaces welcomeBody under the same title (Nov 21).
  welcomeDone: (hostFirstName) =>
    hostFirstName
      ? `${hostFirstName} here. Thanks for the gift. See you at the game.`
      : 'Thanks for the gift. Your host will see you at the game.',
  readyUndo: 'Not ready yet',
  readyLockedName: "Add your name before you're ready.",
  readyLockedGift: "Add your gift before you're ready.",
  readyLockedSeat: "Saving your spot...",
  readySaveSlow: "That's taking too long. Your name and gift are still here. Tap I'm ready to try again.",
  // Copywriter-signed (Nov 21, 2026). Shown under "Not ready yet" when an undo
  // write times out. No dashes. "spot" is not used here; never say "seat".
  readyUndoSlow: "That's taking too long. Tap Not ready yet to try again.",
  giftStoreName: "That's the store, not the gift. What's the gift called?",
  giftManualHelper: "This store won't share its gift details with us. Add them below.",
  // Existing shipped lobby strings reused on the card
  giftUrlLabel: 'Gift URL',
  giftUrlPlaceholder: 'https://example.com/gift',
  giftTitleLabel: 'Gift Title',
  giftTitlePlaceholder: 'e.g., Wireless Headphones',
  giftPriceLabel: 'Price (optional)',
  giftPricePlaceholder: 'e.g., $25.99',
  giftPending: 'Processing...',
  giftChecking: 'Checking your gift link...',
  giftLookupSlow: 'That link is taking too long. Add the details below, or try it again.',
  giftManualToggle: 'Or enter details manually',
  giftTryUrl: 'Try the link again',
  goHome: 'Go Home',
  dismiss: 'Dismiss',
};

/** Header line above the progress strip: what's left, never "x complete" or a percent. */
export function guestStepsHeader(remaining) {
  if (remaining <= 0) return GUEST_JOIN_COPY.allStepsDone;
  if (remaining === 1) return GUEST_JOIN_COPY.oneStepLeft;
  return GUEST_JOIN_COPY.stepsLeft(remaining);
}
