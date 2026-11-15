/**
 * Call the sendPartyInvite Cloud Function with Firebase Auth.
 */
export function getSendPartyInviteUrl() {
  return (
    import.meta.env.VITE_FUNCTIONS_URL ||
    'https://us-central1-better-white-elephant.cloudfunctions.net/sendPartyInvite'
  );
}

/**
 * @param {import('firebase/auth').User} user
 * @param {{ email: string, partyId: string }} payload
 */
export async function postSendPartyInvite(user, { email, partyId }) {
  if (!user?.getIdToken) {
    throw new Error('Sign in to send invites.');
  }
  const token = await user.getIdToken();
  const functionUrl = getSendPartyInviteUrl();

  return fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ email, partyId }),
  });
}