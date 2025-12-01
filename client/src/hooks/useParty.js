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
        console.log(`📊 Participants updated: ${participantsList.length} total`, participantsList.map(p => ({ id: p.id, status: p.status, ready: p.ready })));
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
        console.log('Gifts updated:', giftsList.length, 'gifts');
        setGifts(giftsList);
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

  return { party, participants, pendingInvites, gifts, loading, error };
}


