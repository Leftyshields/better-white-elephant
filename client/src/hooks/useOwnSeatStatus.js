/**
 * Direct read of parties/{partyId}/participants/{uid} (own seat).
 * Do not infer membership from the useParty participants list: that list is empty
 * both for a late visitor (permission-denied) and for a real player before the
 * first snapshot, which would flash the late-invite card at seated players.
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
  const [status, setStatus] = useState(partyId && uid ? 'checking' : 'not-seated');

  useEffect(() => {
    if (!partyId || !uid) {
      setStatus('not-seated');
      return undefined;
    }

    let cancelled = false;
    setStatus('checking');
    getDoc(doc(db, 'parties', partyId, 'participants', uid))
      .then((snap) => {
        if (!cancelled) {
          setStatus(snap.exists() ? 'seated' : 'not-seated');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [partyId, uid]);

  return status;
}
