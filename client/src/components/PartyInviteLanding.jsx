/**
 * Invite-link landing (batch 2 item 4). No login screen and no reloads: a guest is signed in
 * silently (anonymous, or their existing session) and seated with the link's invite token in the
 * background while the one-screen card is already on screen. Once the seat lands, the party page
 * swaps to the lobby, which shows the same card.
 */
import { useEffect, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { useAuth } from '../hooks/useAuth.js';
import { Button } from './ui/Button.jsx';
import { auth, db } from '../utils/firebase.js';
import { joinPartyWithInviteToken, readInviteTokenFromHash, stripInviteTokenFromAddressBar } from '../utils/partyInvite.js';
import { getJoinErrorMessage } from '../utils/partyInviteCopy.js';
import { seatNameFields } from '../utils/seatDisplayName.js';
import { trackParticipantJoin, trackError } from '../utils/analytics.js';
import { GuestJoinCard } from './GuestJoinCard.jsx';
import { LateInviteCard, LateInvitePage, shouldShowLateSignIn } from './LateInviteCard.jsx';
import { lateVisitorState } from '../utils/lateInvite.js';
import {
  isSyntheticPlayerDisplayName,
  isValidPublicHostDisplayName,
} from '../../../server/lib/display-names.js';

const PAGE_BG =
  'min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-900 via-slate-900 to-black';

/** Host first name for the welcome line, or null for the no-name variant. */
export function hostFirstNameFromParty(data) {
  const stored = typeof data?.hostDisplayName === 'string' ? data.hostDisplayName.trim() : '';
  if (!stored || !data?.adminId || isSyntheticPlayerDisplayName(stored, data.adminId)) return null;
  if (!isValidPublicHostDisplayName(stored)) return null;
  return stored.split(/\s+/)[0];
}

export function PartyInviteLanding({ partyId }) {
  const { user, loading: authLoading, ensureGuestSession } = useAuth();
  const [partyInfo, setPartyInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [terminalMessage, setTerminalMessage] = useState(null);
  const [lateState, setLateState] = useState(null);
  // Invite token rides in the URL fragment (#t=...), so it never reaches a server log.
  const [inviteToken] = useState(() => readInviteTokenFromHash(window.location.hash));
  const seatStartedRef = useRef(false);
  // A visitor who already has a session may already hold a seat (a host opening their own party,
  // or a guest coming back). Show the skeleton until that check is done instead of a guest card.
  const [hadSessionAtStart] = useState(() => auth.currentUser != null);
  const [seatCheckDone, setSeatCheckDone] = useState(false);
  const [alreadySeated, setAlreadySeated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!partyId) return undefined;
    setLoading(true);
    getDoc(doc(db, 'parties', partyId))
      .then((snap) => {
        if (cancelled) return;
        if (!snap.exists()) {
          setPartyInfo(null);
          return;
        }
        const data = snap.data();
        setPartyInfo({
          title: data.title || 'White Elephant Party',
          hostFirstName: hostFirstNameFromParty(data),
          status: data.status,
          participantCount: data.participantCount,
        });
      })
      .catch((error) => {
        console.error('Error fetching party info:', { code: error?.code, name: error?.name });
        if (!cancelled) setPartyInfo(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [partyId]);

  // Background seat: starts as soon as the party is known. Never mints an anonymous account for a
  // party that can't be joined (started, cancelled, or no token in the link).
  useEffect(() => {
    if (!partyInfo || authLoading || seatStartedRef.current) return;
    // Only treat the visitor as not seated when there is no session. Party may
    // send a signed-in user here on a failed or empty party list; those visitors
    // must wait for the own-seat read below.
    // Signed-in visitors still refuse CANCELLED (and any other status that is
    // not LOBBY, ACTIVE, or ENDED) before any seat write, restoring pre-change
    // behavior. ACTIVE/ENDED still do the own-seat read first so a seated
    // player is not shown the late card.
    if (!user) {
      const late = lateVisitorState(partyInfo, 'not-seated');
      if (late) {
        setLateState(late);
        return;
      }
      const preRefusal =
        partyInfo.status !== 'LOBBY' || !inviteToken
          ? getJoinErrorMessage({ party: partyInfo, error: null, hasToken: Boolean(inviteToken) })
          : null;
      if (preRefusal) {
        setTerminalMessage(preRefusal);
        return;
      }
    } else if (
      partyInfo.status !== 'LOBBY'
      && partyInfo.status !== 'ACTIVE'
      && partyInfo.status !== 'ENDED'
    ) {
      setTerminalMessage(
        getJoinErrorMessage({ party: partyInfo, error: null, hasToken: Boolean(inviteToken) }),
      );
      return;
    }
    seatStartedRef.current = true;
    (async () => {
      let partyState = partyInfo;
      let confirmedNotSeated = false;
      try {
        const sessionUser = await ensureGuestSession();
        const seat = await getDoc(doc(db, 'parties', partyId, 'participants', sessionUser.uid));
        if (seat.exists()) {
          // Leave the skeleton even if the parent's party list never arrives.
          setAlreadySeated(true);
          setSeatCheckDone(true);
          // Confirmed seat: drop #t= from this history entry (G19).
          stripInviteTokenFromAddressBar();
          return;
        }
        confirmedNotSeated = true;
        const lateForSignedIn = lateVisitorState(partyInfo, 'not-seated');
        if (lateForSignedIn) {
          setLateState(lateForSignedIn);
          setSeatCheckDone(true);
          return;
        }
        setSeatCheckDone(true);
        if (!inviteToken) {
          setTerminalMessage(getJoinErrorMessage({ party: partyInfo, error: null, hasToken: false }));
          return;
        }
        const fresh = await getDoc(doc(db, 'parties', partyId));
        partyState = fresh.exists() ? fresh.data() : null;
        await joinPartyWithInviteToken(db, partyId, sessionUser.uid, inviteToken, {
          status: 'GOING',
          turnNumber: null,
          ready: false,
          joinedAt: new Date(),
          updatedAt: new Date(),
          ...seatNameFields(sessionUser.displayName, sessionUser.email),
        });
        // Seat write succeeded: drop #t= (G19). A failed join keeps it for a retry.
        stripInviteTokenFromAddressBar();
        trackParticipantJoin(partyId, 'share_link');
      } catch (error) {
        console.error('Error joining party:', { code: error?.code, name: error?.name });
        let latestParty = partyState;
        try {
          const freshAfterError = await getDoc(doc(db, 'parties', partyId));
          if (freshAfterError.exists()) {
            const data = freshAfterError.data();
            latestParty = {
              title: data.title || partyInfo.title,
              hostFirstName: hostFirstNameFromParty(data),
              status: data.status,
              participantCount: data.participantCount,
            };
            setPartyInfo((prev) => ({ ...(prev || {}), ...latestParty }));
          }
        } catch {
          // Keep the party snapshot we already have.
        }
        // A failed seat check is not proof the visitor has no seat. Keep the
        // real error screen on ACTIVE/ENDED instead of the late card.
        if (confirmedNotSeated) {
          const lateAfter = lateVisitorState(latestParty, 'not-seated');
          if (lateAfter) {
            setLateState(lateAfter);
            setSeatCheckDone(true);
            return;
          }
        }
        const message = getJoinErrorMessage({
          party: confirmedNotSeated ? latestParty : null,
          error,
          hasToken: Boolean(inviteToken),
        });
        trackError('join_party_failed', message, 'PartyInviteLanding');
        setTerminalMessage(message);
        setSeatCheckDone(true);
      }
    })();
  }, [partyInfo, authLoading, user, inviteToken, partyId, ensureGuestSession]);

  const waitingOnSeatCheck = hadSessionAtStart && !seatCheckDone && !terminalMessage && !lateState;
  if (loading || authLoading || (partyInfo && waitingOnSeatCheck)) {
    return (
      <div className={`${PAGE_BG} p-6 pt-24`}>
        <div
          data-testid="guest-card-skeleton"
          aria-busy="true"
          className="w-full max-w-md mx-auto bg-slate-900/80 border border-white/10 rounded-2xl p-4 sm:p-6 space-y-4 animate-pulse"
        >
          <div className="h-7 w-3/4 rounded bg-slate-800" />
          <div className="h-4 w-full rounded bg-slate-800" />
          <div className="grid grid-cols-3 gap-2">
            <div className="h-11 rounded-lg bg-slate-800" />
            <div className="h-11 rounded-lg bg-slate-800" />
            <div className="h-11 rounded-lg bg-slate-800" />
          </div>
          <div className="h-11 rounded bg-slate-800" />
          <div className="h-11 rounded bg-slate-800" />
          <div className="h-12 rounded bg-slate-800" />
        </div>
      </div>
    );
  }

  if (!partyInfo) {
    return (
      <div className={`${PAGE_BG} flex items-center justify-center px-4 py-12`}>
        <div className="max-w-md w-full bg-slate-900/60 backdrop-blur-xl border border-white/10 shadow-2xl rounded-2xl p-8 text-center">
          <h2 className="text-2xl font-bold mb-4 text-white">Party Not Found</h2>
          <p className="text-slate-400 mb-6">
            This party isn&apos;t available. It may have been canceled or the link may be wrong.
          </p>
          <Button
            onClick={() => {
              window.location.href = '/';
            }}
            className="w-full min-h-11 bg-gradient-to-r from-indigo-600 to-purple-600 text-white"
          >
            Go Home
          </Button>
        </div>
      </div>
    );
  }

  if (lateState) {
    return (
      <LateInvitePage>
        <LateInviteCard
          state={lateState}
          partyTitle={partyInfo.title}
          hostFirstName={partyInfo.hostFirstName}
          showSignIn={shouldShowLateSignIn(user)}
        />
      </LateInvitePage>
    );
  }

  return (
    <div className={`${PAGE_BG} p-6 pt-24`}>
      <GuestJoinCard
        partyId={partyId}
        partyTitle={partyInfo.title}
        hostFirstName={partyInfo.hostFirstName}
        user={user}
        participant={null}
        gift={null}
        seated={alreadySeated}
        terminalMessage={terminalMessage}
      />
    </div>
  );
}
