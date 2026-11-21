/**
 * BUG-23: who is away in this party, from the game server's presence events.
 * Times are server time (ms). serverOffsetMs = serverNow - Date.now() at the last event, so the
 * host's countdown never depends on the device clock.
 */
import { useEffect, useState } from 'react';

export function useAwayPlayers(socket) {
  const [awayById, setAwayById] = useState({});
  const [serverOffsetMs, setServerOffsetMs] = useState(0);

  useEffect(() => {
    if (!socket) return undefined;
    const syncClock = (serverNow) => {
      if (Number.isFinite(serverNow)) setServerOffsetMs(serverNow - Date.now());
    };
    const onSnapshot = ({ away = [], serverNow } = {}) => {
      syncClock(serverNow);
      setAwayById(
        Object.fromEntries(away.map(({ userId, awaySince }) => [userId, { awaySince, returnedAt: null }])),
      );
    };
    const onUpdate = ({ userId, away, awaySince, serverNow } = {}) => {
      if (!userId) return;
      syncClock(serverNow);
      setAwayById((prev) => ({
        ...prev,
        [userId]: away ? { awaySince, returnedAt: null } : { awaySince: null, returnedAt: serverNow ?? null },
      }));
    };
    socket.on('presence-snapshot', onSnapshot);
    socket.on('presence-updated', onUpdate);
    return () => {
      socket.off('presence-snapshot', onSnapshot);
      socket.off('presence-updated', onUpdate);
    };
  }, [socket]);

  return { awayById, serverOffsetMs };
}
