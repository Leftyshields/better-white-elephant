import test from 'node:test';
import assert from 'node:assert/strict';
import {
  batchUsersLookup,
  fetchDisplayProfilesForUserIds,
  getPartyMemberUserIds,
  pickDisplayName,
  pickHostNameForInvite,
  displayNameMatchesEmailLocalPart,
  playerFallbackForUserId,
  verifyCallerPartyAccess,
  isValidPartyId,
} from '../utils/batch-users.js';

const CALLER_ID = 'caller-user';
const CO_PARTICIPANT_ID = 'co-participant';
const STRANGER_ID = 'stranger-user';
const PARTY_ID = 'party-shared';

function buildMockDb({
  callerIsAdmin = true,
  callerIsParticipant = true,
  partyExists = true,
  userDocs = {},
} = {}) {
  const docGets = [];

  const users = {
    [CO_PARTICIPANT_ID]: {
      displayName: 'Co Participant',
      email: 'co@secret.example',
    },
    [STRANGER_ID]: {
      displayName: 'Stranger',
      email: 'stranger@secret.example',
    },
    ...userDocs,
  };

  const parties = partyExists
    ? {
        [PARTY_ID]: {
          adminId: callerIsAdmin ? CALLER_ID : 'other-admin',
        },
      }
    : {};

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
            docGets.push(`parties/${partyId}/participants/${userId}`);
            const row = rows[userId];
            return { exists: Boolean(row), data: () => row };
          },
        };
      },
      async get() {
        docGets.push(`parties/${partyId}/participants (list)`);
        return {
          docs: Object.keys(rows).map((id) => ({ id })),
        };
      },
    };
  }

  const db = {
    docGets,
    collection(name) {
      if (name === 'parties') {
        return {
          doc(partyId) {
            return {
              async get() {
                docGets.push(`parties/${partyId}`);
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
                docGets.push(`users/${userId}`);
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
      throw new Error(
        `collectionGroup('${name}') must not be used - party-scoped access only`,
      );
    },
  };

  return db;
}

const mockAuth = {
  async getUser(userId) {
    return {
      uid: userId,
      displayName: null,
      photoURL: null,
    };
  },
};

test('isValidPartyId rejects invalid ids', () => {
  assert.equal(isValidPartyId(''), false);
  assert.equal(isValidPartyId('valid-party_1'), true);
  assert.equal(isValidPartyId('bad/slash'), false);
});

test('verifyCallerPartyAccess uses parties/{id} and participants/{callerUid} doc gets', async () => {
  const db = buildMockDb({ callerIsAdmin: false, callerIsParticipant: true });

  const allowed = await verifyCallerPartyAccess(db, PARTY_ID, CALLER_ID);
  assert.equal(allowed, true);
  assert.deepEqual(db.docGets, [
    `parties/${PARTY_ID}`,
    `parties/${PARTY_ID}/participants/${CALLER_ID}`,
  ]);
});

test('verifyCallerPartyAccess fails closed when caller is not admin or participant', async () => {
  const db = buildMockDb({ callerIsAdmin: false, callerIsParticipant: false });

  const allowed = await verifyCallerPartyAccess(db, PARTY_ID, CALLER_ID);
  assert.equal(allowed, false);
});

test('getPartyMemberUserIds lists admin and participant document ids', async () => {
  const db = buildMockDb();
  const members = await getPartyMemberUserIds(db, PARTY_ID);

  assert.ok(members.has(CALLER_ID));
  assert.ok(members.has(CO_PARTICIPANT_ID));
  assert.ok(db.docGets.includes(`parties/${PARTY_ID}`));
  assert.ok(db.docGets.includes(`parties/${PARTY_ID}/participants (list)`));
});

test('batchUsersLookup never includes an emails field', async () => {
  const db = buildMockDb();
  const result = await batchUsersLookup(
    db,
    mockAuth,
    CALLER_ID,
    PARTY_ID,
    [CO_PARTICIPANT_ID, STRANGER_ID],
  );

  assert.ok(!('emails' in result));
  assert.ok(CO_PARTICIPANT_ID in result.users);
  assert.equal(result.users[CO_PARTICIPANT_ID], 'Co Participant');
  assert.ok(!(STRANGER_ID in result.users));
});

test('excludes user IDs that are not party admin or participants', async () => {
  const db = buildMockDb();
  const result = await batchUsersLookup(db, mockAuth, CALLER_ID, PARTY_ID, [
    STRANGER_ID,
  ]);
  assert.equal(Object.keys(result.users).length, 0);
});

test('includes co-participants in the same party', async () => {
  const db = buildMockDb();
  const result = await batchUsersLookup(db, mockAuth, CALLER_ID, PARTY_ID, [
    CO_PARTICIPANT_ID,
  ]);
  assert.deepEqual(result.users, { [CO_PARTICIPANT_ID]: 'Co Participant' });
  assert.deepEqual(result.bots, { [CO_PARTICIPANT_ID]: false });
  assert.ok('photos' in result);
});

test('batchUsersLookup fails closed when caller lacks party access', async () => {
  const db = buildMockDb({ callerIsAdmin: false, callerIsParticipant: false });
  const result = await batchUsersLookup(db, mockAuth, CALLER_ID, PARTY_ID, [
    CO_PARTICIPANT_ID,
  ]);
  assert.deepEqual(result.users, {});
});

test('pickDisplayName trims and skips whitespace-only strings', () => {
  assert.equal(pickDisplayName('user-id-1', '   ', '  Good  '), 'Good');
  assert.equal(pickDisplayName('user-id-1', ' \t '), `Player user-id-`);
});

test('pickDisplayName skips non-string candidates', () => {
  assert.equal(pickDisplayName('user-id-2', 42, null, undefined, 'Named'), 'Named');
});

test('pickDisplayName uses name when displayName looks like email', () => {
  assert.equal(
    pickDisplayName('user-id-3', 'legacy@mail.com', 'Legal Name'),
    'Legal Name',
  );
});

test('pickHostNameForInvite does not expose email local-part', () => {
  const uid = 'admin-uid-xyz';
  const email = 'private.name@example.org';
  assert.equal(displayNameMatchesEmailLocalPart('private.name', email), true);
  const hostName = pickHostNameForInvite(uid, 'private.name', email);
  assert.notEqual(hostName, 'private.name');
  assert.equal(hostName, playerFallbackForUserId(uid));
});

test('playerFallbackForUserId uses distinct bot suffixes', () => {
  const botA = 'bot_party_1_0_abcdefgh';
  const botB = 'bot_party_1_1_ijklmnop';
  assert.equal(playerFallbackForUserId(botA), 'Player abcdefgh');
  assert.equal(playerFallbackForUserId(botB), 'Player ijklmnop');
  assert.notEqual(
    playerFallbackForUserId(botA),
    playerFallbackForUserId(botB),
  );
});

test('fetchDisplayProfiles uses Firestore name when displayName is email-shaped', async () => {
  const USER_ID = 'profile-name-user';
  const db = {
    collection(name) {
      if (name === 'users') {
        return {
          doc(id) {
            return {
              async get() {
                return {
                  exists: id === USER_ID,
                  data: () => ({
                    displayName: 'stored@email.example',
                    name: 'Stored Real Name',
                  }),
                };
              },
            };
          },
        };
      }
      throw new Error(`unexpected collection ${name}`);
    },
  };
  const result = await fetchDisplayProfilesForUserIds(db, mockAuth, [USER_ID]);
  assert.equal(result.users[USER_ID], 'Stored Real Name');
});

test('rejects email-shaped Firestore and Auth display names in response', async () => {
  const db = buildMockDb({
    userDocs: {
      [CO_PARTICIPANT_ID]: {
        displayName: 'legacy@signup.example',
      },
    },
  });
  const authWithEmailDisplayName = {
    async getUser(userId) {
      return {
        uid: userId,
        displayName:
          userId === CO_PARTICIPANT_ID ? 'auth-display@example.com' : null,
        photoURL: null,
      };
    },
  };

  const result = await batchUsersLookup(
    db,
    authWithEmailDisplayName,
    CALLER_ID,
    PARTY_ID,
    [CO_PARTICIPANT_ID],
  );

  assert.equal(
    result.users[CO_PARTICIPANT_ID],
    `Player ${CO_PARTICIPANT_ID.slice(0, 8)}`,
  );
  assert.ok(!JSON.stringify(result).includes('@'));
});
test('batch drops a display name that is just the email local-part (Firestore email)', async () => {
  const db = buildMockDb({
    userDocs: {
      [CO_PARTICIPANT_ID]: { displayName: 'jdoe.private', email: 'jdoe.private@example.test' },
    },
  });
  const result = await batchUsersLookup(db, mockAuth, CALLER_ID, PARTY_ID, [CO_PARTICIPANT_ID]);
  assert.equal(result.users[CO_PARTICIPANT_ID], playerFallbackForUserId(CO_PARTICIPANT_ID));
  const body = JSON.stringify(result);
  assert.ok(!body.includes('jdoe.private'));
  assert.ok(!body.includes('@'));
});

test('batch drops an Auth display name that is the Auth email local-part', async () => {
  const db = buildMockDb({ userDocs: { [CO_PARTICIPANT_ID]: {} } });
  const authWithEmail = {
    async getUser(userId) {
      return { uid: userId, displayName: 'auth.local', email: 'auth.local@example.test', photoURL: null };
    },
  };
  const result = await batchUsersLookup(db, authWithEmail, CALLER_ID, PARTY_ID, [CO_PARTICIPANT_ID]);
  assert.equal(result.users[CO_PARTICIPANT_ID], playerFallbackForUserId(CO_PARTICIPANT_ID));
  assert.ok(!JSON.stringify(result).includes('auth.local'));
});

test('batch response has only users, bots and photos keys, and no stranger or email anywhere', async () => {
  const db = buildMockDb();
  const result = await batchUsersLookup(db, mockAuth, CALLER_ID, PARTY_ID, [
    CO_PARTICIPANT_ID,
    STRANGER_ID,
  ]);
  assert.deepEqual(Object.keys(result).sort(), ['bots', 'photos', 'users']);
  const body = JSON.stringify(result);
  assert.ok(!body.includes(STRANGER_ID));
  assert.ok(!body.includes('secret.example'));
});
