/**
 * Roster labels shared by the client (lobby, game room, feed, end screen, Manage Party) and the
 * game server (G28: the host label written on the party doc at game start).
 *
 * One rule everywhere: a seat's label is its first name, "First L." when another seat shares the
 * first name, and " (N)" (G21, Copywriter-signed) only when labels still match. The (N) goes to
 * the later joiner: seats are numbered host first, then by joinedAt, never by array order (the
 * lobby lists seats by document id and the game room by the shuffled turn order, so array order
 * made the host "(2)" and could swap numbers at game start). A uid listed twice counts once.
 */
import {
  displayNameMatchesEmailLocalPart,
  isValidPublicHostDisplayName,
  pickDisplayName,
  sanitizeUserChosenDisplayName,
  MAX_PUBLIC_HOST_DISPLAY_NAME_LENGTH,
} from '../lib/display-names.js';

const LAST_INITIAL_RE = /^[A-Z]$/;

/** Copywriter-signed unique-name suffix (G21): a space and (N), starting at 2. */
export function nameCollisionSuffix(n) {
  return ` (${n})`;
}

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

export function fieldsFromBatchName(participantId, batchNames = {}) {
  const batchName = batchNames[participantId];
  const candidate = batchName !== participantId ? batchName : null;
  if (!candidate) {
    return null;
  }
  const fields = seatNameFields(candidate);
  return fields.displayName ? fields : null;
}

/** joinedAt as epoch ms from a Firestore Timestamp, Date, {seconds}, ISO string or number. */
function joinedAtMs(value) {
  if (value == null) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (typeof value.seconds === 'number') return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6);
  const ms = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Seats in naming order: one entry per uid, the host first, then earliest joinedAt; seats with
 * no joinedAt go after dated ones, then by uid, so every screen gets the same order.
 */
export function seatsInJoinOrder(participants = [], hostId = null) {
  const byId = new Map();
  for (const p of participants) {
    if (p?.id && !byId.has(p.id)) byId.set(p.id, p);
  }
  const rank = (p) => (hostId && p.id === hostId ? 0 : 1);
  return [...byId.values()].sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    const ta = joinedAtMs(a.joinedAt);
    const tb = joinedAtMs(b.joinedAt);
    if (ta !== tb) {
      if (ta == null) return 1;
      if (tb == null) return -1;
      return ta - tb;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * Roster label per participant id: seat name first, then the /api/users/batch name run
 * through the same first-name plus collision-initial formatter, then "Player <id>".
 * Seats sharing a first name show "First L." when a last initial is available; labels that still
 * match get " (N)" by join order (see seatsInJoinOrder).
 * @param {Array<{id: string, displayName?: string, lastInitial?: string, joinedAt?: unknown}>} participants
 * @param {Record<string, string>} [batchNames]
 * @param {{ hostId?: string|null }} [options]
 * @returns {Record<string, string>}
 */
export function rosterDisplayNames(participants, batchNames = {}, { hostId = null } = {}) {
  const ordered = seatsInJoinOrder(participants, hostId);
  const resolved = ordered.map((p) => {
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
  const seen = new Map();
  for (const r of resolved) {
    let label;
    if (r.displayName) {
      const shared = firstNameCounts[r.displayName.toLowerCase()] > 1;
      label = shared && LAST_INITIAL_RE.test(r.lastInitial ?? '')
        ? `${r.displayName} ${r.lastInitial}.`
        : r.displayName;
    } else {
      label = r.fallback;
    }
    const count = (seen.get(label) || 0) + 1;
    seen.set(label, count);
    names[r.id] = count > 1 ? `${label}${nameCollisionSuffix(count)}` : label;
  }
  return names;
}

/**
 * G28: the host's roster label for the party doc, or null when it can't be told for sure
 * (no host seat, or a seat without a seat name, whose label would depend on a profile lookup).
 */
export function hostRosterLabel(participants = [], hostId) {
  if (!hostId) return null;
  const seats = seatsInJoinOrder(participants, hostId);
  if (!seats.some((p) => p.id === hostId)) return null;
  if (!seats.every((p) => isValidPublicHostDisplayName(p.displayName))) return null;
  return rosterDisplayNames(seats, {}, { hostId })[hostId] ?? null;
}
