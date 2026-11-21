/**
 * BUG-23 socket handler: the host takes one turn for an away or idle player
 * (`host_take_turn_for_away { partyId, playerId, action, turnKey }`, answered by ack).
 * Refusals carry a code only (TAKEOVER_CODES); the client maps codes to signed copy.
 */
import { TAKEOVER_ACTIONS, TAKEOVER_CODES } from '../shared/host-takeover.mjs';
import { executeHostTakeover, isHostTakeoverRejectedError } from '../utils/game-turn-handler.mjs';
import { isPartyHostCaller } from '../lib/host-auth.js';

const ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

function isValidRequest(data) {
  return (
    !!data &&
    typeof data === 'object' &&
    typeof data.partyId === 'string' &&
    ID_PATTERN.test(data.partyId) &&
    typeof data.playerId === 'string' &&
    ID_PATTERN.test(data.playerId) &&
    TAKEOVER_ACTIONS.includes(data.action) &&
    typeof data.turnKey === 'string' &&
    data.turnKey.length > 0 &&
    data.turnKey.length <= 64
  );
}

/**
 * @param {{ data: object, socket: { user: object, userId: string }, io: object,
 *   loadParty: (partyId: string) => Promise<object|null>,
 *   presence: { get: (partyId: string, userId: string) => { awaySince: number|null, returnedAt: number|null } },
 *   finalizeEndedGame: Function, scheduleBotMove?: Function, executeTakeover?: Function,
 *   now?: () => number, reply?: (result: object) => void }} deps
 */
export async function handleHostTakeTurn({
  data,
  socket,
  io,
  loadParty,
  presence,
  finalizeEndedGame,
  scheduleBotMove,
  executeTakeover = executeHostTakeover,
  now = () => Date.now(),
  reply = () => {},
}) {
  const answer = (result) => reply({ ...result, serverNow: now() });
  if (!isValidRequest(data)) {
    answer({ ok: false, code: TAKEOVER_CODES.FAILED });
    return;
  }
  const { partyId, playerId, action, turnKey } = data;

  let party;
  try {
    party = await loadParty(partyId);
  } catch {
    answer({ ok: false, code: TAKEOVER_CODES.FAILED });
    return;
  }
  if (!isPartyHostCaller(party, socket.user)) {
    answer({ ok: false, code: TAKEOVER_CODES.NOT_HOST });
    return;
  }
  if (party.status !== 'ACTIVE') {
    answer({ ok: false, code: TAKEOVER_CODES.TURN_MOVED });
    return;
  }

  let newState;
  try {
    ({ newState } = await executeTakeover(partyId, {
      hostId: socket.userId,
      playerId,
      action,
      turnKey,
      presence: () => presence.get(partyId, playerId),
      now,
    }));
  } catch (error) {
    if (isHostTakeoverRejectedError(error)) {
      answer({ ok: false, code: error.code });
      return;
    }
    // Game not found, conflict after retries, or an engine refusal: nothing changed.
    const code = error?.message === 'Game not found' ? TAKEOVER_CODES.TURN_MOVED : TAKEOVER_CODES.FAILED;
    answer({ ok: false, code });
    return;
  }

  const room = io.to(`party:${partyId}`);
  const assisted = [...(newState.history || [])].reverse().find((entry) => entry.assistedBy);
  if (assisted?.type === 'PICK' || assisted?.type === 'STEAL') {
    room.emit('action_started', { type: assisted.type.toLowerCase(), giftId: assisted.giftId, playerId });
  }
  room.emit('game-updated', newState);
  answer({ ok: true });

  if (newState.phase === 'ENDED') {
    await finalizeEndedGame(partyId, newState, io);
    return;
  }
  if (scheduleBotMove) scheduleBotMove(partyId, newState, assisted?.type === 'PICK' ? 3500 : 1000);
}
