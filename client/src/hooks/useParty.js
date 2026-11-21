/**
 * Party Data Hook - Firestore subscription
 */
import { useState, useEffect } from 'react';
import {
  doc,
  collection,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../utils/firebase.js';

/**
 * @param {string} partyId
 * @param {string | null} [authUid] pass the signed-in uid so seat, gift and invite listeners
 *   re-subscribe after a guest's silent sign-in (they fail while signed out). The party doc
 *   listener does not restart, so there is no loading flash.
 */
export function useParty(partyId, authUid = null) {
  const [party, setParty] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [gifts, setGifts] = useState([]);
  // Which party|uid has had its first gift snapshot (or error). Only the first load gates `loading`;
  // a later scope change (lobby to game) swaps gifts in place without a loading flash.
  const [giftsLoadedFor, setGiftsLoadedFor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!partyId) {
      setLoading(false);
      setError(null);
      return;
    }

    // Reset error and loading states when partyId changes
    setLoading(true);
    setError(null);

    // Subscribe to party document
    const partyUnsubscribe = onSnapshot(
      doc(db, 'parties', partyId),
      (docSnapshot) => {
        if (docSnapshot.exists()) {
          setParty({ id: docSnapshot.id, ...docSnapshot.data() });
        } else {
          setParty(null);
        }
        setLoading(false);
        setError(null);
      },
      (error) => {
        console.error('❌ Error fetching party:', error);
        console.error('Error details:', {
          code: error.code,
          message: error.message,
          stack: error.stack
        });
        setParty(null);
        setLoading(false);
        setError(error);
      }
    );

    return () => {
      partyUnsubscribe();
    };
  }, [partyId]);

  useEffect(() => {
    if (!partyId) return undefined;

    // Subscribe to participants. includeMetadataChanges: without it, a seat the player writes
    // themselves only ever arrives as the local pending snapshot; the server-confirmed one
    // (hasPendingWrites false) never comes. The join card and Party.jsx wait for that one.
    let firstParticipantsSnapshot = true;
    const participantsUnsubscribe = onSnapshot(
      query(
        collection(db, 'parties', partyId, 'participants')
      ),
      { includeMetadataChanges: true },
      (snapshot) => {
        // Skip snapshots where no seat changed at all (only the cache/online flag flipped),
        // so consumers do not re-render or refetch names for nothing.
        if (!firstParticipantsSnapshot && snapshot.docChanges({ includeMetadataChanges: true }).length === 0) return;
        firstParticipantsSnapshot = false;
        const participantsList = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
          // Needed so the join card does not treat a local pending ready write as confirmed.
          hasPendingWrites: doc.metadata?.hasPendingWrites === true,
        }));
        setParticipants(participantsList);
      },
      (error) => {
        console.error('❌ Error fetching participants:', error);
        console.error('Error details:', {
          code: error.code,
          message: error.message,
          stack: error.stack
        });
        // Set empty array on error so UI doesn't break
        setParticipants([]);
      }
    );

    // Subscribe to pending invites
    const pendingInvitesUnsubscribe = onSnapshot(
      collection(db, 'parties', partyId, 'pendingInvites'),
      (snapshot) => {
        const invitesList = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setPendingInvites(invitesList);
      }
    );

    return () => {
      participantsUnsubscribe();
      pendingInvitesUnsubscribe();
    };
  }, [partyId, authUid]);

  // G25 gift privacy: before the game a player may read only their own gift, so the lobby listens
  // to the caller's gift alone. Once the game is ACTIVE or ENDED, seated players read every gift
  // in the party (the game board needs them).
  const giftScope = giftListenScope(party, authUid);
  const giftsKey = `${partyId}|${authUid}`;

  useEffect(() => {
    if (!partyId || giftScope === 'none') {
      setGifts([]);
      return undefined;
    }

    const giftsQuery =
      giftScope === 'party'
        ? query(collection(db, 'gifts'), where('partyId', '==', partyId))
        : query(
            collection(db, 'gifts'),
            where('partyId', '==', partyId),
            where('submitterId', '==', authUid)
          );

    const giftsUnsubscribe = onSnapshot(
      giftsQuery,
      (snapshot) => {
        const giftsList = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        console.log('Gifts updated:', giftsList.length, 'gifts');
        setGifts(giftsList);
        setGiftsLoadedFor(giftsKey);
      },
      (error) => {
        console.error('❌ Error fetching gifts:', error);
        console.error('Error details:', {
          code: error.code,
          message: error.message,
          stack: error.stack
        });
        // Set empty array on error so UI doesn't break
        setGifts([]);
        setGiftsLoadedFor(giftsKey);
      }
    );

    return () => {
      giftsUnsubscribe();
    };
  }, [partyId, authUid, giftScope, giftsKey]);

  // Stay loading until the gift listener's first answer, so the lobby never flashes "no gift yet"
  // (Submit your gift, Start enabled) before the caller's own gift arrives.
  const giftsPending = !!partyId && giftScope !== 'none' && giftsLoadedFor !== giftsKey;

  return { party, participants, pendingInvites, gifts, loading: loading || giftsPending, error };
}

/**
 * Which gifts the caller may listen to (G25).
 * @returns {'party' | 'own' | 'none'} 'party' = every gift in the party (game ACTIVE or ENDED),
 *   'own' = only the caller's gift (lobby or any other pre-game state), 'none' = nothing yet
 *   (party not loaded, or no signed-in uid before the game).
 */
export function giftListenScope(party, authUid) {
  if (!party) return 'none';
  if (party.status === 'ACTIVE' || party.status === 'ENDED') return 'party';
  return authUid ? 'own' : 'none';
}


