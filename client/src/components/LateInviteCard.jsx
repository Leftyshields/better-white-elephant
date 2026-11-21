/**
 * Late-invite card (BUG-21): shown when a visitor who is not seated opens a
 * link to an ACTIVE or ENDED party. Reuses the guest-card shell.
 */
import { useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import { userSignedInWithGoogle } from '../utils/partyInviteCopy.js';
import {
  LATE_INVITE_COPY,
  formatLatePartyLine,
} from '../utils/lateInvite.js';
import { redirectAfterAuthFromLocation } from '../utils/redirectAfterAuth.js';

const FOCUS_RING =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950';

const PAGE_BG =
  'min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-900 via-slate-900 to-black';

export const LATE_INVITE_PAGE_CLASS = `${PAGE_BG} p-4 pt-24`;

export function LateInvitePage({ children }) {
  return <div className={LATE_INVITE_PAGE_CLASS}>{children}</div>;
}

export function LateInviteCard({
  state,
  partyTitle,
  hostFirstName,
  showSignIn,
}) {
  const headingRef = useRef(null);
  const { signInWithGoogle } = useAuth();
  const started = state === 'started';
  const heading = started
    ? LATE_INVITE_COPY.gameAlreadyStartedHeading
    : LATE_INVITE_COPY.gameAlreadyOverHeading;
  const body = started
    ? LATE_INVITE_COPY.gameAlreadyStartedBody
    : LATE_INVITE_COPY.gameAlreadyOverBody;
  const partyLine = formatLatePartyLine(partyTitle, hostFirstName);

  useEffect(() => {
    headingRef.current?.focus();
  }, [heading]);

  async function handleSignIn() {
    try {
      const redirectTo = redirectAfterAuthFromLocation(window.location);
      if (redirectTo) {
        window.sessionStorage.setItem('redirectAfterAuth', redirectTo);
      }
    } catch {
      // sessionStorage can throw in a blocked context; sign-in should still run.
    }
    await signInWithGoogle();
  }

  return (
    <section
      data-testid="late-invite-card"
      data-late-state={state}
      className="w-full max-w-md mx-auto bg-slate-900/80 backdrop-blur-xl border border-white/10 shadow-2xl rounded-2xl p-4 sm:p-6 space-y-5"
    >
      <div className="space-y-1">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-xl sm:text-2xl font-bold text-white break-words outline-none"
        >
          {heading}
        </h1>
        <p className="text-sm text-slate-300 break-words [overflow-wrap:anywhere]" title={partyLine}>
          {partyLine}
        </p>
        <p className="text-base text-slate-200">{body}</p>
      </div>
      <a
        href="/"
        className={`inline-flex items-center justify-center w-full min-h-11 px-4 py-2 rounded-md font-medium text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 ${FOCUS_RING}`}
      >
        {LATE_INVITE_COPY.lateGoHome}
      </a>
      {showSignIn ? (
        <button
          type="button"
          onClick={handleSignIn}
          className={`flex items-center justify-center w-full min-h-11 px-0 py-2 text-xs text-center text-purple-300 hover:text-purple-200 underline ${FOCUS_RING}`}
        >
          {LATE_INVITE_COPY.lateSignInLink}
        </button>
      ) : null}
    </section>
  );
}

export function shouldShowLateSignIn(user) {
  return !userSignedInWithGoogle(user);
}
