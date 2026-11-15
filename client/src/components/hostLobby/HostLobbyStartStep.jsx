/**
 * Host lobby step 5: start when everyone is ready (LOCKED / WAITING / DONE).
 */
import lobbySetupStrings from '../../copy/lobbySetupStrings.js';
import { Button } from '../ui/Button.jsx';
import { deriveHostLobbyStartStepState } from '../../utils/hostLobbyStartStepState.js';
import { resolveLobbyParticipantDisplayName } from '../../utils/lobbyDisplayName.js';
import {
  formatHostStartCount,
  formatHostStartLockedMessage,
  formatWaitLine,
} from '../../utils/hostLobbyStartCopy.js';

/**
 * @param {object} props
 * @param {ReturnType<import('../../utils/computeLobbyReadiness.js').computeLobbyReadiness>} readiness
 * @param {Record<string, string>} displayNamesByUserId
 * @param {boolean} startDisabled
 * @param {() => void} onStartGame
 * @param {{ message?: string, onRetry?: () => void } | null} loadError
 */
export function HostLobbyStartStep({
  readiness,
  displayNamesByUserId = {},
  startDisabled,
  onStartGame,
  loadError = null,
}) {
  const stepState = deriveHostLobbyStartStepState(readiness);

  if (loadError?.message) {
    return (
      <div className="p-4 sm:p-6 space-y-4 min-w-0">
        <p className="text-red-300 text-sm" role="alert">
          {loadError.message || lobbySetupStrings['error.load']}
        </p>
        {loadError.onRetry && (
          <Button
            type="button"
            onClick={loadError.onRetry}
            className="w-full sm:w-auto min-h-11"
          >
            {lobbySetupStrings['error.load.retry']}
          </Button>
        )}
      </div>
    );
  }

  const waitLines = [];
  const sortedPeople = [...(readiness.people || [])].sort((a, b) =>
    a.userId.localeCompare(b.userId),
  );

  for (const person of sortedPeople) {
    if (person.ready) {
      continue;
    }
    const displayName = resolveLobbyParticipantDisplayName(
      person.userId,
      displayNamesByUserId,
    );
    for (const missingType of person.missing) {
      const line = formatWaitLine(missingType, displayName);
      if (line) {
        waitLines.push({ key: `${person.userId}-${missingType}`, line });
      }
    }
  }

  if (stepState === 'LOCKED') {
    return (
      <div className="p-4 sm:p-6 space-y-3 min-w-0">
        <p className="text-slate-300 text-sm sm:text-base">
          {formatHostStartLockedMessage(readiness.hostLockedMissing)}
        </p>
        <ul className="text-slate-400 text-sm list-disc pl-5 space-y-1">
          {!readiness.hostHasGift && (
            <li>{lobbySetupStrings['guest.ready.missing.gift']}</li>
          )}
          {!readiness.hostHasAddress && (
            <li>{lobbySetupStrings['guest.ready.missing.address']}</li>
          )}
        </ul>
      </div>
    );
  }

  if (stepState === 'DONE') {
    return (
      <div className="p-4 sm:p-6 space-y-4 min-w-0">
        <div className="bg-green-500/10 border-2 border-green-500/30 rounded-lg p-4">
          <p className="text-green-400 font-semibold text-sm sm:text-base">
            {lobbySetupStrings['host.start.all_ready']}
          </p>
        </div>
        <Button
          type="button"
          onClick={onStartGame}
          disabled={startDisabled}
          className="w-full min-h-11 text-base font-semibold shadow-lg"
        >
          {lobbySetupStrings['host.start.cta']}
        </Button>
      </div>
    );
  }

  const countText = formatHostStartCount(
    readiness.readyCount,
    readiness.totalCount,
  );

  return (
    <div className="p-4 sm:p-6 space-y-4 min-w-0">
      <p
        className="text-amber-300 font-medium text-sm sm:text-base"
        aria-live="polite"
      >
        {countText}
      </p>
      {waitLines.length > 0 && (
        <ul className="space-y-2 text-sm text-slate-300">
          {waitLines.map((item) => (
            <li
              key={item.key}
              className="bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-3 min-h-11 flex items-center"
            >
              {item.line}
            </li>
          ))}
        </ul>
      )}
      <p className="text-slate-400 text-sm">{lobbySetupStrings['host.start.disabled']}</p>
      <Button
        type="button"
        onClick={onStartGame}
        disabled
        className="w-full min-h-11 text-base font-semibold opacity-60 cursor-not-allowed"
        aria-disabled="true"
      >
        {lobbySetupStrings['host.start.cta']}
      </Button>
    </div>
  );
}

export { deriveHostLobbyStartStepState };