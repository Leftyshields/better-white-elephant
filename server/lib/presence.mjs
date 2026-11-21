/**
 * BUG-23: who is away, per party. In memory: one game server instance today (no socket.io Redis
 * adapter, docs/deploy/DEPLOY_GAME_SERVER.md). If the server scales out, this moves to the adapter.
 *
 * Several tabs count as one person: away starts only when the last socket for that user in that
 * party is gone, after a short grace so a reload never shows "away". awaySince is the disconnect
 * time, not the end of the grace. Coming back is broadcast at once (never a false "back").
 */
import { AWAY_GRACE_MS } from '../shared/host-takeover.mjs';

/**
 * @param {{ onChange: (partyId: string, update: { userId: string, away: boolean, awaySince?: number }) => void,
 *   graceMs?: number, now?: () => number, setTimer?: Function, clearTimer?: Function }} options
 */
export function createPresenceTracker({
  onChange,
  graceMs = AWAY_GRACE_MS,
  now = () => Date.now(),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  /** partyId -> userId -> { sockets: Set<string>, awaySince: number|null, returnedAt: number|null, pendingSince: number|null, timer } */
  const parties = new Map();

  function entryFor(partyId, userId) {
    let party = parties.get(partyId);
    if (!party) {
      party = new Map();
      parties.set(partyId, party);
    }
    let entry = party.get(userId);
    if (!entry) {
      entry = { sockets: new Set(), awaySince: null, returnedAt: null, pendingSince: null, timer: null };
      party.set(userId, entry);
    }
    return entry;
  }

  function join(partyId, userId, socketId) {
    const entry = entryFor(partyId, userId);
    entry.sockets.add(socketId);
    if (entry.timer) {
      clearTimer(entry.timer);
      entry.timer = null;
    }
    entry.pendingSince = null;
    if (entry.awaySince != null) {
      entry.awaySince = null;
      entry.returnedAt = now();
      onChange(partyId, { userId, away: false });
    }
  }

  function leave(partyId, userId, socketId) {
    const entry = parties.get(partyId)?.get(userId);
    if (!entry || !entry.sockets.delete(socketId) || entry.sockets.size > 0) return;
    if (entry.awaySince != null || entry.timer) return;
    const disconnectedAt = now();
    entry.pendingSince = disconnectedAt;
    entry.timer = setTimer(() => {
      entry.timer = null;
      entry.pendingSince = null;
      if (entry.sockets.size > 0) return;
      entry.awaySince = disconnectedAt;
      onChange(partyId, { userId, away: true, awaySince: disconnectedAt });
    }, graceMs);
  }

  /** { awaySince, returnedAt } for one player (nulls when unknown, e.g. after a server restart). */
  function get(partyId, userId) {
    const entry = parties.get(partyId)?.get(userId);
    return { awaySince: entry?.awaySince ?? null, returnedAt: entry?.returnedAt ?? null };
  }

  /** Everyone currently away in the party, for the joiner's snapshot. */
  function snapshot(partyId) {
    const away = [];
    for (const [userId, entry] of parties.get(partyId) || []) {
      if (entry.awaySince != null) away.push({ userId, awaySince: entry.awaySince });
    }
    return away;
  }

  return { join, leave, get, snapshot };
}
