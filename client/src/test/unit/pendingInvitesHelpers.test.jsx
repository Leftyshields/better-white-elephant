import { describe, expect, it } from 'vitest';
import {
  inviteMatchesJoiningUser,
  filterVisiblePendingInvites,
  canResendPartyInvite,
} from '../../utils/pendingInvites.js';

describe('pendingInvites helpers', () => {
  it('marks invite match for join by email', () => {
    expect(
      inviteMatchesJoiningUser(
        { email: 'a@b.com', status: 'SENT' },
        'uid-1',
        'a@b.com'
      )
    ).toBe(true);
  });

  it('hides ACCEPTED invites from host list', () => {
    const visible = filterVisiblePendingInvites(
      [{ id: 'x', status: 'ACCEPTED' }, { id: 'y', status: 'PENDING' }],
      [{ id: 'host' }]
    );
    expect(visible.map((i) => i.id)).toEqual(['y']);
  });

  it('blocks resend for participants linked by userId', () => {
    expect(
      canResendPartyInvite(
        { status: 'PENDING', userId: 'p2', emailFailed: true },
        [{ id: 'p1' }, { id: 'p2' }]
      )
    ).toBe(false);
  });

  it('does not match join by invite doc id when emails differ (john.doe vs john-doe)', () => {
    expect(
      inviteMatchesJoiningUser(
        { id: 'john_doe_example_com', email: 'john.doe@example.com', status: 'PENDING' },
        'uid-1',
        'john-doe@example.com'
      )
    ).toBe(false);
    expect(
      inviteMatchesJoiningUser(
        { id: 'john_doe_example_com', email: 'john.doe@example.com', status: 'PENDING' },
        'uid-1',
        'john_doe@example.com'
      )
    ).toBe(false);
    expect(
      inviteMatchesJoiningUser(
        { id: 'john_doe_example_com', email: 'john.doe@example.com', status: 'PENDING' },
        'uid-1',
        'john.doe@example.com'
      )
    ).toBe(true);
  });
});