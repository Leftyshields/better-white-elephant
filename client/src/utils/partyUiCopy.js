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

/** Firestore allows party delete only when status is ENDED or CANCELLED (see firestore.rules). */
export function hostCanDeletePartyFromHome(party) {
  if (!party?.isAdmin) {
    return false;
  }
  return party.status === 'ENDED' || party.status === 'CANCELLED';
}

export function homeDeletePartyTitle(partyTitle) {
  const title = typeof partyTitle === 'string' ? partyTitle.trim() : '';
  return title ? `Delete ${title}?` : 'Delete this party?';
}

export const HOME_DELETE_PARTY_COPY = {
  untitledTitle: 'Delete this party?',
  body: "You can't undo this.",
  cancel: 'Cancel',
  confirm: 'Delete party',
  success: 'Party deleted.',
  error: "Couldn't delete the party. Try again.",
};
