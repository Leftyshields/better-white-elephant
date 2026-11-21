/**
 * Direct read of parties/{partyId}/participants/{uid} (own seat).
 *
 * Callers should pass partyId and uid only when the party is ACTIVE or ENDED
 * and the visitor is not already in the participants list. Presence on that
 * list is proof of a seat. Running this read in LOBBY can cache 'not-seated'
 * before the seat write lands, and that result would stick for the same
 * partyId+uid when the host starts.
 *
 * The returned status is keyed to the current partyId+uid. When either argument
 * changes, or while that pair's read is still pending, this hook returns
 * 'checking' so a stale 'not-seated' from a previous key cannot leak into
 * the first render of an ACTIVE or ENDED party. When partyId or uid is
 * missing, this hook returns 'not-seated' and does not read.
 */
import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../utils/firebase.js';

/**
 * @param {string | null} partyId
 * @param {string | null} uid
 * @returns {'checking'|'seated'|'seated-pending'|'not-seated'|'error'} 'seated-pending' means
 *   the seat was found only with an unsent local write, so the server has not confirmed it yet.
 */
export function useOwnSeatStatus(partyId, uid) {
  const requestPartyId = partyId || null;
  const requestUid = uid || null;
  const [result, setResult] = useState(() => ({
    partyId: requestPartyId,
    uid: requestUid,
    status: requestPartyId && requestUid ? 'checking' : 'not-seated',
  }));

  useEffect(() => {
    if (!requestPartyId || !requestUid) {
      setResult({ partyId: null, uid: null, status: 'not-seated' });
      return undefined;
    }

    let cancelled = false;
    setResult({ partyId: requestPartyId, uid: requestUid, status: 'checking' });
    getDoc(doc(db, 'parties', requestPartyId, 'participants', requestUid))
      .then((snap) => {
        if (!cancelled) {
          setResult({
            partyId: requestPartyId,
            uid: requestUid,
            status: !snap.exists()
              ? 'not-seated'
              : snap.metadata?.hasPendingWrites === true ? 'seated-pending' : 'seated',
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResult({ partyId: requestPartyId, uid: requestUid, status: 'error' });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [requestPartyId, requestUid]);

  if (result.partyId !== requestPartyId || result.uid !== requestUid) {
    return requestPartyId && requestUid ? 'checking' : 'not-seated';
  }
  return result.status;
}
