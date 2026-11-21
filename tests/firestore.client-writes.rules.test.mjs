/**
 * Emulator tests mirroring real client Firestore write paths (client/src).
 * Run with: npm run test:firestore-rules
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, beforeEach, describe, it } from 'node:test';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc,
} from 'firebase/firestore';
import { createPartyWithInviteToken, joinPartyWithInviteToken } from './helpers/party-invite-batches.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RULES_PATH = resolve(__dirname, '../firestore.rules');
const PROJECT_ID = 'better-white-elephant-rules-test';

const ADMIN_ID = 'admin-home-001';
const GUEST_ID = 'guest-join-002';
const OTHER_ID = 'other-003';

const PARTY_ID = 'party-client-writes';
const GIFT_ID = 'gift-client-writes';

const lobbyParty = {
  adminId: ADMIN_ID,
  title: 'Client Writes Party',
  date: new Date('2025-12-20T18:00:00Z'),
  status: 'LOBBY',
  config: { maxSteals: 3, returnToStart: false, priceLimit: null },
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-01T00:00:00Z'),
};

const HOST_SEAT = {
  status: 'PENDING',
  turnNumber: null,
  ready: false,
  joinedAt: new Date(),
  updatedAt: new Date(),
};

const INVITE_TOKEN = '0123456789abcdef0123456789abcdef';

const giftPayload = {
  partyId: PARTY_ID,
  submitterId: GUEST_ID,
  url: 'https://example.com/item',
  title: 'Lobby Gift',
  image: 'https://example.com/img.png',
  price: 19.99,
  isFrozen: false,
  winnerId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

/** @type {import('@firebase/rules-unit-testing').RulesTestEnvironment} */
let testEnv;

function authedDb(uid) {
  // Hosts must sign in with Google (item 1 gate); model existing users as Google sign-ins.
  return testEnv.authenticatedContext(uid, { firebase: { sign_in_provider: 'google.com' } }).firestore();
}

async function seedLobbyParty() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'parties', PARTY_ID), lobbyParty);
  });
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(RULES_PATH, 'utf8'),
    },
  });
});

after(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

describe('client path: Home.jsx — create party + admin participant', () => {
  it('createPartyWithInviteToken: party + host seat + invite token in one batch', async () => {
    const db = authedDb(ADMIN_ID);
    await assertSucceeds(
      createPartyWithInviteToken(db, ADMIN_ID, {
        adminId: ADMIN_ID,
        title: 'New Swap',
        date: new Date('2025-12-01T12:00:00Z'),
        status: 'LOBBY',
        hostDisplayName: 'Taylor Host',
        config: { maxSteals: 3, returnToStart: false },
        createdAt: new Date(),
        updatedAt: new Date(),
      }, HOST_SEAT),
    );
  });

  it('denies the old two-step create (party alone, no seat or invite token)', async () => {
    const db = authedDb(ADMIN_ID);
    await assertFails(
      addDoc(collection(db, 'parties'), {
        adminId: ADMIN_ID,
        status: 'LOBBY',
        config: { maxSteals: 3, returnToStart: false },
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
  });
});

describe('client path: useAuth.js (PR #91) — hostDisplayName sync on hosted parties', () => {
  beforeEach(async () => {
    await seedLobbyParty();
  });

  it('admin updates hostDisplayName + updatedAt only', async () => {
    const db = authedDb(ADMIN_ID);
    await assertSucceeds(
      updateDoc(doc(db, 'parties', PARTY_ID), {
        hostDisplayName: 'Jessica Host',
        updatedAt: new Date(),
      }),
    );
  });

  it('rejects email-shaped hostDisplayName', async () => {
    const db = authedDb(ADMIN_ID);
    await assertFails(
      updateDoc(doc(db, 'parties', PARTY_ID), {
        hostDisplayName: 'host@example.com',
        updatedAt: new Date(),
      }),
    );
  });
});

describe('validHostDisplayName — trim-equivalent rules (create + admin update)', () => {
  const partyCreateBase = {
    adminId: ADMIN_ID,
    status: 'LOBBY',
    config: { maxSteals: 3, returnToStart: false },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    await seedLobbyParty();
  });

  it('accepts a normal hostDisplayName on create', async () => {
    const db = authedDb(ADMIN_ID);
    await assertSucceeds(
      createPartyWithInviteToken(db, ADMIN_ID, {
        ...partyCreateBase,
        hostDisplayName: 'Jessica Host',
      }, HOST_SEAT),
    );
  });

  it('rejects whitespace-only hostDisplayName on create', async () => {
    const db = authedDb(ADMIN_ID);
    await assertFails(
      createPartyWithInviteToken(db, ADMIN_ID, {
        ...partyCreateBase,
        hostDisplayName: '   ',
      }, HOST_SEAT),
    );
  });

  it('rejects tab-only hostDisplayName on create', async () => {
    const db = authedDb(ADMIN_ID);
    await assertFails(
      createPartyWithInviteToken(db, ADMIN_ID, {
        ...partyCreateBase,
        hostDisplayName: '\t',
      }, HOST_SEAT),
    );
  });

  it('rejects leading or trailing space on create', async () => {
    const db = authedDb(ADMIN_ID);
    await assertFails(
      createPartyWithInviteToken(db, ADMIN_ID, {
        ...partyCreateBase,
        hostDisplayName: ' Host Name',
      }, HOST_SEAT),
    );
    await assertFails(
      createPartyWithInviteToken(db, ADMIN_ID, {
        ...partyCreateBase,
        hostDisplayName: 'Host Name ',
      }, HOST_SEAT),
    );
  });

  it('rejects hostDisplayName longer than 64 characters on create', async () => {
    const db = authedDb(ADMIN_ID);
    const longName = `A${'b'.repeat(64)}`;
    await assertFails(
      createPartyWithInviteToken(db, ADMIN_ID, {
        ...partyCreateBase,
        hostDisplayName: longName,
      }, HOST_SEAT),
    );
  });

  it('accepts a normal hostDisplayName on admin update', async () => {
    const db = authedDb(ADMIN_ID);
    await assertSucceeds(
      updateDoc(doc(db, 'parties', PARTY_ID), {
        hostDisplayName: 'Taylor Host',
        updatedAt: new Date(),
      }),
    );
  });

  it('rejects whitespace-only hostDisplayName on admin update', async () => {
    const db = authedDb(ADMIN_ID);
    await assertFails(
      updateDoc(doc(db, 'parties', PARTY_ID), {
        hostDisplayName: '   ',
        updatedAt: new Date(),
      }),
    );
  });

  it('rejects leading or trailing space on admin update', async () => {
    const db = authedDb(ADMIN_ID);
    await assertFails(
      updateDoc(doc(db, 'parties', PARTY_ID), {
        hostDisplayName: ' Taylor',
        updatedAt: new Date(),
      }),
    );
  });

  it('rejects hostDisplayName longer than 64 characters on admin update', async () => {
    const db = authedDb(ADMIN_ID);
    const longName = `A${'b'.repeat(64)}`;
    await assertFails(
      updateDoc(doc(db, 'parties', PARTY_ID), {
        hostDisplayName: longName,
        updatedAt: new Date(),
      }),
    );
  });
});

describe('client path: PartyManagement.jsx / PartyLobby.jsx — party admin updates', () => {
  beforeEach(async () => {
    await seedLobbyParty();
  });

  it('updateDoc title + updatedAt (handleUpdateTitle)', async () => {
    const db = authedDb(ADMIN_ID);
    await assertSucceeds(
      updateDoc(doc(db, 'parties', PARTY_ID), {
        title: 'Renamed',
        updatedAt: new Date(),
      }),
    );
  });

  it('updateDoc date + updatedAt (handleUpdateDate)', async () => {
    const db = authedDb(ADMIN_ID);
    await assertSucceeds(
      updateDoc(doc(db, 'parties', PARTY_ID), {
        date: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date(),
      }),
    );
  });

  it('updateDoc config + updatedAt (handleUpdateConfig / handleUpdateRules)', async () => {
    const db = authedDb(ADMIN_ID);
    await assertSucceeds(
      updateDoc(doc(db, 'parties', PARTY_ID), {
        config: { maxSteals: 5, returnToStart: true, priceLimit: 40 },
        updatedAt: new Date(),
      }),
    );
  });

  it('updateDoc status CANCELLED (handleCancelParty)', async () => {
    const db = authedDb(ADMIN_ID);
    await assertSucceeds(
      updateDoc(doc(db, 'parties', PARTY_ID), {
        status: 'CANCELLED',
        updatedAt: new Date(),
      }),
    );
  });
});

describe('client path: PartyLobby.jsx — gifts in lobby', () => {
  beforeEach(async () => {
    await seedLobbyParty();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'parties', PARTY_ID, 'participants', GUEST_ID),
        { status: 'GOING', ready: false, joinedAt: new Date(), updatedAt: new Date() },
      );
    });
  });

  it('addDoc gifts (submit gift)', async () => {
    const db = authedDb(GUEST_ID);
    await assertSucceeds(addDoc(collection(db, 'gifts'), giftPayload));
  });

  it('updateDoc gift metadata (submit gift update)', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'gifts', GIFT_ID), {
        ...giftPayload,
        createdAt: new Date('2025-01-01T00:00:00Z'),
      });
    });
    const db = authedDb(GUEST_ID);
    await assertSucceeds(
      updateDoc(doc(db, 'gifts', GIFT_ID), {
        title: 'Updated title',
        url: 'https://example.com/new',
        image: 'https://example.com/new.png',
        price: 22,
        updatedAt: new Date(),
      }),
    );
  });

  it('deleteDoc own gift (Change Gift)', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'gifts', GIFT_ID), {
        ...giftPayload,
        createdAt: new Date('2025-01-01T00:00:00Z'),
      });
    });
    const db = authedDb(GUEST_ID);
    await assertSucceeds(deleteDoc(doc(db, 'gifts', GIFT_ID)));
  });

  it('admin deleteDoc gift when removing participant (seat removed first, as the app does)', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'gifts', GIFT_ID), {
        ...giftPayload,
        createdAt: new Date('2025-01-01T00:00:00Z'),
      });
    });
    const db = authedDb(ADMIN_ID);
    // G26: while the guest still holds a seat the host can't delete their gift.
    await assertFails(deleteDoc(doc(db, 'gifts', GIFT_ID)));
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await deleteDoc(doc(context.firestore(), 'parties', PARTY_ID, 'participants', giftPayload.submitterId));
    });
    await assertSucceeds(deleteDoc(doc(db, 'gifts', GIFT_ID)));
  });
});

describe('client path: PartyInviteLanding.jsx / PartyLobby.jsx — participants', () => {
  beforeEach(async () => {
    await seedLobbyParty();
  });

  it('joinPartyWithInviteToken on join (PartyInviteLanding)', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'parties', PARTY_ID, 'private', 'invite'), {
        token: INVITE_TOKEN,
      });
    });
    const db = authedDb(GUEST_ID);
    await assertSucceeds(
      joinPartyWithInviteToken(db, PARTY_ID, GUEST_ID, INVITE_TOKEN, {
        status: 'GOING',
        turnNumber: null,
        ready: false,
        joinedAt: new Date(),
        updatedAt: new Date(),
      }),
    );
  });

  it('updateDoc participant ready (handleToggleReady)', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'parties', PARTY_ID, 'participants', GUEST_ID), {
        status: 'GOING',
        ready: false,
        joinedAt: new Date(),
        updatedAt: new Date(),
      });
    });
    const db = authedDb(GUEST_ID);
    await assertSucceeds(
      updateDoc(doc(db, 'parties', PARTY_ID, 'participants', GUEST_ID), {
        ready: true,
        updatedAt: new Date(),
      }),
    );
  });

  it('admin updateDoc participant status (PartyManagement)', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'parties', PARTY_ID, 'participants', GUEST_ID), {
        status: 'PENDING',
        joinedAt: new Date(),
        updatedAt: new Date(),
      });
    });
    const db = authedDb(ADMIN_ID);
    await assertSucceeds(
      updateDoc(doc(db, 'parties', PARTY_ID, 'participants', GUEST_ID), {
        status: 'GOING',
        updatedAt: new Date(),
      }),
    );
  });

  it('admin deleteDoc participant', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'parties', PARTY_ID, 'participants', GUEST_ID), {
        status: 'GOING',
        joinedAt: new Date(),
        updatedAt: new Date(),
      });
    });
    const db = authedDb(ADMIN_ID);
    await assertSucceeds(deleteDoc(doc(db, 'parties', PARTY_ID, 'participants', GUEST_ID)));
  });
});

describe('client path: PartyLobby.jsx / PartyManagement.jsx — pendingInvites', () => {
  beforeEach(async () => {
    await seedLobbyParty();
  });

  it('setDoc pendingInvites (handleAddPerson)', async () => {
    const db = authedDb(ADMIN_ID);
    await assertSucceeds(
      setDoc(doc(db, 'parties', PARTY_ID, 'pendingInvites', 'friend_example_com'), {
        email: 'friend@example.com',
        name: 'Friend',
        status: 'GOING',
        addedAt: new Date(),
        updatedAt: new Date(),
      }),
    );
  });

  it('updateDoc pendingInvites after email send', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'parties', PARTY_ID, 'pendingInvites', 'friend_example_com'), {
        email: 'friend@example.com',
        status: 'PENDING',
        updatedAt: new Date(),
      });
    });
    const db = authedDb(ADMIN_ID);
    await assertSucceeds(
      updateDoc(doc(db, 'parties', PARTY_ID, 'pendingInvites', 'friend_example_com'), {
        status: 'SENT',
        sentAt: new Date(),
        emailFailed: false,
        updatedAt: new Date(),
      }),
    );
  });

  it('admin deleteDoc pendingInvites', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'parties', PARTY_ID, 'pendingInvites', 'friend_example_com'), {
        email: 'friend@example.com',
        status: 'PENDING',
      });
    });
    const db = authedDb(ADMIN_ID);
    await assertSucceeds(
      deleteDoc(doc(db, 'parties', PARTY_ID, 'pendingInvites', 'friend_example_com')),
    );
  });
});

describe('client path: Profile.jsx / AddressModal.jsx — users (not parties)', () => {
  it('owner updateDoc users shipping profile', async () => {
    const db = authedDb(GUEST_ID);
    await assertSucceeds(
      setDoc(doc(db, 'users', GUEST_ID), {
        displayName: 'Guest User',
        email: 'guest@example.com',
        updatedAt: new Date(),
      }),
    );
    await assertSucceeds(
      updateDoc(doc(db, 'users', GUEST_ID), {
        shippingAddress: {
          name: 'Guest',
          street: '1 Main St',
          city: 'Town',
          state: 'ST',
          zip: '12345',
          country: 'US',
        },
        updatedAt: new Date(),
      }),
    );
  });
});

describe('client path: Home.jsx — delete party (existing rules restriction)', () => {
  it('denies deleteDoc parties while still LOBBY (use Cancel instead)', async () => {
    await seedLobbyParty();
    const db = authedDb(ADMIN_ID);
    await assertFails(deleteDoc(doc(db, 'parties', PARTY_ID)));
  });
});

describe('client path removed: GameBoard.jsx LOBBY status reset', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'parties', PARTY_ID), {
        ...lobbyParty,
        status: 'ACTIVE',
        gameState: { phase: 'ACTIVE' },
      });
    });
  });

  it('denies client updateDoc status LOBBY (button removed in app)', async () => {
    const db = authedDb(ADMIN_ID);
    await assertFails(
      updateDoc(doc(db, 'parties', PARTY_ID), {
        status: 'LOBBY',
        updatedAt: new Date(),
      }),
    );
  });
});

describe('no client simulation/bot Firestore writes', () => {
  it('stranger cannot write gifts or parties', async () => {
    await seedLobbyParty();
    const db = authedDb(OTHER_ID);
    await assertFails(
      updateDoc(doc(db, 'parties', PARTY_ID), { title: 'Nope', updatedAt: new Date() }),
    );
    await assertFails(addDoc(collection(db, 'gifts'), giftPayload));
  });
});