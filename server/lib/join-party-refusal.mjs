/** Socket refusal for join-party when the caller is not confirmed seated. */
export const JOIN_PARTY_NOT_PARTICIPANT_MESSAGE = 'You are not a participant in this party';

/**
 * @param {true|false|null} isParticipant true if seated, false if the seat is
 *   confirmed missing, null if the membership read itself failed.
 * @returns {{ code: string, message: string } | null}
 */
export function joinPartyMembershipRefusal(isParticipant) {
  if (isParticipant === true) {
    return null;
  }
  if (isParticipant === null) {
    return { code: 'MEMBERSHIP_CHECK_FAILED', message: JOIN_PARTY_NOT_PARTICIPANT_MESSAGE };
  }
  return { code: 'NOT_PARTICIPANT', message: JOIN_PARTY_NOT_PARTICIPANT_MESSAGE };
}
