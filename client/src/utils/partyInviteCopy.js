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
  // Party-code spec Rev 2/3 (Copywriter final): rotate replaces the code and the link together.
  'host.invite.rotate_cta': 'Make a new code and link',
  'host.invite.rotate_helper':
    'Your old code and link will stop working, including any invites you already sent.',
  'host.invite.rotate_confirm': 'Make new code and link',
  'host.invite.rotate_failed': "Couldn't make a new code and link. Your old ones still work.",
  'host.invite.rotate_retry': 'Try again',
  'host.invite.rotate_done':
    'Your new code and link are ready. Resend them to anyone who still needs to join.',
  'host.share.load_failed': "Couldn't load your party code and link. Refresh to try again.",
  'host.share.title': 'Share your party',
  'host.share.intro': 'Send guests the party code or the link. Either one gets them in.',
  'host.share.code.label': 'Party code',
  'host.share.code.copy': 'Copy code',
  'host.share.link.copy': 'Copy link',
  'host.share.code.copy_done': 'Copied!',
  'host.share.link.copy_done': 'Copied!',
  'host.share.code.copy_status': 'Party code copied.',
  'host.share.code.copy_name': 'Copy party code',
  'host.share.link.copy_name': 'Copy invite link',
  // Home "Join a party" (8-character codes, Copywriter final Nov 21).
  'home.join.title': 'Join a party',
  'home.join.helper': 'Enter the 8-character code from your host.',
  'home.join.label': 'Party code',
  'home.join.placeholder': 'XXXX-XXXX',
  'home.join.cta': 'Join',
  'home.join.checking': 'Checking...',
  'home.join.error.format':
    'Codes have 8 letters and numbers, like KX7P-4MRB. They never use 0, O, 1, I, L, or U.',
  'home.join.error.generic': "That code didn't get you in. Check it with your host, or try again later.",
  'home.join.error.full': 'This party is full. Every spot is taken.',
  'home.join.hint.excluded': "Codes don't use 0, O, 1, I, L, or U.",
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
export const HOST_SHARE_LOAD_FAILED = PARTY_INVITE_COPY['host.share.load_failed'];

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
