import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  inviteDocIdFromEmail,
  inviteMatchesJoiningUser,
  filterVisiblePendingInvites,
  canResendPartyInvite,
  markPendingInvitesAcceptedForParticipantJoin,
} from './acceptPendingInvitesLogic.js';

describe('inviteDocIdFromEmail', () => {
  it('normalizes email to invite document id', () => {
    assert.equal(inviteDocIdFromEmail('Alice@Example.COM'), 'alice_example_com');
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

  it('matches by email field', () => {
    assert.equal(
      inviteMatchesJoiningUser({ email: 'Guest@Example.com', status: 'SENT' }, userId, email),
      true
    );
  });

  it('matches by invite doc id derived from email', () => {
    assert.equal(
      inviteMatchesJoiningUser(
        { id: 'guest_example_com', status: 'GOING' },
        userId,
        email
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

describe('markPendingInvitesAcceptedForParticipantJoin', () => {
  it('updates matching invites in Firestore batch', async () => {
    const updates = [];
    const inviteRef = (id) => ({
      id,
      update: (data) => {
        updates.push({ id, data });
        return Promise.resolve();
      },
    });

    const db = {
      collection(name) {
        if (name === 'users') {
          return {
            doc(uid) {
              return {
                get: async () =>
                  uid === 'guest-uid'
                    ? { exists: true, data: () => ({ email: 'guest@example.com' }) }
                    : { exists: false, data: () => ({}) },
              };
            },
          };
        }
        if (name === 'parties') {
          return {
            doc(partyId) {
              return {
                collection(sub) {
                  if (sub !== 'pendingInvites') throw new Error('unexpected');
                  return {
                    get: async () => ({
                      empty: false,
                      docs: [
                        {
                          id: 'guest_example_com',
                          data: () => ({ email: 'guest@example.com', status: 'SENT' }),
                          ref: inviteRef('guest_example_com'),
                        },
                        {
                          id: 'other_example_com',
                          data: () => ({ email: 'other@example.com', status: 'PENDING' }),
                          ref: inviteRef('other_example_com'),
                        },
                      ],
                    }),
                  };
                },
              };
            },
          };
        }
        throw new Error(`unknown collection ${name}`);
      },
      batch() {
        const ops = [];
        return {
          update(ref, data) {
            ops.push({ ref, data });
          },
          async commit() {
            for (const op of ops) {
              await op.ref.update(op.data);
            }
          },
        };
      },
    };

    const result = await markPendingInvitesAcceptedForParticipantJoin(db, 'party-1', 'guest-uid');
    assert.equal(result.updated, 1);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].id, 'guest_example_com');
    assert.equal(updates[0].data.status, 'ACCEPTED');
    assert.equal(updates[0].data.userId, 'guest-uid');
  });

  it('skips bot participants', async () => {
    const db = { collection: () => { throw new Error('should not be called'); } };
    const result = await markPendingInvitesAcceptedForParticipantJoin(db, 'party-1', 'bot_123');
    assert.equal(result.updated, 0);
  });
});