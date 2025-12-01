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
import { trackParticipantJoin, trackError } from '../utils/analytics.js';

export function Party() {
  const { partyId } = useParams();
  const { party, loading, error } = useParty(partyId);
  const { user, loading: authLoading } = useAuth();
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

          // Auto-add user as participant with GOING status
          // Anyone who links to the party and signs in should be marked as GOING
          await setDoc(participantRef, {
            status: 'GOING',
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
            // Track join via email invite
            trackParticipantJoin(partyId, 'email');
          } else {
            // Track join via share link or direct
            trackParticipantJoin(partyId, 'share_link');
          }

          console.log(`User ${user.uid} auto-joined party ${partyId}`);
        } catch (error) {
          console.error('Error auto-joining party:', error);
          trackError('auto_join_failed', error.message, 'Party');
        }
      }
    };

    autoJoinParty();
  }, [party, user, partyId]);

  // Show loading state while fetching party data or auth
  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-900 via-slate-900 to-black">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mb-4"></div>
          <p className="text-white">Loading party...</p>
        </div>
      </div>
    );
  }

  // Show error state if party failed to load
  if (error) {
    const isPermissionError = error?.code === 'permission-denied' || error?.message?.includes('permission');
    
    return (
      <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-900 via-slate-900 to-black py-12">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <h2 className="text-2xl font-bold mb-4 text-red-600">Unable to Load Party</h2>
          {isPermissionError ? (
            <>
              <p className="text-gray-600 mb-6">
                You don't have permission to view this party. Please sign in or contact the party host.
              </p>
              {!user && (
                <Button
                  onClick={() => {
                    window.sessionStorage.setItem('redirectAfterAuth', `/party/${partyId}`);
                    window.location.href = '/';
                  }}
                  className="w-full"
                >
                  Sign In to Join
                </Button>
              )}
            </>
          ) : (
            <>
              <p className="text-gray-600 mb-6">
                There was an error loading the party. This might be due to a network issue or the party may no longer exist.
              </p>
              <div className="flex flex-col gap-3">
                <div className="flex gap-3">
                  <Button
                    onClick={() => window.location.reload()}
                    className="flex-1"
                  >
                    Retry
                  </Button>
                  <Button
                    onClick={() => window.location.href = '/'}
                    className="flex-1 bg-gray-500 hover:bg-gray-600"
                  >
                    Go Home
                  </Button>
                </div>
                <Link
                  to="/contact?type=bug"
                  className="text-center text-sm text-blue-500 hover:text-blue-400 underline"
                >
                  Report this issue
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // Show message if party doesn't exist
  if (!party) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-900 via-slate-900 to-black py-12">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <h2 className="text-2xl font-bold mb-4">Party Not Found</h2>
          <p className="text-gray-600 mb-6">
            The party you're looking for doesn't exist or may have been deleted.
          </p>
          <Button
            onClick={() => window.location.href = '/'}
            className="w-full"
          >
            Go Home
          </Button>
        </div>
      </div>
    );
  }

  // If user is not authenticated, show sign-in prompt with redirect
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-900 via-slate-900 to-black py-12">
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

  // Debug logging
  console.log('Party component render:', {
    partyId,
    partyStatus: party?.status,
    hasParty: !!party,
    hasUser: !!user,
    loading,
    authLoading,
    error: error?.message,
    gameStarted
  });

  // Show GameBoard if game is active, ended, or just started
  if (party.status === 'ACTIVE' || party.status === 'ENDED' || gameStarted) {
    console.log('Rendering GameBoard');
    return <GameBoard partyId={partyId} />;
  }

  console.log('Rendering PartyLobby');
  return <PartyLobby partyId={partyId} onStartGame={() => setGameStarted(true)} />;
}

