import lobbySetupStrings from '../copy/lobbySetupStrings.js';
import { interpolateLobbySetupString } from './interpolateLobbySetupString.js';
import { LOBBY_MISSING } from './computeLobbyReadiness.js';

export function formatHostStartLockedMissing(hostLockedMissing) {
  const needsGift = hostLockedMissing.includes(LOBBY_MISSING.GIFT);
  const needsAddress = hostLockedMissing.includes(LOBBY_MISSING.ADDRESS);
  if (needsGift && needsAddress) {
    return lobbySetupStrings['guest.ready.missing.both'];
  }
  if (needsGift) {
    return lobbySetupStrings['guest.ready.missing.gift'];
  }
  if (needsAddress) {
    return lobbySetupStrings['guest.ready.missing.address'];
  }
  return lobbySetupStrings['guest.ready.missing.gift'];
}

export function formatHostStartLockedMessage(hostLockedMissing) {
  const missing = formatHostStartLockedMissing(hostLockedMissing);
  return interpolateLobbySetupString(lobbySetupStrings['host.start.locked'], {
    missing,
  });
}

export function formatHostStartCount(readyCount, totalCount) {
  return interpolateLobbySetupString(lobbySetupStrings['host.start.count'], {
    ready: readyCount,
    total: totalCount,
  });
}

const WAIT_SLOT_BY_MISSING = {
  not_joined: 'wait.not_joined',
  gift: 'wait.gift',
  address: 'wait.address',
};

export function formatWaitLine(missingType, displayName) {
  const slot = WAIT_SLOT_BY_MISSING[missingType];
  if (!slot) {
    return null;
  }
  return interpolateLobbySetupString(lobbySetupStrings[slot], { name: displayName });
}