/**
 * Public name on a party seat: parties/{partyId}/participants/{uid}.
 *
 * users/{uid} is owner-only, so the lobby cannot read other players' profiles. The seat carries
 * the one public name instead. `displayName` is the single seat name field: Google join and host
 * create write the first name here today, and item 2's typed guest name will write the same
 * field, so anonymous guests need no migration. `lastInitial` (optional, one letter A-Z) is only
 * used to tell apart two seats with the same first name. firestore.rules validates both fields.
 */
import {
  displayNameMatchesEmailLocalPart,
  isValidPublicHostDisplayName,
  pickDisplayName,
  sanitizeUserChosenDisplayName,
  MAX_PUBLIC_HOST_DISPLAY_NAME_LENGTH,
} from '../../../server/lib/display-names.js';

const LAST_INITIAL_RE = /^[A-Z]$/;

/**
 * Seat name fields from a full name (Auth displayName). Returns {} when nothing public remains,
 * so the roster keeps the Player fallback.
 * @returns {{ displayName?: string, lastInitial?: string }}
 */
export function seatNameFields(fullName, email) {
  const safe = sanitizeUserChosenDisplayName(fullName);
  if (!safe || displayNameMatchesEmailLocalPart(safe, email)) {
    return {};
  }
  const parts = safe.split(/\s+/);
  const firstName = parts[0].slice(0, MAX_PUBLIC_HOST_DISPLAY_NAME_LENGTH);
  if (!isValidPublicHostDisplayName(firstName)) {
    return {};
  }
  const fields = { displayName: firstName };
  const lastInitial = parts.length > 1 ? parts[parts.length - 1].charAt(0).toUpperCase() : '';
  if (LAST_INITIAL_RE.test(lastInitial)) {
    fields.lastInitial = lastInitial;
  }
  return fields;
}

function fieldsFromBatchName(participantId, batchNames) {
  const batchName = batchNames[participantId];
  const candidate = batchName !== participantId ? batchName : null;
  if (!candidate) {
    return null;
  }
  const fields = seatNameFields(candidate);
  return fields.displayName ? fields : null;
}

/**
 * Roster label per participant id: seat name first, then the /api/users/batch name run
 * through the same first-name plus collision-initial formatter, then "Player <id>".
 * Seats sharing a first name show "First L." when a last initial is available.
 * @returns {Record<string, string>}
 */
export function rosterDisplayNames(participants, batchNames = {}) {
  const resolved = participants.map((p) => {
    if (isValidPublicHostDisplayName(p.displayName)) {
      return { id: p.id, displayName: p.displayName, lastInitial: p.lastInitial };
    }
    const fromBatch = fieldsFromBatchName(p.id, batchNames);
    if (fromBatch) {
      return { id: p.id, displayName: fromBatch.displayName, lastInitial: fromBatch.lastInitial };
    }
    return { id: p.id, fallback: pickDisplayName(p.id, null) };
  });

  const firstNameCounts = {};
  for (const r of resolved) {
    if (r.displayName) {
      const key = r.displayName.toLowerCase();
      firstNameCounts[key] = (firstNameCounts[key] || 0) + 1;
    }
  }

  const names = {};
  for (const r of resolved) {
    if (r.displayName) {
      const shared = firstNameCounts[r.displayName.toLowerCase()] > 1;
      names[r.id] = shared && LAST_INITIAL_RE.test(r.lastInitial ?? '')
        ? `${r.displayName} ${r.lastInitial}.`
        : r.displayName;
    } else {
      names[r.id] = r.fallback;
    }
  }
  return names;
}

export function participantNeedsBatchName(participant) {
  return !isValidPublicHostDisplayName(participant?.displayName);
}

export function isBotParticipantId(id) {
  return typeof id === 'string' && id.startsWith('bot_');
}

/**
 * Name state for the game room, end screen, and Live Feed.
 * Seat names are ready on the first frame. The batch call is only a fallback
 * for seats without a valid displayName. Until the batch settles, unresolved
 * names are loading (never a uid fragment). After it settles with no name,
 * use the unnamed-player word.
 *
 * @param {Array<{id: string, displayName?: string, lastInitial?: string}>} participants
 * @param {Record<string, string>} batchNames
 * @param {'idle'|'pending'|'success'|'failed'} batchStatus
 * @param {string} unnamedPlayer
 * @returns {Record<string, {status: 'ready'|'loading'|'failed', name: string|null}>}
 */
export function gameRoomNameStates(
  participants = [],
  batchNames = {},
  batchStatus = 'pending',
  unnamedPlayer = 'Player',
) {
  const roster = rosterDisplayNames(participants, batchNames);
  const states = {};
  for (const participant of participants) {
    if (!participant?.id) continue;
    const hasSeat = isValidPublicHostDisplayName(participant.displayName);
    const hasBatch = !!fieldsFromBatchName(participant.id, batchNames);
    if (hasSeat || hasBatch) {
      states[participant.id] = { status: 'ready', name: roster[participant.id] };
    } else if (batchStatus === 'success' || batchStatus === 'failed') {
      states[participant.id] = { status: 'failed', name: unnamedPlayer };
    } else {
      states[participant.id] = { status: 'loading', name: null };
    }
  }
  return states;
}

export function lookupNameState(
  nameStates,
  id,
  batchStatus = 'pending',
  unnamedPlayer = 'Player',
) {
  if (!id) {
    return { status: 'failed', name: unnamedPlayer };
  }
  if (nameStates && nameStates[id]) {
    return nameStates[id];
  }
  if (batchStatus === 'success' || batchStatus === 'failed') {
    return { status: 'failed', name: unnamedPlayer };
  }
  return { status: 'loading', name: null };
}

/**
 * Batch status used to resolve game-room names.
 * An empty roster (the first frame after a refresh or rejoin) is not a settled
 * lookup. A settled success or failure only applies to the participant id set
 * it was recorded for, so a newly arrived nameless seat stays loading instead
 * of flashing the unnamed-player word.
 *
 * @param {{
 *   participantIdsKey: string,
 *   settledKey: string,
 *   batchStatus: string,
 *   needingCount: number,
 *   participantCount: number,
 * }} args
 * @returns {'idle'|'pending'|'success'|'failed'}
 */
export function effectiveGameRoomBatchStatus({
  participantIdsKey,
  settledKey,
  batchStatus,
  needingCount,
  participantCount,
}) {
  if (!participantCount) {
    return 'idle';
  }
  if (!needingCount) {
    return 'success';
  }
  if (settledKey !== participantIdsKey) {
    return 'pending';
  }
  return batchStatus || 'pending';
}
