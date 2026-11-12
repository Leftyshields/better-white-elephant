/**
 * User-facing in-game toast and validation messages (not game rule logic).
 */

export const GAME_USER_COPY = {
  gameInactive: "The game hasn't started, or it has already ended.",
  gameStateLoading: "We're still loading the game. Refresh if this doesn't clear.",
  endGameConfirm:
    'End the game now? The gifts people hold will be final, and leftover wrapped gifts will be assigned.',
  frozenGift: "This gift is frozen (3 steals). It can't be stolen again.",
  alreadyHaveGiftBoomerang: 'You already have a gift. You can swap once the boomerang round starts.',
  stealBackSameTurn: "You can't steal that gift back on the same turn.",
  boomerangBannerActive: 'Boomerang round',
  boomerangBannerOn: 'Boomerang is on: you can swap even if you already have a gift.',
  waitingForHostEnd: '🎉 All gifts are frozen! Waiting for the host to end the game.',
  afterGameHeading: "Here's what you won, and what you need to ship.",
};
