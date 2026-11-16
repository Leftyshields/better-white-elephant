/**
 * Copywriter-final strings for invite join errors and host invite-link rotate.
 * Slot keys match the Copywriter brief (join.error.* / host.invite.*).
 */

export const PARTY_INVITE_COPY = {
  'join.error.link_invalid':
    "This invite link doesn't work anymore. Ask your host for a new one.",
  'join.error.party_full': 'This party is full, so there are no spots left.',
  'join.error.started': "This game has already started, so you can't join it.",
  'host.invite.rotate_cta': 'Make a new invite link',
  'host.invite.rotate_helper':
    'Your old link and any invites you already sent will stop working.',
  'host.invite.rotate_done': 'New link ready. Resend any invites you still need.',
};

export const JOIN_ERROR_LINK_INVALID = PARTY_INVITE_COPY['join.error.link_invalid'];
export const JOIN_ERROR_PARTY_FULL = PARTY_INVITE_COPY['join.error.party_full'];
export const JOIN_ERROR_STARTED = PARTY_INVITE_COPY['join.error.started'];
export const HOST_INVITE_ROTATE_CTA = PARTY_INVITE_COPY['host.invite.rotate_cta'];
export const HOST_INVITE_ROTATE_HELPER = PARTY_INVITE_COPY['host.invite.rotate_helper'];
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

/**
 * Map party doc fields (read before joining) to a join-refusal message.
 * status != LOBBY -> started; participantCount >= 30 -> full; else link_invalid
 * (permission-denied / missing / rotated token).
 *
 * @param {{ status?: string, participantCount?: number } | null | undefined} party
 */
export function getJoinErrorMessage(party) {
  if (party && party.status !== 'LOBBY') {
    return JOIN_ERROR_STARTED;
  }
  if (typeof party?.participantCount === 'number' && party.participantCount >= 30) {
    return JOIN_ERROR_PARTY_FULL;
  }
  return JOIN_ERROR_LINK_INVALID;
}
