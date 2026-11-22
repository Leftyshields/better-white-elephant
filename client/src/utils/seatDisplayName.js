/**
 * Public name on a party seat: parties/{partyId}/participants/{uid}.
 *
 * users/{uid} is owner-only, so the lobby cannot read other players' profiles. The seat carries
 * the one public name instead. `displayName` is the single seat name field: Google join and host
 * create write the first name here today, and item 2's typed guest name will write the same
 * field, so anonymous guests need no migration. `lastInitial` (optional, one letter A-Z) is only
 * used to tell apart two seats with the same first name. firestore.rules validates both fields.
 */
import { isValidPublicHostDisplayName } from '../../../server/lib/display-names.js';
import { fieldsFromBatchName, rosterDisplayNames } from '../../../server/shared/roster-names.mjs';

// One implementation for the client and the game server (G28): see server/shared/roster-names.mjs.
export {
  nameCollisionSuffix,
  rosterDisplayNames,
  seatNameFields,
} from '../../../server/shared/roster-names.mjs';

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
 * @param {string|null} [hostId] the party host: always numbered first, so never gets " (N)" (G28)
 * @returns {Record<string, {status: 'ready'|'loading'|'failed', name: string|null}>}
 */
export function gameRoomNameStates(
  participants = [],
  batchNames = {},
  batchStatus = 'pending',
  unnamedPlayer = 'Player',
  hostId = null,
) {
  const roster = rosterDisplayNames(participants, batchNames, { hostId });
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
