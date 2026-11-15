/**
 * Guest step 3: I'm ready.
 */
import { Button } from '../ui/Button.jsx';
import { LOBBY_SETUP_STRINGS } from '../../copy/lobbySetupStrings.js';
import {
  guestReadyLockedStringKey,
  guestReadyMissingKeys,
  LOBBY_STEP_STATUS,
} from './lobbyStepUtils.js';

const touchClass = 'min-h-11';

export function GuestReadyStep({
  stepStatus,
  headingId,
  hasGift,
  hasAddress,
  isReady,
  readyPeerCount,
  readyPeerTotal,
  actionError,
  actionPending,
  onMarkReady,
  onUndoReady,
  onFocusGiftStep,
  onFocusAddressStep,
}) {
  const missingKey = guestReadyMissingKeys({ hasGift, hasAddress });
  const lockedKey = guestReadyLockedStringKey(missingKey);

  if (stepStatus === LOBBY_STEP_STATUS.LOCKED && lockedKey) {
    return (
      <div className="space-y-3" data-testid="guest-ready-locked">
        <h3 id={headingId} tabIndex={-1} className="sr-only">
          I&apos;m ready
        </h3>
        <p className="text-sm text-slate-400" role="status">
          {LOBBY_SETUP_STRINGS[lockedKey]}
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          {!hasGift && (
            <Button
              type="button"
              variant="secondary"
              className={`${touchClass} w-full sm:w-auto`}
              onClick={onFocusGiftStep}
            >
              Go to your gift
            </Button>
          )}
          {!hasAddress && (
            <Button
              type="button"
              variant="secondary"
              className={`${touchClass} w-full sm:w-auto`}
              onClick={onFocusAddressStep}
            >
              Go to shipping address
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (isReady) {
    return (
      <div className="space-y-3" data-testid="guest-ready-done">
        <h3 id={headingId} tabIndex={-1} className="sr-only">
          I&apos;m ready
        </h3>
        <p className="text-sm text-green-400">{LOBBY_SETUP_STRINGS['guest.ready.done']}</p>
        {readyPeerTotal > 0 && (
          <p className="text-sm text-slate-300" aria-live="polite">
            {readyPeerCount} of {readyPeerTotal} ready
          </p>
        )}
        <Button
          type="button"
          variant="secondary"
          disabled={actionPending}
          onClick={onUndoReady}
          className={`${touchClass} w-full sm:w-auto`}
          data-testid="guest-ready-undo"
        >
          {LOBBY_SETUP_STRINGS['guest.ready.undo']}
        </Button>
        {actionError && (
          <p className="text-sm text-red-400" role="alert">
            {actionError}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="guest-ready-active">
      <h3 id={headingId} tabIndex={-1} className="sr-only">
        I&apos;m ready
      </h3>
      {readyPeerTotal > 0 && (
        <p className="text-sm text-slate-300" aria-live="polite">
          {readyPeerCount} of {readyPeerTotal} ready
        </p>
      )}
      <Button
        type="button"
        onClick={onMarkReady}
        disabled={actionPending || !hasGift || !hasAddress}
        className={`${touchClass} w-full sm:w-auto px-12 text-lg font-bold`}
        data-testid="guest-ready-cta"
      >
        {LOBBY_SETUP_STRINGS['guest.ready.cta']}
      </Button>
      {actionError && (
        <p className="text-sm text-red-400" role="alert">
          {actionError}
        </p>
      )}
    </div>
  );
}