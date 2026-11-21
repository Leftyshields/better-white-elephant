/**
 * Copywriter-final invite join / rotate strings and join-error mapping.
 */
import { describe, expect, it } from 'vitest';
import {
  getJoinErrorMessage,
  HOST_SHARE_LOAD_FAILED,
  HOST_INVITE_ROTATE_CONFIRM,
  HOST_INVITE_ROTATE_CTA,
  HOST_INVITE_ROTATE_DONE,
  HOST_INVITE_ROTATE_FAILED,
  HOST_INVITE_ROTATE_HELPER,
  HOST_INVITE_ROTATE_RETRY,
  JOIN_ERROR_CANCELLED,
  JOIN_ERROR_GENERIC,
  JOIN_ERROR_LINK_INVALID,
  JOIN_ERROR_PARTY_FULL,
  JOIN_ERROR_STARTED,
  PARTY_INVITE_COPY,
  userSignedInWithGoogle,
} from '../../utils/partyInviteCopy.js';

const LOBBY = { status: 'LOBBY', participantCount: 5 };

describe('PARTY_INVITE_COPY Copywriter slots', () => {
  it('lands join.error.link_invalid exactly', () => {
    expect(PARTY_INVITE_COPY['join.error.link_invalid']).toBe(
      "This invite link doesn't work anymore. Ask your host for a new one.",
    );
    expect(JOIN_ERROR_LINK_INVALID).toBe(PARTY_INVITE_COPY['join.error.link_invalid']);
  });

  it('lands join.error.party_full exactly', () => {
    expect(PARTY_INVITE_COPY['join.error.party_full']).toBe(
      'This party is full, so there are no spots left.',
    );
    expect(JOIN_ERROR_PARTY_FULL).toBe(PARTY_INVITE_COPY['join.error.party_full']);
  });

  it('lands join.error.started exactly', () => {
    expect(PARTY_INVITE_COPY['join.error.started']).toBe(
      "This game has already started, so you can't join it.",
    );
    expect(JOIN_ERROR_STARTED).toBe(PARTY_INVITE_COPY['join.error.started']);
  });

  it('lands join.error.cancelled exactly', () => {
    expect(PARTY_INVITE_COPY['join.error.cancelled']).toBe('This party was canceled.');
    expect(JOIN_ERROR_CANCELLED).toBe(PARTY_INVITE_COPY['join.error.cancelled']);
  });

  it('lands join.error.generic exactly', () => {
    expect(PARTY_INVITE_COPY['join.error.generic']).toBe(
      "We couldn't get you into this party. Try again in a moment.",
    );
    expect(JOIN_ERROR_GENERIC).toBe(PARTY_INVITE_COPY['join.error.generic']);
  });

  it('lands host.invite.rotate_* code-and-link versions exactly (party-code spec)', () => {
    expect(PARTY_INVITE_COPY['host.invite.rotate_cta']).toBe('Make a new code and link');
    expect(PARTY_INVITE_COPY['host.invite.rotate_helper']).toBe(
      'Your old code and link will stop working, including any invites you already sent.',
    );
    expect(PARTY_INVITE_COPY['host.invite.rotate_confirm']).toBe('Make new code and link');
    expect(PARTY_INVITE_COPY['host.invite.rotate_failed']).toBe(
      "Couldn't make a new code and link. Your old ones still work.",
    );
    expect(PARTY_INVITE_COPY['host.invite.rotate_retry']).toBe('Try again');
    expect(PARTY_INVITE_COPY['host.invite.rotate_done']).toBe(
      'Your new code and link are ready. Resend them to anyone who still needs to join.',
    );
    expect(HOST_INVITE_ROTATE_CTA).toBe(PARTY_INVITE_COPY['host.invite.rotate_cta']);
    expect(HOST_INVITE_ROTATE_HELPER).toBe(PARTY_INVITE_COPY['host.invite.rotate_helper']);
    expect(HOST_INVITE_ROTATE_CONFIRM).toBe(PARTY_INVITE_COPY['host.invite.rotate_confirm']);
    expect(HOST_INVITE_ROTATE_FAILED).toBe(PARTY_INVITE_COPY['host.invite.rotate_failed']);
    expect(HOST_INVITE_ROTATE_RETRY).toBe(PARTY_INVITE_COPY['host.invite.rotate_retry']);
    expect(HOST_INVITE_ROTATE_DONE).toBe(PARTY_INVITE_COPY['host.invite.rotate_done']);
  });

  it('lands host.share.load_failed exactly', () => {
    expect(PARTY_INVITE_COPY['host.share.load_failed']).toBe(
      "Couldn't load your party code and link. Refresh to try again.",
    );
    expect(HOST_SHARE_LOAD_FAILED).toBe(PARTY_INVITE_COPY['host.share.load_failed']);
  });

  it('lands the Copywriter 8-character party-code strings exactly', () => {
    expect(PARTY_INVITE_COPY['home.join.helper']).toBe('Enter the 8-character code from your host.');
    expect(PARTY_INVITE_COPY['home.join.placeholder']).toBe('XXXX-XXXX');
    expect(PARTY_INVITE_COPY['home.join.error.format']).toBe(
      'Codes have 8 letters and numbers, like KX7P-4MRB. They never use 0, O, 1, I, L, or U.',
    );
    expect(PARTY_INVITE_COPY['home.join.error.generic']).toBe(
      "That code didn't get you in. Check it with your host, or try again later.",
    );
    expect(PARTY_INVITE_COPY['home.join.error.full']).toBe('This party is full. Every spot is taken.');
    for (const value of Object.values(PARTY_INVITE_COPY)) {
      expect(value).not.toMatch(/TODO/);
    }
  });

  it('uses no em dashes in Copywriter slots', () => {
    for (const value of Object.values(PARTY_INVITE_COPY)) {
      expect(value).not.toContain('\u2014');
      expect(value).not.toContain('—');
    }
  });
});

describe('getJoinErrorMessage', () => {
  it('maps CANCELLED to join.error.cancelled before started', () => {
    expect(
      getJoinErrorMessage({
        party: { status: 'CANCELLED', participantCount: 2 },
        hasToken: false,
      }),
    ).toBe(JOIN_ERROR_CANCELLED);
    expect(
      getJoinErrorMessage({
        party: { status: 'CANCELLED', participantCount: 2 },
        error: { code: 'permission-denied' },
        hasToken: true,
      }),
    ).toBe(JOIN_ERROR_CANCELLED);
  });

  it('maps status != LOBBY to join.error.started', () => {
    expect(
      getJoinErrorMessage({
        party: { status: 'ACTIVE', participantCount: 2 },
        error: { code: 'permission-denied' },
        hasToken: true,
      }),
    ).toBe(JOIN_ERROR_STARTED);
    expect(
      getJoinErrorMessage({
        party: { status: 'ENDED', participantCount: 2 },
        error: { code: 'unavailable' },
        hasToken: true,
      }),
    ).toBe(JOIN_ERROR_STARTED);
  });

  it('maps participantCount >= 30 in LOBBY to join.error.party_full', () => {
    expect(
      getJoinErrorMessage({
        party: { status: 'LOBBY', participantCount: 30 },
        error: { code: 'permission-denied' },
        hasToken: true,
      }),
    ).toBe(JOIN_ERROR_PARTY_FULL);
    expect(
      getJoinErrorMessage({
        party: { status: 'LOBBY', participantCount: 31 },
        hasToken: true,
      }),
    ).toBe(JOIN_ERROR_PARTY_FULL);
  });

  it('maps missing token to join.error.link_invalid', () => {
    expect(
      getJoinErrorMessage({
        party: LOBBY,
        error: { code: 'permission-denied' },
        hasToken: false,
      }),
    ).toBe(JOIN_ERROR_LINK_INVALID);
    expect(
      getJoinErrorMessage({
        party: null,
        error: { code: 'unavailable' },
        hasToken: false,
      }),
    ).toBe(JOIN_ERROR_LINK_INVALID);
  });

  it('maps permission-denied with token in an open lobby to join.error.link_invalid', () => {
    expect(
      getJoinErrorMessage({
        party: LOBBY,
        error: { code: 'permission-denied' },
        hasToken: true,
      }),
    ).toBe(JOIN_ERROR_LINK_INVALID);
    expect(
      getJoinErrorMessage({
        party: { status: 'LOBBY', participantCount: 29 },
        error: { code: 'firestore/permission-denied' },
        hasToken: true,
      }),
    ).toBe(JOIN_ERROR_LINK_INVALID);
  });

  it('maps unavailable to join.error.generic', () => {
    expect(
      getJoinErrorMessage({
        party: LOBBY,
        error: { code: 'unavailable' },
        hasToken: true,
      }),
    ).toBe(JOIN_ERROR_GENERIC);
  });

  it('maps deadline-exceeded to join.error.generic', () => {
    expect(
      getJoinErrorMessage({
        party: LOBBY,
        error: { code: 'deadline-exceeded' },
        hasToken: true,
      }),
    ).toBe(JOIN_ERROR_GENERIC);
  });

  it('maps error with no code to join.error.generic', () => {
    expect(
      getJoinErrorMessage({
        party: LOBBY,
        error: new Error('network blip'),
        hasToken: true,
      }),
    ).toBe(JOIN_ERROR_GENERIC);
    expect(
      getJoinErrorMessage({
        party: LOBBY,
        error: {},
        hasToken: true,
      }),
    ).toBe(JOIN_ERROR_GENERIC);
  });

  it('maps party read failure to join.error.generic when a token is present', () => {
    expect(
      getJoinErrorMessage({
        party: null,
        error: { code: 'unavailable' },
        hasToken: true,
      }),
    ).toBe(JOIN_ERROR_GENERIC);
    expect(
      getJoinErrorMessage({
        party: null,
        error: { code: 'permission-denied' },
        hasToken: true,
      }),
    ).toBe(JOIN_ERROR_GENERIC);
    expect(
      getJoinErrorMessage({
        party: undefined,
        error: { code: 'deadline-exceeded' },
        hasToken: true,
      }),
    ).toBe(JOIN_ERROR_GENERIC);
  });
});

describe('userSignedInWithGoogle', () => {
  it('is true only when providerData includes google.com', () => {
    expect(userSignedInWithGoogle({ providerData: [{ providerId: 'google.com' }] })).toBe(true);
    expect(userSignedInWithGoogle({ providerData: [{ providerId: 'password' }] })).toBe(false);
    expect(userSignedInWithGoogle({ providerData: [] })).toBe(false);
    expect(userSignedInWithGoogle(null)).toBe(false);
  });
});
