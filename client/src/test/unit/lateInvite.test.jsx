import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GUEST_JOIN_COPY } from '../../utils/guestJoinCopy.js';
import { JOIN_ERROR_STARTED } from '../../utils/partyInviteCopy.js';
import {
  LATE_INVITE_COPY,
  formatLatePartyLine,
  latePartyLine,
  lateVisitorState,
} from '../../utils/lateInvite.js';
import { LateInviteCard, shouldShowLateSignIn } from '../../components/LateInviteCard.jsx';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const signInWithGoogle = vi.fn();
vi.mock('../../hooks/useAuth.js', () => ({
  useAuth: () => ({ user: null, loading: false, signInWithGoogle }),
}));

const partySource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../pages/Party.jsx'),
  'utf8',
);
const gameRoomSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../pages/GameRoom.jsx'),
  'utf8',
);
const landingSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../components/PartyInviteLanding.jsx'),
  'utf8',
);
const copySource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../../utils/lateInvite.js'),
  'utf8',
);

describe('lateVisitorState', () => {
  it('returns started only for an ACTIVE party and a confirmed missing seat', () => {
    expect(lateVisitorState({ status: 'ACTIVE' }, 'not-seated')).toBe('started');
  });

  it('returns over only for an ENDED party and a confirmed missing seat', () => {
    expect(lateVisitorState({ status: 'ENDED' }, 'not-seated')).toBe('over');
  });

  it('returns null for seated, checking, error, LOBBY, CANCELLED, or unknown', () => {
    expect(lateVisitorState({ status: 'ACTIVE' }, 'seated')).toBeNull();
    expect(lateVisitorState({ status: 'ACTIVE' }, 'checking')).toBeNull();
    expect(lateVisitorState({ status: 'ACTIVE' }, 'error')).toBeNull();
    expect(lateVisitorState({ status: 'ENDED' }, 'seated')).toBeNull();
    expect(lateVisitorState({ status: 'LOBBY' }, 'not-seated')).toBeNull();
    expect(lateVisitorState({ status: 'CANCELLED' }, 'not-seated')).toBeNull();
    expect(lateVisitorState({ status: 'ACTIVE' }, null)).toBeNull();
    expect(lateVisitorState(null, 'not-seated')).toBeNull();
  });
});

describe('BUG-21 signed copy', () => {
  it('uses the signed strings exactly and reuses goHome', () => {
    expect(LATE_INVITE_COPY.gameAlreadyStartedHeading).toBe('This game has already started');
    expect(LATE_INVITE_COPY.gameAlreadyStartedBody).toBe("New players can't join once a game is underway.");
    expect(LATE_INVITE_COPY.gameAlreadyOverHeading).toBe('This game is over');
    expect(LATE_INVITE_COPY.gameAlreadyOverBody).toBe("It already ended, so there's nothing to join.");
    expect(formatLatePartyLine('Office Swap', 'Dana')).toBe(
      'This link is for Office Swap, hosted by Dana.',
    );
    expect(formatLatePartyLine('Office Swap', null)).toBe('This link is for Office Swap.');
    expect(formatLatePartyLine('Office Swap', '')).toBe('This link is for Office Swap.');
    expect(LATE_INVITE_COPY.lateSignInLink).toBe('Already playing? Sign in to get back in.');
    expect(LATE_INVITE_COPY.lateGoHome).toBe('Go Home');
    expect(LATE_INVITE_COPY.lateGoHome).toBe(GUEST_JOIN_COPY.goHome);
  });

  it('does not reuse join.error.started for the started body, and has no em or en dashes', () => {
    expect(LATE_INVITE_COPY.gameAlreadyStartedBody).not.toBe(JOIN_ERROR_STARTED);
    const values = [
      LATE_INVITE_COPY.gameAlreadyStartedHeading,
      LATE_INVITE_COPY.gameAlreadyStartedBody,
      LATE_INVITE_COPY.gameAlreadyOverHeading,
      LATE_INVITE_COPY.gameAlreadyOverBody,
      formatLatePartyLine('{partyTitle}', '{hostFirstName}'),
      formatLatePartyLine('{partyTitle}', null),
      LATE_INVITE_COPY.lateGoHome,
      LATE_INVITE_COPY.lateSignInLink,
    ];
    for (const value of values) {
      expect(value).not.toMatch(/[—–]/);
    }
    expect(copySource).not.toMatch(/[—–]/);
  });
});

describe('LateInviteCard', () => {
  beforeEach(() => {
    signInWithGoogle.mockReset();
  });

  it('renders the started card with a host name, Go Home, and no sign-in link when hidden', () => {
    render(
      <LateInviteCard
        state="started"
        partyTitle="Office Swap"
        hostFirstName="Dana"
        showSignIn={false}
      />,
    );
    const heading = screen.getByRole('heading', { name: LATE_INVITE_COPY.gameAlreadyStartedHeading });
    expect(heading).toHaveAttribute('tabindex', '-1');
    expect(heading).toHaveFocus();
    expect(screen.getByText(formatLatePartyLine('Office Swap', 'Dana'))).toBeInTheDocument();
    expect(screen.getByText(LATE_INVITE_COPY.gameAlreadyStartedBody)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: LATE_INVITE_COPY.lateGoHome })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('button', { name: LATE_INVITE_COPY.lateSignInLink })).toBeNull();
  });

  it('renders the over card without a host name and shows the signed-out sign-in line', () => {
    render(
      <LateInviteCard
        state="over"
        partyTitle="Office Swap"
        hostFirstName={null}
        showSignIn
      />,
    );
    expect(screen.getByRole('heading', { name: LATE_INVITE_COPY.gameAlreadyOverHeading })).toBeInTheDocument();
    expect(screen.getByText(formatLatePartyLine('Office Swap', null))).toBeInTheDocument();
    expect(screen.getByText(LATE_INVITE_COPY.gameAlreadyOverBody)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: LATE_INVITE_COPY.lateSignInLink })).toBeInTheDocument();
  });

  it('stores redirectAfterAuth and opens Google sign-in from the signed-out link', async () => {
    window.history.replaceState(null, '', '/party/p1#t=abcd');
    signInWithGoogle.mockResolvedValue(undefined);
    render(
      <LateInviteCard
        state="started"
        partyTitle="Office Swap"
        hostFirstName="Dana"
        showSignIn
      />,
    );
    screen.getByRole('button', { name: LATE_INVITE_COPY.lateSignInLink }).click();
    expect(window.sessionStorage.getItem('redirectAfterAuth')).toBe('/party/p1#t=abcd');
    expect(signInWithGoogle).toHaveBeenCalledTimes(1);
  });

  it('shows the sign-in line only when the visitor is not already a Google session', () => {
    expect(shouldShowLateSignIn(null)).toBe(true);
    expect(shouldShowLateSignIn({ isAnonymous: true, providerData: [] })).toBe(true);
    expect(shouldShowLateSignIn({ providerData: [{ providerId: 'google.com' }] })).toBe(false);
  });
});

describe('BUG-21 wiring (fails on main)', () => {
  it('Party decides the late card from the own-seat read, not the participants list', () => {
    expect(partySource).toMatch(/useOwnSeatStatus/);
    expect(partySource).toMatch(/lateVisitorState/);
    expect(partySource).toMatch(/Loading party\.\.\./);
    expect(partySource).not.toMatch(/lateVisitorState\([^)]*participants/);
  });

  it('GameRoom shows the late card on NOT_PARTICIPANT and still has the real load-error state', () => {
    expect(gameRoomSource).toMatch(/joinDeniedAsNonParticipant/);
    expect(gameRoomSource).toMatch(/LateInviteCard/);
    expect(gameRoomSource).toMatch(/Couldn&apos;t load the game/);
    expect(gameRoomSource).toMatch(/>[\s]*Refresh[\s]*</);
  });

  it('the invite landing never mints a guest account just because the party already started', () => {
    expect(landingSource).toMatch(/lateVisitorState\(partyInfo, 'not-seated'\)/);
    expect(landingSource).toMatch(/setLateState\(late\)/);
  });
});

describe('latePartyLine parts', () => {
  it('keeps the host clause optional so the line reads with only a title', () => {
    expect(latePartyLine('Office Swap', 'Dana')).toEqual({
      prefix: 'This link is for ',
      title: 'Office Swap',
      suffix: ', hosted by Dana.',
    });
    expect(latePartyLine('Office Swap', null)).toEqual({
      prefix: 'This link is for ',
      title: 'Office Swap',
      suffix: '.',
    });
  });
});
