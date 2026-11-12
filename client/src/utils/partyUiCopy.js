/**
 * User-facing party list and status labels.
 */

export function formatPartyStatus(status) {
  switch (status) {
    case 'LOBBY':
      return 'Lobby';
    case 'ACTIVE':
      return 'In progress';
    case 'ENDED':
      return 'Ended';
    case 'CANCELLED':
      return 'Canceled';
    default:
      return status;
  }
}

export function partyEntryButtonLabel(status) {
  if (status === 'LOBBY') {
    return 'Open lobby';
  }
  if (status === 'ACTIVE' || status === 'ENDED') {
    return 'Open game';
  }
  return 'Open lobby';
}

export const PARTIES_LOAD_ERROR =
  "Your parties couldn't load. Refresh the page, or try again in a few minutes.";
