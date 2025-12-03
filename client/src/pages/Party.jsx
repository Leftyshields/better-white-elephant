/**
 * Party Page
 */
import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { PartyLobby } from '../components/PartyLobby.jsx';
import { GameBoard } from '../components/GameBoard.jsx';
import { PartyInviteLanding } from '../components/PartyInviteLanding.jsx';
import { useParty } from '../hooks/useParty.js';
import { Button } from '../components/ui/Button.jsx';
import { doc, setDoc, getDoc, collection, query, where, getDocs, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../utils/firebase.js';
import { trackParticipantJoin, trackError } from '../utils/analytics.js';

export function Party() {
  const { partyId } = useParams();
  const { party, participants, loading, error } = useParty(partyId);
  const { user, loading: authLoading } = useAuth();
  const [gameStarted, setGameStarted] = useState(false);

  // Show loading state while fetching auth (but not party - we'll show invite landing)
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-900 via-slate-900 to-black">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mb-4"></div>
          <p className="text-white">Loading...</p>
        </div>
      </div>
    );
  }

  // If user is not authenticated, show invite landing
  if (!user) {
    return <PartyInviteLanding partyId={partyId} />;
  }

  // If party failed to load or doesn't exist, show invite landing
  if ((error && !party) || (!party && !loading)) {
    return <PartyInviteLanding partyId={partyId} />;
  }

  // If party is still loading, wait
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-900 via-slate-900 to-black">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mb-4"></div>
          <p className="text-white">Loading party...</p>
        </div>
      </div>
    );
  }

  // Check if user is a participant
  const isParticipant = participants?.some(p => p.id === user.uid) || false;

  // If user is authenticated but not a participant and party is in LOBBY, show invite landing
  // This allows them to explicitly join via the "RSVP Now" button
  if (!isParticipant && party.status === 'LOBBY') {
    return <PartyInviteLanding partyId={partyId} />;
  }

  // Debug logging
  console.log('Party component render:', {
    partyId,
    partyStatus: party?.status,
    hasParty: !!party,
    hasUser: !!user,
    isParticipant,
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

