/**
 * User-facing in-game toast and validation messages (not game rule logic).
 */
import {
  SOCKET_ACTION_FAILED_GENERIC_MESSAGE,
  SOCKET_CONNECTION_LOST_MESSAGE,
  SOCKET_GAME_STATE_LOAD_FAILED_MESSAGE,
  SOCKET_GAME_STATE_LOADING_MESSAGE,
  SOCKET_GAME_STATE_STALE_MOVE_MESSAGE,
} from '../../../shared/socket-error-copy.mjs';

export const GAME_USER_COPY = {
  gameInactive: "The game hasn't started, or it has already ended.",
  gameStateLoading: SOCKET_GAME_STATE_LOADING_MESSAGE,
  gameStateStaleMove: SOCKET_GAME_STATE_STALE_MOVE_MESSAGE,
  gameStateLoadFailed: SOCKET_GAME_STATE_LOAD_FAILED_MESSAGE,
  actionFailedGeneric: SOCKET_ACTION_FAILED_GENERIC_MESSAGE,
  connectionLost: SOCKET_CONNECTION_LOST_MESSAGE,
  giftNotInWrappedPile: "That gift isn't available to open. Pick a wrapped gift.",
  notYourTurn: "It's not your turn yet.",
  cannotOpenGift: "You can't open that gift right now.",
  cannotStealGift: "You can't steal that gift right now.",
  endGameConfirm:
    'End the game now? The gifts people hold will be final, and leftover wrapped gifts will be assigned.',
  frozenGift: "This gift is frozen (3 steals). It can't be stolen again.",
  alreadyHaveGiftBoomerang: 'You already have a gift. You can swap once the boomerang round starts.',
  stealBackSameTurn:
    "You can't steal back a gift right after it was taken from you. Pick a different one.",
  boomerangBannerActive: 'Boomerang round',
  boomerangBannerOn: 'Boomerang is on: you can swap even if you already have a gift.',
  waitingForHostEnd: '🎉 All gifts are frozen! Waiting for the host to end the game.',
  afterGameHeading: "Here's what you won, and what you need to ship.",
};