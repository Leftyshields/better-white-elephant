/**
 * Direct read of parties/{partyId}/participants/{uid} (own seat).
 * Do not infer membership from the useParty participants list: that list is empty
 * both for a late visitor (permission-denied) and for a real player before the
 * first snapshot, which would flash the late-invite card at seated players.
 *
 * The returned status is keyed to the current partyId+uid. When either argument
 * changes, or while that pair's read is still pending, this hook returns
 * 'checking' so a stale 'not-seated' from a previous key cannot leak into
 * the first render of an ACTIVE or ENDED party.
 */
import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../utils/firebase.js';

/**
 * @param {string | null} partyId
 * @param {string | null} uid
 * @returns {'checking'|'seated'|'not-seated'|'error'}
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
            status: snap.exists() ? 'seated' : 'not-seated',
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
