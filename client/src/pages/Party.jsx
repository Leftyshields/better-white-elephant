/**
 * Party Page
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { PartyLobby } from '../components/PartyLobby.jsx';
import { GameRoom } from './GameRoom.jsx';
import { PartyInviteLanding } from '../components/PartyInviteLanding.jsx';
import { LateInviteCard, LateInvitePage, shouldShowLateSignIn } from '../components/LateInviteCard.jsx';
import { useParty } from '../hooks/useParty.js';
import { useOwnSeatStatus } from '../hooks/useOwnSeatStatus.js';
import { SEO } from '../components/SEO.jsx';
import { INVITE_SEO } from '../utils/landingMarketingCopy.js';
import { hostFirstNameFromParty } from '../components/PartyInviteLanding.jsx';
import { lateVisitorState } from '../utils/lateInvite.js';
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
  const partyIsActiveOrEnded = party?.status === 'ACTIVE' || party?.status === 'ENDED';
  // Only read the own-seat doc once the party is ACTIVE or ENDED, and only when
  // the visitor is not already in the participants list. A LOBBY check that ran
  // before the seat write would otherwise cache 'not-seated' for this
  // partyId+uid and show the late card when the host starts. Presence in the
  // participants list is proof of a seat.
  const shouldCheckOwnSeat = !!user && partyIsActiveOrEnded && !isParticipant;
  const fetchedSeatStatus = useOwnSeatStatus(
    shouldCheckOwnSeat ? partyId : null,
    shouldCheckOwnSeat ? user.uid : null,
  );
  const seatStatus = isParticipant ? 'seated' : fetchedSeatStatus;

  // Once the visitor is confirmed seated, drop #t= from this history entry (G19).
  // Confirmed means on the participants list or, in an ACTIVE/ENDED game whose
  // list is empty or lagging, an own-seat read that found the seat.
  // Do not do this earlier: the landing still needs the token to join.
  const confirmedSeated = seatStatus === 'seated';
  useEffect(() => {
    if (!confirmedSeated) return undefined;
    stripInviteTokenFromAddressBar();
    return undefined;
  }, [confirmedSeated]);

  let content;
  if (authLoading) {
    content = <Spinner label="Loading..." />;
  } else if (!user || (error && !party) || (!party && !loading) || (party && !isParticipant && party.status === 'LOBBY')) {
    // Same element in the same position for every not-yet-seated case, so the landing (and its
    // background seat write) is never remounted when auth or the party snapshot changes.
    content = <PartyInviteLanding partyId={partyId} />;
  } else if (loading) {
    content = <Spinner label="Loading party..." />;
  } else if (partyIsActiveOrEnded || gameStarted) {
    if (partyIsActiveOrEnded && seatStatus !== 'not-seated' && seatStatus !== 'seated' && seatStatus !== 'error') {
      content = <Spinner label="Loading party..." />;
    } else {
      const late = lateVisitorState(party, seatStatus);
      if (late) {
        content = (
          <LateInvitePage>
            <LateInviteCard
              state={late}
              partyTitle={party.title || 'White Elephant Party'}
              hostFirstName={hostFirstNameFromParty(party)}
              showSignIn={shouldShowLateSignIn(user)}
            />
          </LateInvitePage>
        );
      } else {
        content = <GameRoom partyId={partyId} />;
      }
    }
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
