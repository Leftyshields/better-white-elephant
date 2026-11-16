/**
 * Firestore security rules tests for gifts and parties (pre-game integrity, server-owned fields).
 * Run with: npm run test:firestore-rules
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RULES_PATH = resolve(__dirname, '../firestore.rules');
const PROJECT_ID = 'better-white-elephant-rules-test';

const ADMIN_ID = 'admin-user-001';
const SUBMITTER_ID = 'submitter-user-002';
const STRANGER_ID = 'stranger-user-003';

const PARTY_ID = 'party-test-001';
const GIFT_ID = 'gift-test-001';

const baseGift = {
  partyId: PARTY_ID,
  submitterId: SUBMITTER_ID,
  url: 'https://example.com/gift',
  title: 'Test Gift',
  image: 'https://example.com/img.png',
  price: 25,
  isFrozen: false,
  winnerId: null,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-01T00:00:00Z'),
};

const lobbyParty = {
  adminId: ADMIN_ID,
  title: 'Holiday Swap',
  date: new Date('2025-12-20T18:00:00Z'),
  status: 'LOBBY',
  config: { maxSteals: 3, returnToStart: false, priceLimit: null },
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-01T00:00:00Z'),
};

const activeParty = {
  ...lobbyParty,
  status: 'ACTIVE',
  gameState: { phase: 'ACTIVE', currentPlayerId: ADMIN_ID },
  gameStateUpdatedAt: new Date('2025-01-02T00:00:00Z'),
};

/** @type {import('@firebase/rules-unit-testing').RulesTestEnvironment} */
let testEnv;

function authedDb(uid) {
  // Hosts must sign in with Google (item 1 gate); model existing users as Google sign-ins.
  return testEnv.authenticatedContext(uid, { firebase: { sign_in_provider: 'google.com' } }).firestore();
}

async function seedLobbyGiftAndParty() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'parties', PARTY_ID), lobbyParty);
    await setDoc(doc(db, 'parties', PARTY_ID, 'participants', SUBMITTER_ID), {
      status: 'GOING',
      ready: true,
      joinedAt: new Date(),
      updatedAt: new Date(),
    });
    await setDoc(doc(db, 'gifts', GIFT_ID), baseGift);
  });
}

async function seedActivePartyGift() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'parties', PARTY_ID), activeParty);
    await setDoc(doc(db, 'parties', PARTY_ID, 'participants', SUBMITTER_ID), {
      status: 'GOING',
      ready: true,
      joinedAt: new Date(),
      updatedAt: new Date(),
    });
    await setDoc(doc(db, 'gifts', GIFT_ID), baseGift);
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

describe('gifts — pre-game submitter edits', () => {
  it('submitter can edit own gift while party is LOBBY', async () => {
    await seedLobbyGiftAndParty();
    const db = authedDb(SUBMITTER_ID);
    await assertSucceeds(
      updateDoc(doc(db, 'gifts', GIFT_ID), {
        title: 'Updated Gift Title',
        price: 30,
        updatedAt: new Date(),
      }),
    );
  });

  it('submitter cannot change submitterId', async () => {
    await seedLobbyGiftAndParty();
    const db = authedDb(SUBMITTER_ID);
    await assertFails(
      updateDoc(doc(db, 'gifts', GIFT_ID), {
        submitterId: STRANGER_ID,
        updatedAt: new Date(),
      }),
    );
  });

  it('cannot edit gift after game starts (party ACTIVE)', async () => {
    await seedActivePartyGift();
    const db = authedDb(SUBMITTER_ID);
    await assertFails(
      updateDoc(doc(db, 'gifts', GIFT_ID), {
        title: 'Too Late',
        updatedAt: new Date(),
      }),
    );
  });

  it('stranger cannot edit someone else gift', async () => {
    await seedLobbyGiftAndParty();
    const db = authedDb(STRANGER_ID);
    await assertFails(
      updateDoc(doc(db, 'gifts', GIFT_ID), {
        title: 'Stolen edit',
        updatedAt: new Date(),
      }),
    );
  });
});

describe('parties — admin updates and server-owned fields', () => {
  it('admin can edit allowed lobby fields (title, config, date, updatedAt)', async () => {
    await seedLobbyGiftAndParty();
    const db = authedDb(ADMIN_ID);
    await assertSucceeds(
      updateDoc(doc(db, 'parties', PARTY_ID), {
        title: 'Renamed Party',
        date: new Date('2025-12-25T18:00:00Z'),
        config: { maxSteals: 5, returnToStart: true, priceLimit: 50 },
        updatedAt: new Date(),
      }),
    );
  });

  it('admin cannot set party status to ACTIVE', async () => {
    await seedLobbyGiftAndParty();
    const db = authedDb(ADMIN_ID);
    await assertFails(
      updateDoc(doc(db, 'parties', PARTY_ID), {
        status: 'ACTIVE',
        updatedAt: new Date(),
      }),
    );
  });

  it('admin cannot set party status to ENDED', async () => {
    await seedLobbyGiftAndParty();
    const db = authedDb(ADMIN_ID);
    await assertFails(
      updateDoc(doc(db, 'parties', PARTY_ID), {
        status: 'ENDED',
        updatedAt: new Date(),
      }),
    );
  });

  it('admin cannot inject or overwrite gameState', async () => {
    await seedLobbyGiftAndParty();
    const db = authedDb(ADMIN_ID);
    await assertFails(
      updateDoc(doc(db, 'parties', PARTY_ID), {
        gameState: { phase: 'ACTIVE' },
        updatedAt: new Date(),
      }),
    );
  });

  it('admin can cancel party from LOBBY (status CANCELLED)', async () => {
    await seedLobbyGiftAndParty();
    const db = authedDb(ADMIN_ID);
    await assertSucceeds(
      updateDoc(doc(db, 'parties', PARTY_ID), {
        status: 'CANCELLED',
        updatedAt: new Date(),
      }),
    );
  });
});

describe('gifts — create integrity', () => {
  it('rejects create when submitterId does not match auth', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'parties', PARTY_ID), lobbyParty);
      await setDoc(doc(db, 'parties', PARTY_ID, 'participants', SUBMITTER_ID), {
        status: 'GOING',
        ready: false,
      });
    });
    const db = authedDb(SUBMITTER_ID);
    await assertFails(
      setDoc(doc(db, 'gifts', 'gift-new'), {
        ...baseGift,
        submitterId: STRANGER_ID,
      }),
    );
  });

  it('rejects create when party is not LOBBY', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'parties', PARTY_ID), activeParty);
      await setDoc(doc(db, 'parties', PARTY_ID, 'participants', SUBMITTER_ID), {
        status: 'GOING',
        ready: false,
      });
    });
    const db = authedDb(SUBMITTER_ID);
    await assertFails(setDoc(doc(db, 'gifts', 'gift-new'), baseGift));
  });

  it('seated participant can create a gift while party is LOBBY', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'parties', PARTY_ID), lobbyParty);
      await setDoc(doc(db, 'parties', PARTY_ID, 'participants', SUBMITTER_ID), {
        status: 'GOING',
        ready: false,
      });
    });
    const db = authedDb(SUBMITTER_ID);
    await assertSucceeds(setDoc(doc(db, 'gifts', 'gift-new'), baseGift));
  });

  it('non-participant signed-in user cannot create a gift', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'parties', PARTY_ID), lobbyParty);
    });
    const db = authedDb(STRANGER_ID);
    await assertFails(
      setDoc(doc(db, 'gifts', 'gift-stranger'), {
        ...baseGift,
        submitterId: STRANGER_ID,
      }),
    );
  });
});