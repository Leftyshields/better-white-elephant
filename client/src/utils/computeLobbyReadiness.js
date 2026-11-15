import { hasLobbyShippingAddress } from './hasLobbyShippingAddress.js';

export const LOBBY_MISSING = {
  NOT_JOINED: 'not_joined',
  GIFT: 'gift',
  ADDRESS: 'address',
};

/**
 * Party lobby readiness (client-only inputs).
 *
 * Roster: every participant document in the lobby.
 * Pending email invitees are not in `participants` and are not counted.
 * Bots count as ready when `participant.ready === true` (auto-ready on join).
 */
export function computeLobbyReadiness({
  party,
  participants,
  gifts,
  addressesByUserId = {},
  botIdsByUserId = {},
}) {
  const adminId = party?.adminId;
  const giftBySubmitter = new Map(
    (gifts || []).map((g) => [g.submitterId, g]),
  );

  const goingParticipants = (participants || []).filter(
    (p) => p.status === 'GOING',
  );

  function isBot(userId) {
    return Boolean(botIdsByUserId[userId]) || String(userId).startsWith('bot_');
  }

  function hasGift(userId) {
    return giftBySubmitter.has(userId);
  }

  function resolveHasAddress(participant) {
    const fromMap = addressesByUserId[participant.id];
    if (fromMap !== undefined) {
      return hasLobbyShippingAddress(fromMap);
    }
    if (isBot(participant.id)) {
      return true;
    }
    if (participant.ready === true) {
      return true;
    }
    return false;
  }

  function buildMissing(participant, joined, hasGiftForUser, hasAddressForUser) {
    const missing = [];
    if (!joined) {
      missing.push(LOBBY_MISSING.NOT_JOINED);
      return missing;
    }
    if (!hasGiftForUser) {
      missing.push(LOBBY_MISSING.GIFT);
    }
    if (!hasAddressForUser) {
      missing.push(LOBBY_MISSING.ADDRESS);
    }
    return missing;
  }

  function isPersonReady(participant, joined, hasGiftForUser, hasAddressForUser) {
    const isHost = participant.id === adminId;
    if (!joined || !hasGiftForUser || !hasAddressForUser) {
      return false;
    }
    if (isHost) {
      return true;
    }
    return participant.ready === true;
  }

  const people = (participants || []).map((participant) => {
    const joined = participant.status === 'GOING';
    const hasGiftForUser = hasGift(participant.id);
    const hasAddressForUser = resolveHasAddress(participant);
    const missing = buildMissing(
      participant,
      joined,
      hasGiftForUser,
      hasAddressForUser,
    );
    const ready = isPersonReady(
      participant,
      joined,
      hasGiftForUser,
      hasAddressForUser,
    );

    return {
      userId: participant.id,
      joined,
      hasGift: hasGiftForUser,
      hasAddress: hasAddressForUser,
      ready,
      missing,
      isHost: participant.id === adminId,
    };
  });

  const totalCount = goingParticipants.length;
  const readyCount = people.filter(
    (p) => p.joined && p.ready,
  ).length;
  const allReady =
    totalCount >= 2 && readyCount === totalCount && totalCount > 0;

  const hostPerson = people.find((p) => p.isHost);
  const hostHasGift = hostPerson?.hasGift ?? false;
  const hostHasAddress = hostPerson?.hasAddress ?? false;
  const hostReadyForStart = hostHasGift && hostHasAddress;

  const hostLockedMissing = [];
  if (!hostHasGift) {
    hostLockedMissing.push(LOBBY_MISSING.GIFT);
  }
  if (!hostHasAddress) {
    hostLockedMissing.push(LOBBY_MISSING.ADDRESS);
  }

  return {
    people,
    readyCount,
    totalCount,
    allReady,
    hostReadyForStart,
    hostLockedMissing,
    hostHasGift,
    hostHasAddress,
    /** Host setup step 5 checklist (fixes false-complete when guests are not ready). */
    hostStartStepComplete: hostReadyForStart && allReady,
  };
}