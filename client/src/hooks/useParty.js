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

export function useParty(partyId) {
  const [party, setParty] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [gifts, setGifts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!partyId) {
      setLoading(false);
      return;
    }

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
      }
    );

    // Subscribe to participants
    const participantsUnsubscribe = onSnapshot(
      query(
        collection(db, 'parties', partyId, 'participants')
      ),
      (snapshot) => {
        const participantsList = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setParticipants(participantsList);
      }
    );

    // Subscribe to gifts
    const giftsUnsubscribe = onSnapshot(
      query(
        collection(db, 'gifts'),
        where('partyId', '==', partyId)
      ),
      (snapshot) => {
        const giftsList = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setGifts(giftsList);
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
      partyUnsubscribe();
      participantsUnsubscribe();
      giftsUnsubscribe();
      pendingInvitesUnsubscribe();
    };
  }, [partyId]);

  return { party, participants, pendingInvites, gifts, loading };
}


