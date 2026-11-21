/**
 * Late invite to an ACTIVE or ENDED game (BUG-21).
 * Copy is Copywriter-signed (2026-11-21 BUG-21 set). lateGoHome reuses goHome.
 * Do not reuse join.error.started for the started body.
 */
import { GUEST_JOIN_COPY } from './guestJoinCopy.js';

export const LATE_INVITE_COPY = {
  gameAlreadyStartedHeading: 'This game has already started',
  gameAlreadyStartedBody: "New players can't join once a game is underway.",
  gameAlreadyOverHeading: 'This game is over',
  gameAlreadyOverBody: "It already ended, so there's nothing to join.",
  lateSignInLink: 'Already playing? Sign in to get back in.',
  lateGoHome: GUEST_JOIN_COPY.goHome,
};

/**
 * Party line for the late card. The title is inserted as-is; the card truncates
 * a long title the same way the robbed line does (CSS truncate on the title).
 * Omit the host clause when hostFirstName is null or empty.
 */
export function latePartyLine(partyTitle, hostFirstName) {
  const title = typeof partyTitle === 'string' ? partyTitle.trim() : '';
  const host = typeof hostFirstName === 'string' ? hostFirstName.trim() : '';
  if (host) {
    return { prefix: 'This link is for ', title, suffix: `, hosted by ${host}.` };
  }
  return { prefix: 'This link is for ', title, suffix: '.' };
}

export function formatLatePartyLine(partyTitle, hostFirstName) {
  const { prefix, title, suffix } = latePartyLine(partyTitle, hostFirstName);
  return `${prefix}${title}${suffix}`;
}

/**
 * @param {{ status?: string } | null | undefined} party
 * @param {'checking'|'seated'|'not-seated'|'error'|null|undefined} seat
 * @returns {'started'|'over'|null}
 */
export function lateVisitorState(party, seat) {
  if (seat !== 'not-seated') {
    return null;
  }
  if (party?.status === 'ACTIVE') {
    return 'started';
  }
  if (party?.status === 'ENDED') {
    return 'over';
  }
  return null;
}
