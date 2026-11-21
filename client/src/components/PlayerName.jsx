/**
 * Game-room player name: seat/roster text, a loading skeleton, or the unnamed-player word.
 * Optional Bot tag matches the lobby chip.
 */
import { GAME_USER_COPY } from '../utils/gameUserCopy.js';
import { isBotParticipantId } from '../utils/seatDisplayName.js';

export function BotTag() {
  return (
    <span className="shrink-0 text-xs bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded border border-purple-500/30">
      🤖 Bot
    </span>
  );
}

export function NameLoadingSkeleton({ className = '' }) {
  return (
    <span
      className={`inline-block h-4 w-16 rounded bg-slate-700/60 ${className}`.trim()}
      aria-label={GAME_USER_COPY.nameLoadingLabel}
    />
  );
}

export function PlayerName({ nameState, id, showBotTag = false, className = '' }) {
  const bot = showBotTag && isBotParticipantId(id);
  if (!nameState || nameState.status === 'loading') {
    return (
      <span className={`inline-flex items-center gap-1 min-w-0 ${className}`.trim()}>
        <NameLoadingSkeleton />
        {bot ? <BotTag /> : null}
      </span>
    );
  }
  const name = nameState.name || GAME_USER_COPY.unnamedPlayer;
  return (
    <span className={`inline-flex items-center gap-1 min-w-0 ${className}`.trim()} title={name}>
      <span className="truncate">{name}</span>
      {bot ? <BotTag /> : null}
    </span>
  );
}
