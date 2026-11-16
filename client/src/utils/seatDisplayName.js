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

/**
 * Roster label per participant id: seat name first, then the /api/users/batch name, then
 * "Player <id>". Seats sharing a first name show "First L." when the seat has a last initial.
 * @returns {Record<string, string>}
 */
export function rosterDisplayNames(participants, batchNames = {}) {
  const seatName = (p) => (isValidPublicHostDisplayName(p.displayName) ? p.displayName : null);
  const seatNameCounts = {};
  for (const p of participants) {
    const name = seatName(p);
    if (name) {
      const key = name.toLowerCase();
      seatNameCounts[key] = (seatNameCounts[key] || 0) + 1;
    }
  }
  const names = {};
  for (const p of participants) {
    const name = seatName(p);
    if (name) {
      const shared = seatNameCounts[name.toLowerCase()] > 1;
      names[p.id] = shared && LAST_INITIAL_RE.test(p.lastInitial ?? '')
        ? `${name} ${p.lastInitial}.`
        : name;
      continue;
    }
    const batchName = batchNames[p.id];
    names[p.id] = pickDisplayName(p.id, batchName !== p.id ? batchName : null);
  }
  return names;
}
