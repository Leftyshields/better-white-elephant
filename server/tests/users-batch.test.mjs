import test from 'node:test';
import assert from 'node:assert/strict';
import admin from 'firebase-admin';
import {
  batchUsersLookup,
  getCoParticipantUserIds,
} from '../utils/batch-users.js';

const CALLER_ID = 'caller-user';
const CO_PARTICIPANT_ID = 'co-participant';
const STRANGER_ID = 'stranger-user';
const PARTY_ID = 'party-shared';

function buildMockDb({ callerIsAdmin = true, callerIsParticipant = true } = {}) {
  const users = {
    [CO_PARTICIPANT_ID]: {
      displayName: 'Co Participant',
      email: 'co@secret.example',
    },
    [STRANGER_ID]: {
      displayName: 'Stranger',
      email: 'stranger@secret.example',
    },
  };

  const parties = {
    [PARTY_ID]: {
      adminId: callerIsAdmin ? CALLER_ID : 'other-admin',
    },
  };

  const participantsByParty = {
    [PARTY_ID]: {
      ...(callerIsParticipant ? { [CALLER_ID]: { status: 'GOING' } } : {}),
      [CO_PARTICIPANT_ID]: { status: 'GOING' },
    },
  };

  function participantsCollection(partyId) {
    const rows = participantsByParty[partyId] || {};
    return {
      doc(userId) {
        return {
          async get() {
            const row = rows[userId];
            return { exists: Boolean(row), data: () => row };
          },
        };
      },
      async get() {
        return {
          docs: Object.keys(rows).map((id) => ({
            id,
            ref: {
              parent: { parent: { id: partyId } },
            },
          })),
        };
      },
    };
  }

  return {
    collection(name) {
      if (name === 'parties') {
        return {
          where(field, op, value) {
            assert.equal(field, 'adminId');
            assert.equal(op, '==');
            return {
              async get() {
                const docs = Object.entries(parties)
                  .filter(([, data]) => data.adminId === value)
                  .map(([id, data]) => ({
                    id,
                    data: () => data,
                    ref: { parent: { parent: { id } } },
                  }));
                return { docs };
              },
            };
          },
          doc(partyId) {
            return {
              async get() {
                const row = parties[partyId];
                return { exists: Boolean(row), data: () => row };
              },
              collection(sub) {
                assert.equal(sub, 'participants');
                return participantsCollection(partyId);
              },
            };
          },
        };
      }
      if (name === 'users') {
        return {
          doc(userId) {
            return {
              async get() {
                const row = users[userId];
                return { exists: Boolean(row), data: () => row };
              },
            };
          },
        };
      }
      throw new Error(`unexpected collection ${name}`);
    },
    collectionGroup(name) {
      assert.equal(name, 'participants');
      return {
        where(fieldPath, op, value) {
          assert.equal(fieldPath, admin.firestore.FieldPath.documentId());
          assert.equal(op, '==');
          return {
            async get() {
              const docs = [];
              for (const [partyId, rows] of Object.entries(participantsByParty)) {
                if (rows[value]) {
                  docs.push({
                    id: value,
                    ref: {
                      parent: {
                        parent: { id: partyId },
                      },
                    },
                  });
                }
              }
              return { docs };
            },
          };
        },
      };
    },
  };
}

const mockAuth = {
  async getUser(userId) {
    const emails = {
      [CO_PARTICIPANT_ID]: 'co-from-auth@secret.example',
      [STRANGER_ID]: 'stranger-from-auth@secret.example',
      [CALLER_ID]: 'caller@secret.example',
    };
    return {
      uid: userId,
      displayName: null,
      email: emails[userId] || null,
      photoURL: null,
    };
  },
};

test('batchUsersLookup never includes an emails field', async () => {
  const db = buildMockDb();
  const result = await batchUsersLookup(
    db,
    mockAuth,
    CALLER_ID,
    [CO_PARTICIPANT_ID, STRANGER_ID],
  );

  assert.ok(!('emails' in result));
  assert.ok(CO_PARTICIPANT_ID in result.users);
  assert.equal(result.users[CO_PARTICIPANT_ID], 'Co Participant');
  assert.ok(!(STRANGER_ID in result.users));
});

test('excludes users who do not share a party with the caller', async () => {
  const db = buildMockDb();
  const allowed = await getCoParticipantUserIds(db, CALLER_ID);
  assert.ok(allowed.has(CO_PARTICIPANT_ID));
  assert.ok(!allowed.has(STRANGER_ID));

  const result = await batchUsersLookup(db, mockAuth, CALLER_ID, [STRANGER_ID]);
  assert.equal(Object.keys(result.users).length, 0);
});

test('includes co-participants who share a party', async () => {
  const db = buildMockDb();
  const result = await batchUsersLookup(db, mockAuth, CALLER_ID, [
    CO_PARTICIPANT_ID,
  ]);
  assert.deepEqual(result.users, { [CO_PARTICIPANT_ID]: 'Co Participant' });
  assert.deepEqual(result.bots, { [CO_PARTICIPANT_ID]: false });
  assert.ok('photos' in result);
});
