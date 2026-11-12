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
