/**
 * Copywriter-final invite join / rotate strings and join-error mapping.
 */
import { describe, expect, it } from 'vitest';
import {
  getJoinErrorMessage,
  HOST_INVITE_ROTATE_CTA,
  HOST_INVITE_ROTATE_DONE,
  HOST_INVITE_ROTATE_HELPER,
  JOIN_ERROR_LINK_INVALID,
  JOIN_ERROR_PARTY_FULL,
  JOIN_ERROR_STARTED,
  PARTY_INVITE_COPY,
  userSignedInWithGoogle,
} from '../../utils/partyInviteCopy.js';

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

  it('lands host.invite.rotate_* exactly', () => {
    expect(PARTY_INVITE_COPY['host.invite.rotate_cta']).toBe('Make a new invite link');
    expect(PARTY_INVITE_COPY['host.invite.rotate_helper']).toBe(
      'Your old link and any invites you already sent will stop working.',
    );
    expect(PARTY_INVITE_COPY['host.invite.rotate_done']).toBe(
      'New link ready. Resend any invites you still need.',
    );
    expect(HOST_INVITE_ROTATE_CTA).toBe(PARTY_INVITE_COPY['host.invite.rotate_cta']);
    expect(HOST_INVITE_ROTATE_HELPER).toBe(PARTY_INVITE_COPY['host.invite.rotate_helper']);
    expect(HOST_INVITE_ROTATE_DONE).toBe(PARTY_INVITE_COPY['host.invite.rotate_done']);
  });

  it('uses no em dashes in Copywriter slots', () => {
    for (const value of Object.values(PARTY_INVITE_COPY)) {
      expect(value).not.toContain('\u2014');
      expect(value).not.toContain('—');
    }
  });
});

describe('getJoinErrorMessage', () => {
  it('maps status != LOBBY to join.error.started', () => {
    expect(getJoinErrorMessage({ status: 'ACTIVE', participantCount: 2 })).toBe(JOIN_ERROR_STARTED);
    expect(getJoinErrorMessage({ status: 'ENDED', participantCount: 2 })).toBe(JOIN_ERROR_STARTED);
    expect(getJoinErrorMessage({ status: 'CANCELLED', participantCount: 2 })).toBe(JOIN_ERROR_STARTED);
  });

  it('maps participantCount >= 30 in LOBBY to join.error.party_full', () => {
    expect(getJoinErrorMessage({ status: 'LOBBY', participantCount: 30 })).toBe(JOIN_ERROR_PARTY_FULL);
    expect(getJoinErrorMessage({ status: 'LOBBY', participantCount: 31 })).toBe(JOIN_ERROR_PARTY_FULL);
  });

  it('maps LOBBY under the cap (permission-denied / bad token) to join.error.link_invalid', () => {
    expect(getJoinErrorMessage({ status: 'LOBBY', participantCount: 5 })).toBe(JOIN_ERROR_LINK_INVALID);
    expect(getJoinErrorMessage({ status: 'LOBBY', participantCount: 29 })).toBe(JOIN_ERROR_LINK_INVALID);
    expect(getJoinErrorMessage({ status: 'LOBBY' })).toBe(JOIN_ERROR_LINK_INVALID);
    expect(getJoinErrorMessage(null)).toBe(JOIN_ERROR_LINK_INVALID);
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
