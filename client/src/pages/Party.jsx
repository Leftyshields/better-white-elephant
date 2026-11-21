/**
 * Party Page
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { PartyLobby } from '../components/PartyLobby.jsx';
import { GameRoom } from './GameRoom.jsx';
import { PartyInviteLanding } from '../components/PartyInviteLanding.jsx';
import { useParty } from '../hooks/useParty.js';
import { SEO } from '../components/SEO.jsx';
import { INVITE_SEO } from '../utils/landingMarketingCopy.js';
import { stripInviteTokenFromAddressBar } from '../utils/partyInvite.js';

function Spinner({ label }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-900 via-slate-900 to-black">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mb-4"></div>
        <p className="text-white">{label}</p>
      </div>
    </div>
  );
}

export function Party() {
  const { partyId } = useParams();
  const { user, loading: authLoading } = useAuth();
  // Seat listeners restart after a guest's silent sign-in, so the page moves from the invite
  // landing to the lobby the moment the background seat write lands (no reload).
  const { party, participants, loading, error } = useParty(partyId, user?.uid ?? null);
  const [gameStarted, setGameStarted] = useState(false);

  const inviteSeoTitle = party?.title
    ? `You're invited to ${party.title}`
    : INVITE_SEO.fallbackTitle;

  const isParticipant = !!user && (participants?.some((p) => p.id === user.uid) || false);

  // Once the visitor is confirmed seated, drop #t= from this history entry (G19).
  // Do not do this earlier: the landing still needs the token to join.
  useEffect(() => {
    if (!isParticipant) return undefined;
    stripInviteTokenFromAddressBar();
    return undefined;
  }, [isParticipant]);

  let content;
  if (authLoading) {
    content = <Spinner label="Loading..." />;
  } else if (!user || (error && !party) || (!party && !loading) || (party && !isParticipant && party.status === 'LOBBY')) {
    // Same element in the same position for every not-yet-seated case, so the landing (and its
    // background seat write) is never remounted when auth or the party snapshot changes.
    content = <PartyInviteLanding partyId={partyId} />;
  } else if (loading) {
    content = <Spinner label="Loading party..." />;
  } else if (party.status === 'ACTIVE' || party.status === 'ENDED' || gameStarted) {
    content = <GameRoom partyId={partyId} />;
  } else {
    content = <PartyLobby partyId={partyId} onStartGame={() => setGameStarted(true)} />;
  }

  return (
    <>
      <SEO title={inviteSeoTitle} description={INVITE_SEO.description} url={`/party/${partyId}`} />
      {content}
    </>
  );
}
