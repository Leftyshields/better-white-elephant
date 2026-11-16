/**
 * Host gate for the game server. Hosts must be signed in with Google.
 * Reads the provider from the VERIFIED Firebase ID token (decoded by auth.verifyIdToken).
 * Never use email, email_verified, or "has a token" as proof of a real host.
 */

export const HOST_SIGN_IN_PROVIDER = 'google.com';

/**
 * @param {{ firebase?: { sign_in_provider?: string } } | null | undefined} decodedToken
 */
export function isGoogleSignIn(decodedToken) {
  return decodedToken?.firebase?.sign_in_provider === HOST_SIGN_IN_PROVIDER;
}

/**
 * True only when the verified caller owns the party AND signed in with Google.
 * @param {{ adminId?: string } | null | undefined} party
 * @param {{ uid?: string, firebase?: { sign_in_provider?: string } } | null | undefined} decodedToken
 */
export function isPartyHostCaller(party, decodedToken) {
  const uid = decodedToken?.uid;
  return (
    !!party &&
    typeof uid === 'string' &&
    uid.length > 0 &&
    party.adminId === uid &&
    isGoogleSignIn(decodedToken)
  );
}
