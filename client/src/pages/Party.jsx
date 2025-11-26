/**
 * Party Page
 */
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { PartyLobby } from '../components/PartyLobby.jsx';
import { GameBoard } from '../components/GameBoard.jsx';
import { useParty } from '../hooks/useParty.js';
import { Button } from '../components/ui/Button.jsx';
import { doc, setDoc, getDoc, collection, query, where, getDocs, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../utils/firebase.js';

export function Party() {
  const { partyId } = useParams();
  const { party } = useParty(partyId);
  const { user } = useAuth();
  const [gameStarted, setGameStarted] = useState(false);

  // Auto-join party when user visits link
  useEffect(() => {
    const autoJoinParty = async () => {
      // Don't auto-join if party doesn't exist, game has started, or user not authenticated
      if (!party || !user) return;
      if (party.status !== 'LOBBY') return;

      // Check if user is already a participant
      const participantRef = doc(db, 'parties', partyId, 'participants', user.uid);
      const participantDoc = await getDoc(participantRef);

      if (!participantDoc.exists()) {
        try {
          // Check if there's a pending invite for this user's email
          const userEmail = user.email?.toLowerCase();
          let pendingInvite = null;
          
          if (userEmail) {
            const invitesSnapshot = await getDocs(
              query(
                collection(db, 'parties', partyId, 'pendingInvites'),
                where('email', '==', userEmail)
              )
            );
            
            if (!invitesSnapshot.empty) {
              pendingInvite = invitesSnapshot.docs[0];
            }
          }

          // Determine status - if pending invite was set to GOING, use that, otherwise PENDING
          const inviteStatus = pendingInvite?.data()?.status === 'GOING' ? 'GOING' : 'PENDING';

          // Auto-add user as participant
          await setDoc(participantRef, {
            status: inviteStatus,
            turnNumber: null,
            ready: false,
            joinedAt: new Date(),
            updatedAt: new Date(),
          });

          // If there was a pending invite, mark it as accepted
          if (pendingInvite) {
            await updateDoc(pendingInvite.ref, {
              status: 'ACCEPTED',
              acceptedAt: new Date(),
              userId: user.uid,
              updatedAt: new Date(),
            });
          }

          console.log(`User ${user.uid} auto-joined party ${partyId}`);
        } catch (error) {
          console.error('Error auto-joining party:', error);
        }
      }
    };

    autoJoinParty();
  }, [party, user, partyId]);

  if (!party) {
    return <div className="p-8 text-center">Loading...</div>;
  }

  // If user is not authenticated, show sign-in prompt with redirect
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <h2 className="text-2xl font-bold mb-4">Join This Party</h2>
          <p className="text-gray-600 mb-6">
            Sign in to join this White Elephant party!
          </p>
          <p className="text-sm text-gray-500 mb-6">
            Once you sign in, you'll be automatically added to the party.
          </p>
          <Button
            onClick={() => {
              // Store the party URL to redirect after sign-in
              window.sessionStorage.setItem('redirectAfterAuth', `/party/${partyId}`);
              window.location.href = '/';
            }}
            className="w-full"
          >
            Sign In to Join
          </Button>
        </div>
      </div>
    );
  }

  // Show GameBoard if game is active, ended, or just started
  if (party.status === 'ACTIVE' || party.status === 'ENDED' || gameStarted) {
    return <GameBoard partyId={partyId} />;
  }

  return <PartyLobby partyId={partyId} onStartGame={() => setGameStarted(true)} />;
}

