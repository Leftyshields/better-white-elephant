import test from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mockIo } from './helpers/test-store.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..');

mock.module('firebase-admin', {
  defaultExport: {
    firestore: { Timestamp: { now: () => ({}) } },
  },
});

mock.module(path.join(serverRoot, 'config/firebase-admin.js'), {
  namedExports: {
    db: {
      collection() {
        return { doc: () => ({ get: async () => ({ exists: false }) }) };
      },
    },
  },
});

const { onSocketPickGift } = await import('../handlers/pick-gift-socket.js');
import { PICK_GIFT_NOT_ON_TURN } from '../utils/pick-gift-guards.js';

const PARTY_ID = 'party-spoof';
const SOCKET_USER = 'p2';
const ATTACKER_IN_PAYLOAD = 'p1';

function isValidPartyId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]+$/.test(id);
}
function isValidGiftId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]+$/.test(id);
}

test('pick-gift socket uses authenticated socket.userId even when payload includes another userId', async () => {
  let actorUserId = null;
  const socketErrors = [];
  const socket = {
    userId: SOCKET_USER,
    emit(event, payload) {
      if (event === 'error') socketErrors.push(payload);
    },
  };

  await onSocketPickGift(
    socket,
    { partyId: PARTY_ID, giftId: 'g1', userId: ATTACKER_IN_PAYLOAD },
    {
      io: mockIo(),
      isValidPartyId,
      isValidGiftId,
      verifyPartyMembership: async () => true,
      scheduleBotMove: null,
      executePick: async (_partyId, _giftId, userId) => {
        actorUserId = userId;
        throw new Error(PICK_GIFT_NOT_ON_TURN);
      },
    },
  );

  assert.equal(actorUserId, SOCKET_USER, 'must not honor spoofed payload userId');
  assert.notEqual(actorUserId, ATTACKER_IN_PAYLOAD);
  assert.equal(socketErrors[0]?.message, PICK_GIFT_NOT_ON_TURN);
});