/**
 * The fulfillment snapshot must be written before party.status flips to ENDED,
 * so the giver's address card does not 403 on the end-game race.
 */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..');

const events = [];
const PARTY_ID = 'party-end-order';
const GIFT_ID = 'gift-end-order';
const WINNER_ID = 'winner-end-order';

const giftDoc = {
  id: GIFT_ID,
  data: () => ({ partyId: PARTY_ID, submitterId: 'sender-1', winnerId: null }),
};

const fakeDb = {
  collection(name) {
    if (name === 'gifts') {
      return {
        where() {
          return {
            async get() {
              return {
                docs: [
                  {
                    id: giftDoc.id,
                    data: giftDoc.data,
                    ref: {
                      update: async () => {
                        events.push('gift.retention');
                      },
                    },
                  },
                ],
              };
            },
          };
        },
        doc() {
          return {
            update: async () => {
              events.push('gift.winnerId');
            },
          };
        },
      };
    }
    if (name === 'parties') {
      return {
        doc() {
          return {
            update: async (data) => {
              if (data.status === 'ENDED') {
                events.push('party.status ENDED');
              } else {
                events.push('party.update');
              }
            },
          };
        },
      };
    }
    throw new Error(`unexpected collection ${name}`);
  },
  batch() {
    return {
      update() {},
      async commit() {
        events.push('gift.retention');
      },
    };
  },
};

mock.module('firebase-admin', {
  defaultExport: { firestore: { Timestamp: { now: () => ({ seconds: 0 }) } } },
});
mock.module(path.join(serverRoot, 'config/firebase-admin.js'), {
  namedExports: { db: fakeDb, auth: {} },
});
mock.module(path.join(serverRoot, 'engine.js'), {
  namedExports: {
    GameEngine: class {
      endGame() {
        return {
          finalOwnership: { [GIFT_ID]: WINNER_ID },
          state: { history: [], phase: 'ENDED' },
        };
      }
    },
  },
});

let snapshotImpl = async () => {
  events.push('saveShippingFulfillmentSnapshot');
  return true;
};

mock.module(path.join(serverRoot, 'utils/game-state-persistence.js'), {
  namedExports: {
    redisTtlSecondsForPartyStatus: (status) => (status === 'ENDED' ? 2592000 : 63072000),
    saveGameState: async () => {
      events.push('saveGameState');
    },
  },
});
mock.module(path.join(serverRoot, 'utils/shipping-fulfillment-snapshot.js'), {
  namedExports: {
    saveShippingFulfillmentSnapshot: async (...args) => snapshotImpl(...args),
  },
});

const { finalizeEndedGame } = await import(path.join(serverRoot, 'utils/finalize-ended-game.js'));

function ioStub() {
  return {
    to() {
      return {
        emit() {
          events.push('game-ended');
        },
      };
    },
  };
}

const endedState = { partyId: PARTY_ID, phase: 'ENDED', config: { maxSteals: 3 } };

test('writes the fulfillment snapshot before flipping party.status to ENDED', async () => {
  events.length = 0;
  snapshotImpl = async () => {
    events.push('saveShippingFulfillmentSnapshot');
    return true;
  };
  await finalizeEndedGame(PARTY_ID, endedState, ioStub());
  const snapshotAt = events.indexOf('saveShippingFulfillmentSnapshot');
  const statusAt = events.indexOf('party.status ENDED');
  const stateAt = events.indexOf('saveGameState');
  const winnerAt = events.indexOf('gift.winnerId');
  assert.ok(snapshotAt >= 0, `snapshot missing in ${JSON.stringify(events)}`);
  assert.ok(statusAt >= 0, `status ENDED missing in ${JSON.stringify(events)}`);
  assert.ok(snapshotAt < statusAt, `snapshot must come before status ENDED: ${JSON.stringify(events)}`);
  assert.ok(stateAt >= 0 && stateAt < statusAt, `saveGameState must come before status ENDED: ${JSON.stringify(events)}`);
  assert.ok(winnerAt >= 0 && winnerAt < statusAt, `gift winnerId must come before status ENDED: ${JSON.stringify(events)}`);
  assert.ok(events.includes('game-ended'));
});

test('still flips party.status to ENDED if the snapshot fails, and logs only {code,name}', async () => {
  events.length = 0;
  const logged = [];
  const originalError = console.error;
  console.error = (...args) => {
    logged.push(args);
  };
  snapshotImpl = async () => {
    events.push('saveShippingFulfillmentSnapshot');
    const err = new Error('redis down');
    err.code = 'ECONNREFUSED';
    err.name = 'Error';
    throw err;
  };
  try {
    await finalizeEndedGame(PARTY_ID, endedState, ioStub());
  } finally {
    console.error = originalError;
  }
  assert.ok(events.includes('party.status ENDED'), `party must still end: ${JSON.stringify(events)}`);
  assert.ok(events.includes('game-ended'));
  const snapshotLog = logged.find((args) => String(args[0]).includes('fulfillment snapshot'));
  assert.ok(snapshotLog, 'expected a snapshot failure log');
  assert.deepEqual(snapshotLog[1], { code: 'ECONNREFUSED', name: 'Error' });
  const blob = JSON.stringify(logged);
  assert.doesNotMatch(blob, /redis down/);
});
