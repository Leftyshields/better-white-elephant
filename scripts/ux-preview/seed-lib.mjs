/**
 * Idempotent UX preview seed data (fixed IDs for parties and reviewer account email).
 */

export const PREVIEW_REVIEWER_EMAIL = 'ux-reviewer@preview.stealorreveal.test';

export const PARTY_IDS = {
  lobby: 'ux-preview-lobby',
  active: 'ux-preview-active',
  ended: 'ux-preview-ended',
};

export const BOT_PARTICIPANTS = [
  { id: 'ux-preview-bot-alice', displayName: 'Alice Preview', email: 'alice@preview.stealorreveal.test' },
  { id: 'ux-preview-bot-bob', displayName: 'Bob Preview', email: 'bob@preview.stealorreveal.test' },
  { id: 'ux-preview-bot-carol', displayName: 'Carol Preview', email: 'carol@preview.stealorreveal.test' },
];

export function basePartyDoc(adminId, title, status) {
  const now = new Date();
  const partyDate = new Date();
  partyDate.setDate(partyDate.getDate() + 7);
  return {
    adminId,
    title,
    date: partyDate,
    status,
    config: {
      maxSteals: 3,
      returnToStart: false,
      priceLimit: 50,
    },
    createdAt: now,
    updatedAt: now,
  };
}

export function participantDoc(status = 'GOING', turnNumber = null) {
  const now = new Date();
  return {
    status,
    turnNumber,
    joinedAt: now,
    updatedAt: now,
    ready: status === 'GOING',
  };
}

export function giftDoc(partyId, submitterId, title, overrides = {}) {
  const now = new Date();
  return {
    partyId,
    submitterId,
    url: 'https://example.com/gift',
    title,
    image: null,
    price: 25,
    isFrozen: false,
    winnerId: overrides.winnerId ?? null,
    ownerId: overrides.ownerId ?? null,
    stealCount: overrides.stealCount ?? 0,
    createdAt: now,
    updatedAt: now,
  };
}

/** Minimal active-phase snapshot for Firestore (live turns still need preview game server + Redis). */
export function sampleActiveGameState(partyId, adminId, botIds) {
  const giftA = 'ux-preview-gift-active-a';
  const giftB = 'ux-preview-gift-active-b';
  const turnOrder = [adminId, ...botIds];
  return {
    partyId,
    phase: 'ACTIVE',
    currentTurnIndex: 0,
    currentPlayerId: adminId,
    turnOrder,
    turnQueue: [...turnOrder],
    wrappedGifts: [giftB],
    unwrappedGifts: {
      [giftA]: { giftId: giftA, ownerId: adminId, stealCount: 0, isFrozen: false, title: 'Desk Plant' },
    },
    turnAction: {},
    stealStack: [],
    config: { maxSteals: 3, returnToStart: false },
    stateVersion: Date.now(),
    updatedAt: new Date().toISOString(),
  };
}

export function endedGameState(partyId) {
  return {
    partyId,
    phase: 'ENDED',
    stateVersion: Date.now(),
    updatedAt: new Date().toISOString(),
  };
}

export function buildSeedPlan(reviewerUid) {
  const botIds = BOT_PARTICIPANTS.map((b) => b.id);
  return {
    reviewerUid,
    parties: [
      {
        id: PARTY_IDS.lobby,
        data: basePartyDoc(reviewerUid, 'UX Preview — Lobby', 'LOBBY'),
        participants: [
          { id: reviewerUid, ...participantDoc('GOING', 1) },
          ...botIds.map((id, index) => ({ id, ...participantDoc('GOING', index + 2) })),
        ],
        gifts: [
          { id: 'ux-preview-gift-lobby-1', ...giftDoc(PARTY_IDS.lobby, reviewerUid, 'Lobby Candle Set') },
          { id: 'ux-preview-gift-lobby-2', ...giftDoc(PARTY_IDS.lobby, botIds[0], 'Lobby Snack Box') },
        ],
      },
      {
        id: PARTY_IDS.active,
        data: {
          ...basePartyDoc(reviewerUid, 'UX Preview — Active', 'ACTIVE'),
          gameState: sampleActiveGameState(PARTY_IDS.active, reviewerUid, botIds),
        },
        participants: [
          { id: reviewerUid, ...participantDoc('GOING', 1) },
          ...botIds.map((id, index) => ({ id, ...participantDoc('GOING', index + 2) })),
        ],
        gifts: [
          {
            id: 'ux-preview-gift-active-a',
            ...giftDoc(PARTY_IDS.active, reviewerUid, 'Desk Plant', { ownerId: reviewerUid }),
          },
          {
            id: 'ux-preview-gift-active-b',
            ...giftDoc(PARTY_IDS.active, botIds[0], 'Mystery Box'),
          },
        ],
      },
      {
        id: PARTY_IDS.ended,
        data: {
          ...basePartyDoc(reviewerUid, 'UX Preview — Ended', 'ENDED'),
          gameState: endedGameState(PARTY_IDS.ended),
        },
        participants: [
          { id: reviewerUid, ...participantDoc('GOING', 1) },
          ...botIds.map((id, index) => ({ id, ...participantDoc('GOING', index + 2) })),
        ],
        gifts: [
          {
            id: 'ux-preview-gift-ended-1',
            ...giftDoc(PARTY_IDS.ended, botIds[0], 'Vintage Mug', { winnerId: reviewerUid }),
          },
          {
            id: 'ux-preview-gift-ended-2',
            ...giftDoc(PARTY_IDS.ended, reviewerUid, 'Board Game', { winnerId: botIds[1] }),
          },
        ],
      },
    ],
    users: [
      {
        id: reviewerUid,
        displayName: 'UX Reviewer',
        email: PREVIEW_REVIEWER_EMAIL,
      },
      ...BOT_PARTICIPANTS.map((bot) => ({
        id: bot.id,
        displayName: bot.displayName,
        email: bot.email,
      })),
    ],
  };
}
