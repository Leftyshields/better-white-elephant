/**
 * Copywriter-final strings for invite join errors and host invite-link rotate.
 * Slot keys match the Copywriter brief (join.error.* / host.invite.*).
 */

export const PARTY_INVITE_COPY = {
  'join.error.link_invalid':
    "This invite link doesn't work anymore. Ask your host for a new one.",
  'join.error.party_full': 'This party is full, so there are no spots left.',
  'join.error.started': "This game has already started, so you can't join it.",
  'join.error.cancelled': 'This party was canceled.',
  'join.error.generic':
    "We couldn't get you into this party. Try again in a moment.",
  'host.invite.rotate_cta': 'Make a new invite link',
  'host.invite.rotate_helper':
    'Your old link and any invites you already sent will stop working.',
  'host.invite.rotate_confirm': 'Make new link',
  'host.invite.rotate_failed':
    "We couldn't make a new link. Your old one still works.",
  'host.invite.rotate_retry': 'Try again',
  'host.invite.rotate_done': 'New link ready. Resend any invites you still need.',
};

export const JOIN_ERROR_LINK_INVALID = PARTY_INVITE_COPY['join.error.link_invalid'];
export const JOIN_ERROR_PARTY_FULL = PARTY_INVITE_COPY['join.error.party_full'];
export const JOIN_ERROR_STARTED = PARTY_INVITE_COPY['join.error.started'];
export const JOIN_ERROR_CANCELLED = PARTY_INVITE_COPY['join.error.cancelled'];
export const JOIN_ERROR_GENERIC = PARTY_INVITE_COPY['join.error.generic'];
export const HOST_INVITE_ROTATE_CTA = PARTY_INVITE_COPY['host.invite.rotate_cta'];
export const HOST_INVITE_ROTATE_HELPER = PARTY_INVITE_COPY['host.invite.rotate_helper'];
export const HOST_INVITE_ROTATE_CONFIRM = PARTY_INVITE_COPY['host.invite.rotate_confirm'];
export const HOST_INVITE_ROTATE_FAILED = PARTY_INVITE_COPY['host.invite.rotate_failed'];
export const HOST_INVITE_ROTATE_RETRY = PARTY_INVITE_COPY['host.invite.rotate_retry'];
export const HOST_INVITE_ROTATE_DONE = PARTY_INVITE_COPY['host.invite.rotate_done'];

/** Firebase Auth provider id for Google hosts (matches server HOST_SIGN_IN_PROVIDER). */
export const GOOGLE_SIGN_IN_PROVIDER = 'google.com';

/**
 * True when the signed-in user has a Google provider linked (host gate on the client).
 * @param {{ providerData?: Array<{ providerId?: string }> } | null | undefined} user
 */
export function userSignedInWithGoogle(user) {
  return (
    Array.isArray(user?.providerData) &&
    user.providerData.some((p) => p?.providerId === GOOGLE_SIGN_IN_PROVIDER)
  );
}

function isPermissionDenied(error) {
  const code = error?.code;
  return code === 'permission-denied' || code === 'firestore/permission-denied';
}

function isPartyFull(party) {
  return typeof party?.participantCount === 'number' && party.participantCount >= 30;
}

/**
 * Map pre-join party state + join failure to a Copywriter message.
 * Order: cancelled -> started -> full -> missing token -> permission-denied (stale/rotated) -> generic.
 * If the party read failed (party null/unknown), do not guess started/full/cancelled.
 *
 * @param {{
 *   party?: { status?: string, participantCount?: number } | null,
 *   error?: { code?: string } | null,
 *   hasToken?: boolean,
 * }} args
 */
export function getJoinErrorMessage({ party, error, hasToken } = {}) {
  if (party?.status === 'CANCELLED') {
    return JOIN_ERROR_CANCELLED;
  }
  if (party && party.status !== 'LOBBY') {
    return JOIN_ERROR_STARTED;
  }
  if (party && isPartyFull(party)) {
    return JOIN_ERROR_PARTY_FULL;
  }
  if (!hasToken) {
    return JOIN_ERROR_LINK_INVALID;
  }
  if (isPermissionDenied(error) && party?.status === 'LOBBY' && !isPartyFull(party)) {
    return JOIN_ERROR_LINK_INVALID;
  }
  return JOIN_ERROR_GENERIC;
}
