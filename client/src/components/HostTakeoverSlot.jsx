/**
 * BUG-23: the host's one takeover control for an away or idle player (host view only).
 * The slot holds a countdown hint until the server rule allows the takeover, then one button whose
 * label is the exact move the server will make. Busy within the tap, no confirm dialog (Product).
 */
import { useEffect, useRef, useState } from 'react';
import {
  TAKEOVER_CODES,
  deriveTakeoverAction,
  takeoverTiming,
  turnKeyOf,
} from '../../../server/shared/host-takeover.mjs';
import { GAME_USER_COPY } from '../utils/gameUserCopy.js';
import { HOST_TAKEOVER_COPY as COPY, fillCopy } from '../utils/hostTakeoverCopy.js';

/** Taps this soon after the button appears or its label changes are ignored (accidental-tap guard). */
const LABEL_SETTLE_MS = 400;
const ACK_TIMEOUT_MS = 8000;

function noticeForCode(code, name) {
  if (code === TAKEOVER_CODES.PLAYER_BACK) return fillCopy(COPY.playerBack, { name });
  if (code === TAKEOVER_CODES.TURN_MOVED) return COPY.turnMoved;
  if (code === TAKEOVER_CODES.NOT_YET) return COPY.notYet;
  return GAME_USER_COPY.actionFailedGeneric;
}

export function HostTakeoverSlot({ socket, partyId, gameState, playerId, playerName, presence, serverOffsetMs = 0, onNotice }) {
  const [clientNow, setClientNow] = useState(() => Date.now());
  const [busyKey, setBusyKey] = useState(null);
  const labelShownAtRef = useRef(0);

  useEffect(() => {
    const id = setInterval(() => setClientNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const turnKey = turnKeyOf(gameState);
  const now = clientNow + serverOffsetMs;
  const timing = takeoverTiming({
    turnStartedAt: turnKey,
    awaySince: presence?.awaySince ?? null,
    returnedAt: presence?.returnedAt ?? null,
    now,
  });
  const action = deriveTakeoverAction(gameState, playerId);
  const label = playerName ? fillCopy(COPY.actions[action], { name: playerName }) : null;
  const busy = busyKey === turnKey;

  // The accidental-tap guard restarts whenever the button (or its label) newly appears.
  const visibleLabel = timing.usable ? label : null;
  useEffect(() => {
    labelShownAtRef.current = Date.now();
  }, [visibleLabel]);

  // Names come from the roster (G2); while one is unresolved, hold the control back.
  if (!playerName || !timing.showSlot) return null;

  const handleClick = () => {
    if (busy || !socket || Date.now() - labelShownAtRef.current < LABEL_SETTLE_MS) return;
    setBusyKey(turnKey);
    socket
      .timeout(ACK_TIMEOUT_MS)
      .emit('host_take_turn_for_away', { partyId, playerId, action, turnKey }, (error, result) => {
        setBusyKey(null);
        if (error) {
          onNotice?.(GAME_USER_COPY.actionFailedGeneric);
          return;
        }
        // Success shows no toast: the turn line and the new Live Feed line are the feedback.
        if (!result?.ok) onNotice?.(noticeForCode(result?.code, playerName));
      });
  };

  const seconds = Math.max(1, Math.ceil(((timing.availableAt ?? now) - now) / 1000));

  return (
    <div className="mt-3 flex min-h-11 justify-center" data-testid="host-takeover-slot">
      {timing.usable ? (
        <button
          type="button"
          onClick={handleClick}
          aria-busy={busy ? 'true' : 'false'}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-amber-300/60 bg-amber-500/15 px-4 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-500/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 md:w-auto md:min-w-[200px]"
          data-testid="host-takeover-button"
        >
          {busy && (
            <span
              aria-hidden="true"
              className="h-4 w-4 shrink-0 rounded-full border-2 border-amber-200/40 border-t-amber-100 motion-safe:animate-spin"
            />
          )}
          <span>{busy ? COPY.busy : label}</span>
        </button>
      ) : (
        <p aria-live="off" className="self-center text-sm text-slate-300" data-testid="host-takeover-hint">
          {fillCopy(COPY.hint, { name: playerName, seconds })}
        </p>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {timing.usable ? fillCopy(COPY.readySr, { name: playerName }) : ''}
      </span>
    </div>
  );
}
