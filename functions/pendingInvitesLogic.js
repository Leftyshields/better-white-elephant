/**
 * Pending invite matching and host UI filters (pure functions).
 */

export function inviteDocIdFromEmail(email) {
  if (!email || typeof email !== 'string') return null;
  return email.trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
}

/**
 * @param {Record<string, unknown>} invite
 * @param {string} userId
 * @param {string | null | undefined} userEmail verified Auth email only
 */
export function inviteMatchesJoiningUser(invite, userId, userEmail) {
  if (!invite || typeof invite !== 'object') return false;
  if (invite.status === 'ACCEPTED') return false;
  if (invite.userId && invite.userId === userId) return true;

  const normalizedEmail = userEmail?.trim().toLowerCase();
  if (!normalizedEmail) return false;

  if (typeof invite.email === 'string' && invite.email.trim().toLowerCase() === normalizedEmail) {
    return true;
  }

  return false;
}

/**
 * @param {Array<Record<string, unknown> & { id?: string }>} pendingInvites
 * @param {Array<{ id: string }>} participants
 */
export function filterVisiblePendingInvites(pendingInvites, participants) {
  const participantIds = new Set(participants.map((p) => p.id));
  return pendingInvites.filter((inv) => {
    if (inv.status === 'ACCEPTED') return false;
    if (inv.userId && participantIds.has(inv.userId)) return false;
    return true;
  });
}

/**
 * @param {Record<string, unknown>} invite
 * @param {Array<{ id: string }>} participants
 */
export function canResendPartyInvite(invite, participants) {
  if (invite.status === 'ACCEPTED') return false;
  if (invite.userId && participants.some((p) => p.id === invite.userId)) return false;
  return Boolean(invite.emailFailed || !invite.sentAt);
}