import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  inviteDocIdFromEmail,
  inviteMatchesJoiningUser,
  filterVisiblePendingInvites,
  canResendPartyInvite,
  logAcceptInviteOnParticipantJoinFailure,
  markPendingInvitesAcceptedForParticipantJoin,
} from './acceptPendingInvitesLogic.js';

const FIRESTORE_NOT_FOUND_PATH =
  'No document to update: projects/test/databases/(default)/documents/parties/party-1/pendingInvites/guest_example_com';

function assertNoSensitiveJoinLogContent(loggedPayload, inviteDocId = 'guest_example_com') {
  assert.doesNotMatch(loggedPayload, /@/);
  assert.doesNotMatch(loggedPayload, new RegExp(inviteDocId));
  assert.doesNotMatch(loggedPayload, /pendingInvites\//);
  assert.doesNotMatch(loggedPayload, /databases\/\(default\)\/documents/);
  assert.doesNotMatch(loggedPayload, /No document to update/);
}

describe('inviteDocIdFromEmail', () => {
  it('normalizes email to invite document id (host UI only; not used for join matching)', () => {
    assert.equal(inviteDocIdFromEmail('Alice@Example.COM'), 'alice_example_com');
  });

  it('doc ids collide for john.doe@, john_doe@, john-doe@ but join match uses stored email only', () => {
    const docIdA = inviteDocIdFromEmail('john.doe@example.com');
    const docIdB = inviteDocIdFromEmail('john_doe@example.com');
    const docIdC = inviteDocIdFromEmail('john-doe@example.com');
    assert.equal(docIdA, docIdB);
    assert.equal(docIdB, docIdC);
    assert.equal(
      inviteMatchesJoiningUser(
        { id: docIdA, email: 'john.doe@example.com', status: 'PENDING' },
        'uid-joiner',
        'john-doe@example.com'
      ),
      false
    );
    assert.equal(
      inviteMatchesJoiningUser(
        { id: docIdB, email: 'john.doe@example.com', status: 'PENDING' },
        'uid-joiner',
        'john_doe@example.com'
      ),
      false
    );
    assert.equal(
      inviteMatchesJoiningUser(
        { id: docIdC, email: 'john.doe@example.com', status: 'PENDING' },
        'uid-joiner',
        'john.doe@example.com'
      ),
      true
    );
  });
});

describe('inviteMatchesJoiningUser', () => {
  const userId = 'uid-abc';
  const email = 'guest@example.com';

  it('matches by userId on invite', () => {
    assert.equal(
      inviteMatchesJoiningUser({ userId, status: 'PENDING' }, userId, email),
      true
    );
  });

  it('matches by exact stored invite email (trim + lowercase)', () => {
    assert.equal(
      inviteMatchesJoiningUser({ email: 'Guest@Example.com', status: 'SENT' }, userId, email),
      true
    );
  });

  it('does not match by invite doc id when stored email differs', () => {
    assert.equal(
      inviteMatchesJoiningUser(
        { id: 'guest_example_com', email: 'other@example.com', status: 'GOING' },
        userId,
        email
      ),
      false
    );
  });

  it('john.doe@ invite does not match john-doe@ verified auth email', () => {
    assert.equal(
      inviteMatchesJoiningUser(
        { email: 'john.doe@example.com', status: 'PENDING' },
        userId,
        'john-doe@example.com'
      ),
      false
    );
  });

  it('john.doe@ invite does not match john_doe@ verified auth email', () => {
    assert.equal(
      inviteMatchesJoiningUser(
        { email: 'john.doe@example.com', status: 'PENDING' },
        userId,
        'john_doe@example.com'
      ),
      false
    );
  });

  it('john.doe@ invite matches only the same stored address', () => {
    assert.equal(
      inviteMatchesJoiningUser(
        { email: 'john.doe@example.com', status: 'PENDING' },
        userId,
        'john.doe@example.com'
      ),
      true
    );
  });

  it('does not match unrelated invite', () => {
    assert.equal(
      inviteMatchesJoiningUser({ email: 'other@example.com', status: 'PENDING' }, userId, email),
      false
    );
  });

  it('skips already ACCEPTED', () => {
    assert.equal(
      inviteMatchesJoiningUser({ email, status: 'ACCEPTED' }, userId, email),
      false
    );
  });
});

describe('filterVisiblePendingInvites', () => {
  const participants = [{ id: 'host' }, { id: 'joined-guest' }];

  it('hides ACCEPTED and invites tied to joined userId', () => {
    const invites = [
      { id: 'a', status: 'ACCEPTED', email: 'a@x.com' },
      { id: 'b', status: 'PENDING', userId: 'joined-guest', email: 'b@x.com' },
      { id: 'c', status: 'SENT', email: 'c@x.com', emailFailed: false, sentAt: new Date() },
    ];
    const visible = filterVisiblePendingInvites(invites, participants);
    assert.deepEqual(visible.map((i) => i.id), ['c']);
  });
});

describe('canResendPartyInvite', () => {
  const participants = [{ id: 'p1' }];

  it('blocks resend when invite linked to participant', () => {
    assert.equal(
      canResendPartyInvite({ userId: 'p1', emailFailed: true, status: 'PENDING' }, participants),
      false
    );
  });

  it('allows resend when email failed and not joined', () => {
    assert.equal(
      canResendPartyInvite({ emailFailed: true, status: 'PENDING' }, participants),
      true
    );
  });

  it('blocks resend when ACCEPTED', () => {
    assert.equal(canResendPartyInvite({ status: 'ACCEPTED' }, participants), false);
  });
});

function buildJoinMocks({
  authEmail,
  authVerified = true,
  profileEmail,
  inviteDocs,
}) {
  const updates = [];
  let usersCollectionRead = false;

  const auth = {
    getUser: async (uid) => {
      if (uid !== 'guest-uid') throw new Error('user not found');
      return {
        uid,
        email: authEmail,
        emailVerified: authVerified,
      };
    },
  };

  const inviteRef = (id, data, { failUpdate = false } = {}) => ({
    id,
    update: (patch) => {
      if (failUpdate) {
        const err = new Error(FIRESTORE_NOT_FOUND_PATH);
        err.code = 5;
        err.name = 'FirebaseError';
        return Promise.reject(err);
      }
      updates.push({ id, data, patch });
      return Promise.resolve();
    },
  });

  const db = {
    collection(name) {
      if (name === 'users') {
        return {
          doc() {
            return {
              get: async () => {
                usersCollectionRead = true;
                return {
                  exists: true,
                  data: () => ({ email: profileEmail }),
                };
              },
            };
          },
        };
      }
      if (name === 'parties') {
        return {
          doc() {
            return {
              collection(sub) {
                if (sub !== 'pendingInvites') throw new Error('unexpected');
                return {
                  get: async () => ({
                    empty: inviteDocs.length === 0,
                    docs: inviteDocs.map((row) => ({
                      id: row.id,
                      data: () => row.data,
                      ref: inviteRef(row.id, row.data, { failUpdate: row.failUpdate }),
                    })),
                  }),
                };
              },
            };
          },
        };
      }
      throw new Error(`unknown collection ${name}`);
    },
  };

  return { db, auth, updates, wasUsersCollectionRead: () => usersCollectionRead };
}

describe('markPendingInvitesAcceptedForParticipantJoin', () => {
  it('accepts invite using verified Auth email, ignoring edited Firestore profile email', async () => {
    const { db, auth, updates, wasUsersCollectionRead } = buildJoinMocks({
      authEmail: 'guest@example.com',
      authVerified: true,
      profileEmail: 'attacker@example.com',
      inviteDocs: [
        {
          id: 'guest_example_com',
          data: { email: 'guest@example.com', status: 'SENT' },
        },
        {
          id: 'attacker_example_com',
          data: { email: 'attacker@example.com', status: 'PENDING' },
        },
      ],
    });

    const result = await markPendingInvitesAcceptedForParticipantJoin(
      db,
      auth,
      'party-1',
      'guest-uid'
    );
    assert.equal(result.updated, 1);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].id, 'guest_example_com');
    assert.equal(wasUsersCollectionRead(), false);
  });

  it('does not accept when profile-only email would match but Auth is unverified', async () => {
    const { db, auth, updates } = buildJoinMocks({
      authEmail: 'guest@example.com',
      authVerified: false,
      profileEmail: 'guest@example.com',
      inviteDocs: [
        {
          id: 'guest_example_com',
          data: { email: 'guest@example.com', status: 'SENT' },
        },
      ],
    });

    const result = await markPendingInvitesAcceptedForParticipantJoin(
      db,
      auth,
      'party-1',
      'guest-uid'
    );
    assert.equal(result.updated, 0);
    assert.equal(updates.length, 0);
  });

  it('continues when an invite is deleted mid-join', async () => {
    const { db, auth, updates } = buildJoinMocks({
      authEmail: 'guest@example.com',
      authVerified: true,
      profileEmail: 'guest@example.com',
      inviteDocs: [
        {
          id: 'stale_removed',
          data: { email: 'guest@example.com', status: 'PENDING' },
          failUpdate: true,
        },
        {
          id: 'guest_example_com',
          data: { email: 'guest@example.com', status: 'SENT' },
        },
      ],
    });

    const warnLogs = [];
    const originalWarn = console.warn;
    console.warn = (...args) => {
      warnLogs.push(args.map(String).join(' '));
    };
    try {
      const result = await markPendingInvitesAcceptedForParticipantJoin(
        db,
        auth,
        'party-1',
        'guest-uid'
      );
      assert.equal(result.updated, 1);
      assert.equal(updates.length, 1);
      assert.equal(updates[0].id, 'guest_example_com');

      const removedBeforeAccept = warnLogs.find((line) =>
        line.includes('removed before accept')
      );
      assert.ok(removedBeforeAccept, 'expected privacy-safe stale-invite warn');
      assertNoSensitiveJoinLogContent(warnLogs.join('\n'));
      assert.match(removedBeforeAccept, /partyId=party-1/);
      assert.match(removedBeforeAccept, /participantId=guest-uid/);
      assert.match(removedBeforeAccept, /reason=stale_invite_removed/);
      assert.match(removedBeforeAccept, /code=5/);
    } finally {
      console.warn = originalWarn;
    }
  });

  it('logs participant join handler failure without Firestore path or invite doc id', () => {
    const errorLogs = [];
    const originalError = console.error;
    console.error = (...args) => {
      errorLogs.push(args.map(String).join(' '));
    };
    try {
      const err = new Error(FIRESTORE_NOT_FOUND_PATH);
      err.code = 5;
      err.name = 'FirebaseError';
      logAcceptInviteOnParticipantJoinFailure('party-1', 'guest-uid', err);
      assert.equal(errorLogs.length, 1);
      assertNoSensitiveJoinLogContent(errorLogs.join('\n'));
      assert.match(errorLogs[0], /partyId=party-1/);
      assert.match(errorLogs[0], /participantId=guest-uid/);
      assert.match(errorLogs[0], /code=5/);
      assert.match(errorLogs[0], /name=FirebaseError/);
    } finally {
      console.error = originalError;
    }
  });

  it('skips bot participants', async () => {
    const { db, auth } = buildJoinMocks({
      authEmail: 'x@y.com',
      inviteDocs: [],
    });
    const result = await markPendingInvitesAcceptedForParticipantJoin(
      db,
      auth,
      'party-1',
      'bot_123'
    );
    assert.equal(result.updated, 0);
  });
});
