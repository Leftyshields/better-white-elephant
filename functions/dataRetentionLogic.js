/**
 * Pure helpers for dataRetentionCleanup — testable without Firestore.
 */

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** @param {FirebaseFirestore.Timestamp|{ toMillis: () => number }|Date|number} ts */
export function toMillis(ts) {
  if (ts == null) return null;
  if (typeof ts === 'number') return ts;
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.toDate === 'function') return ts.toDate().getTime();
  return null;
}

/** @param {object} party */
export function getPartyEndTime(party) {
  return party?.endedAt || party?.updatedAt || null;
}

/** @param {object} party */
export function getPartyLastActivity(party) {
  return party?.updatedAt || party?.createdAt || null;
}

/**
 * ENDED party is past game/party data retention (default 30 days after end).
 * @param {object} party
 * @param {FirebaseFirestore.Timestamp|Date|number} cutoff
 */
export function isEndedPartyPastRetention(party, cutoff) {
  if (party?.status !== 'ENDED') return false;
  const endedAt = getPartyEndTime(party);
  if (!endedAt) return false;
  return toMillis(endedAt) <= toMillis(cutoff);
}

/**
 * Non-ENDED party with no activity past retention (default 30 days).
 * @param {object} party
 * @param {FirebaseFirestore.Timestamp|Date|number} cutoff
 */
export function isAbandonedPartyPastRetention(party, cutoff) {
  if (party?.status === 'ENDED') return false;
  const lastActivity = getPartyLastActivity(party);
  if (!lastActivity) return false;
  return toMillis(lastActivity) <= toMillis(cutoff);
}

/**
 * Whether to remove a user's shipping address after a source party ended before the cutoff.
 * @param {{ hasShippingAddress: boolean, sourcePartyEndedBeforeCutoff: boolean, userInNotEndedParty: boolean }} input
 */
export function shouldRemoveShippingAddress({
  hasShippingAddress,
  sourcePartyEndedBeforeCutoff,
  userInNotEndedParty,
}) {
  if (!hasShippingAddress) return false;
  if (!sourcePartyEndedBeforeCutoff) return false;
  if (userInNotEndedParty) return false;
  return true;
}

/** Party statuses that still need shipping addresses on file (CANCELLED does not). */
export const ADDRESS_RETENTION_BLOCKING_STATUSES = new Set(['LOBBY', 'ACTIVE']);

export function partyStatusBlocksAddressDeletion(status) {
  return ADDRESS_RETENTION_BLOCKING_STATUSES.has(status);
}

/**
 * Whether a user still has participant membership in another LOBBY/ACTIVE party.
 * Participant uid is the Firestore document id under parties/{partyId}/participants/{uid}
 * — not queryable via collectionGroup FieldPath.documentId() == uid (that compares full paths).
 *
 * @param {Array<{ partyId: string, status: string, hasParticipant: boolean }>} partyRows
 * @param {{ excludePartyId: string }} options
 */
export function userInAddressBlockingParty(partyRows, { excludePartyId }) {
  for (const row of partyRows) {
    if (row.partyId === excludePartyId) continue;
    if (!row.hasParticipant) continue;
    if (partyStatusBlocksAddressDeletion(row.status)) {
      return true;
    }
  }
  return false;
}

/**
 * Collect ENDED parties whose end time is on or before the cutoff (mirrors address/party passes).
 * @param {Array<{ data: () => object }>} partyDocs
 */
export function collectEndedPartiesBeforeCutoff(partyDocs, cutoff) {
  const partiesForCleanup = [];
  for (const partyDoc of partyDocs) {
    const party = partyDoc.data();
    if (isEndedPartyPastRetention(party, cutoff)) {
      partiesForCleanup.push(partyDoc);
    }
  }
  return partiesForCleanup;
}

/**
 * Iterate parties slated for address cleanup. Must be a plain array (not a QuerySnapshot).
 * @param {unknown} partiesForAddressCleanup
 * @returns {Array}
 */
export function partiesForAddressCleanupIterable(partiesForAddressCleanup) {
  if (!Array.isArray(partiesForAddressCleanup)) {
    throw new TypeError('partiesForAddressCleanup must be an array');
  }
  return partiesForAddressCleanup;
}

/**
 * Legacy bug: treating a plain array like a QuerySnapshot via `.docs`.
 * Used only in regression tests.
 * @param {unknown[]} partiesForAddressCleanup
 */
export function legacyAddressCleanupIterator(partiesForAddressCleanup) {
  const docs = partiesForAddressCleanup.docs;
  // eslint-disable-next-line no-unused-vars
  for (const partyDoc of docs) {
    // unreachable when docs is undefined
  }
  return docs;
}

/**
 * Whether a gift document should be fully deleted by dataRetentionCleanup.
 * @param {object} gift
 * @param {FirebaseFirestore.Timestamp|Date|number} cutoff — 30 days ago
 * @param {object|null|undefined} party — party data, null if doc missing, undefined if not loaded
 */
export function shouldDeleteGiftForRetention(gift, cutoff, party) {
  if (gift?.partyEndedAt && toMillis(gift.partyEndedAt) <= toMillis(cutoff)) {
    return true;
  }
  if (party === null) {
    return true;
  }
  if (party && party.status === 'ENDED' && isEndedPartyPastRetention(party, cutoff)) {
    return true;
  }
  return false;
}
