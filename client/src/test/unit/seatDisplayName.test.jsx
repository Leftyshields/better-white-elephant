/**
 * BUG-8: guests showed as "Player <uid>" in the host lobby because no public name was on the seat.
 */
import { describe, expect, it } from 'vitest';
import { nameCollisionSuffix, rosterDisplayNames, seatNameFields } from '../../utils/seatDisplayName.js';

describe('seatNameFields', () => {
  it('keeps the first name and last initial from a Google name', () => {
    expect(seatNameFields('Alex Kim', 'alex.kim@example.com')).toEqual({
      displayName: 'Alex',
      lastInitial: 'K',
    });
  });

  it('uses the last word for the initial and skips non A-Z initials', () => {
    expect(seatNameFields('  Mary Ann van Dyke ', '')).toEqual({ displayName: 'Mary', lastInitial: 'D' });
    expect(seatNameFields('Zoë Øster', '')).toEqual({ displayName: 'Zoë' });
    expect(seatNameFields('Cher', '')).toEqual({ displayName: 'Cher' });
  });

  it('drops email-shaped names and email local-parts', () => {
    expect(seatNameFields('alex@example.com', 'alex@example.com')).toEqual({});
    expect(seatNameFields('alexk', 'alexk@example.com')).toEqual({});
  });

  it('returns nothing when there is no usable name', () => {
    expect(seatNameFields(null, 'a@b.co')).toEqual({});
    expect(seatNameFields('   ', '')).toEqual({});
  });

  it('caps the first name at 64 characters', () => {
    expect(seatNameFields(`${'A'.repeat(80)} Smith`, '').displayName).toBe('A'.repeat(64));
  });
});

describe('rosterDisplayNames', () => {
  it('prefers the seat name over the batch name and falls back to Player', () => {
    const names = rosterDisplayNames(
      [
        { id: 'uid-seat-1', displayName: 'Alex' },
        { id: 'uid-batch-2' },
        { id: 'uid-none-3' },
      ],
      { 'uid-seat-1': 'Player uid-seat', 'uid-batch-2': 'Jordan' },
    );
    expect(names).toEqual({
      'uid-seat-1': 'Alex',
      'uid-batch-2': 'Jordan',
      'uid-none-3': 'Player uid-none',
    });
  });

  it('adds the last initial only when first names repeat', () => {
    const names = rosterDisplayNames([
      { id: 'a', displayName: 'Sam', lastInitial: 'L' },
      { id: 'b', displayName: 'sam', lastInitial: 'R' },
      { id: 'c', displayName: 'Ana', lastInitial: 'P' },
    ]);
    expect(names).toEqual({ a: 'Sam L.', b: 'sam R.', c: 'Ana' });
  });

  it('ignores an invalid seat name', () => {
    expect(rosterDisplayNames([{ id: 'uid-bad-name', displayName: 'x@y.z' }])).toEqual({
      'uid-bad-name': 'Player uid-bad-',
    });
  });

  it('formats a batch full name as a first name', () => {
    const names = rosterDisplayNames(
      [{ id: 'uid-jamie' }],
      { 'uid-jamie': 'Jamie Guest' },
    );
    expect(names).toEqual({ 'uid-jamie': 'Jamie' });
  });

  it('adds a last initial when a batch first name collides', () => {
    const names = rosterDisplayNames(
      [
        { id: 'uid-jamie-g' },
        { id: 'uid-jamie-h', displayName: 'Jamie', lastInitial: 'H' },
      ],
      { 'uid-jamie-g': 'Jamie Guest' },
    );
    expect(names).toEqual({
      'uid-jamie-g': 'Jamie G.',
      'uid-jamie-h': 'Jamie H.',
    });
  });
});

describe('rosterDisplayNames unique collision suffixes (G21)', () => {
  const twoBriansAndAFirstNameOnly = [
    { id: 'uid-brian-1', displayName: 'Brian', lastInitial: 'S' },
    { id: 'uid-brian-2', displayName: 'Brian', lastInitial: 'S' },
    { id: 'uid-brian-3', displayName: 'Brian' },
  ];

  it('keeps the first colliding label plain and suffixes later seats in seat order', () => {
    expect(nameCollisionSuffix(2)).toBe(' (2)');
    const names = rosterDisplayNames(twoBriansAndAFirstNameOnly);
    expect(names).toEqual({
      'uid-brian-1': 'Brian S.',
      'uid-brian-2': 'Brian S. (2)',
      'uid-brian-3': 'Brian',
    });
  });

  it('returns the same numbers when the roster is computed again (stable across re-renders)', () => {
    const first = rosterDisplayNames(twoBriansAndAFirstNameOnly);
    const second = rosterDisplayNames(twoBriansAndAFirstNameOnly);
    expect(second).toEqual(first);
    expect(second).toEqual({
      'uid-brian-1': 'Brian S.',
      'uid-brian-2': 'Brian S. (2)',
      'uid-brian-3': 'Brian',
    });
  });

  it('keeps earlier numbers stable when another colliding seat is added', () => {
    const before = rosterDisplayNames(twoBriansAndAFirstNameOnly);
    const after = rosterDisplayNames([
      ...twoBriansAndAFirstNameOnly,
      { id: 'uid-brian-4', displayName: 'Brian', lastInitial: 'S' },
    ]);
    expect(before).toEqual({
      'uid-brian-1': 'Brian S.',
      'uid-brian-2': 'Brian S. (2)',
      'uid-brian-3': 'Brian',
    });
    expect(after).toEqual({
      'uid-brian-1': 'Brian S.',
      'uid-brian-2': 'Brian S. (2)',
      'uid-brian-3': 'Brian',
      'uid-brian-4': 'Brian S. (3)',
    });
  });

  it('suffixes first-name-only collisions as Brian and Brian (2)', () => {
    expect(rosterDisplayNames([
      { id: 'a', displayName: 'Brian' },
      { id: 'b', displayName: 'Brian' },
    ])).toEqual({
      a: 'Brian',
      b: 'Brian (2)',
    });
  });
});

describe('G28 no false "(2)": the host keeps the plain name, later joiners get the suffix', () => {
  // Playtest Nov 21 (game 1121 G): host and a guest both "Brian S."; the host showed "(2)".
  const host = { id: 'zz-host-uid', displayName: 'Brian', lastInitial: 'S', joinedAt: new Date('2026-11-21T18:00:00Z') };
  const guest = { id: 'aa-guest-uid', displayName: 'Brian', lastInitial: 'S', joinedAt: new Date('2026-11-21T18:05:00Z') };

  it('host first-joined stays plain even when the guest is listed first (lobby lists by doc id)', () => {
    expect(rosterDisplayNames([guest, host], {}, { hostId: host.id })).toEqual({
      'zz-host-uid': 'Brian S.',
      'aa-guest-uid': 'Brian S. (2)',
    });
  });

  it('does not swap numbers at game start: every turn order gives the same labels', () => {
    const lobby = rosterDisplayNames([guest, host], {}, { hostId: host.id });
    for (const turnOrder of [[host, guest], [guest, host]]) {
      expect(rosterDisplayNames(turnOrder, {}, { hostId: host.id })).toEqual(lobby);
    }
  });

  it('without a host id, the earlier joiner keeps the plain name regardless of array order', () => {
    expect(rosterDisplayNames([guest, host])).toEqual({ 'zz-host-uid': 'Brian S.', 'aa-guest-uid': 'Brian S. (2)' });
  });

  it('the host stays plain even if a guest has an earlier joinedAt (host is always numbered first)', () => {
    const early = { ...guest, joinedAt: new Date('2026-11-21T17:00:00Z') };
    expect(rosterDisplayNames([early, host], {}, { hostId: host.id })['zz-host-uid']).toBe('Brian S.');
  });

  it('a solo host listed twice (same uid) is plain, never "Brian S. (2)" (party H)', () => {
    const names = rosterDisplayNames([host, { ...host }], {}, { hostId: host.id });
    expect(names).toEqual({ 'zz-host-uid': 'Brian' });
  });

  it('orders by joinedAt from Firestore Timestamps, {seconds}, ISO strings and numbers; missing joinedAt goes last', () => {
    const ts = (ms) => ({ toMillis: () => ms });
    const seats = [
      { id: 'd', displayName: 'Sam', joinedAt: undefined },
      { id: 'c', displayName: 'Sam', joinedAt: '2026-11-21T18:03:00Z' },
      { id: 'b', displayName: 'Sam', joinedAt: { seconds: Date.parse('2026-11-21T18:02:00Z') / 1000, nanoseconds: 0 } },
      { id: 'a', displayName: 'Sam', joinedAt: Date.parse('2026-11-21T18:04:00Z') },
      { id: 'e', displayName: 'Sam', joinedAt: ts(Date.parse('2026-11-21T18:01:00Z')) },
    ];
    expect(rosterDisplayNames(seats)).toEqual({ e: 'Sam', b: 'Sam (2)', c: 'Sam (3)', a: 'Sam (4)', d: 'Sam (5)' });
  });
});

describe('G28 hostRosterLabel (server-written label for the late card)', () => {
  it('is the host roster label, with the initial only when a first name is shared', async () => {
    const { hostRosterLabel } = await import('../../../../server/shared/roster-names.mjs');
    const host = { id: 'h', displayName: 'Brian', lastInitial: 'S', joinedAt: 1 };
    expect(hostRosterLabel([host], 'h')).toBe('Brian');
    expect(hostRosterLabel([{ id: 'g', displayName: 'Brian', lastInitial: 'T', joinedAt: 0 }, host], 'h')).toBe('Brian S.');
    expect(hostRosterLabel([{ id: 'g', displayName: 'Brian', lastInitial: 'S', joinedAt: 0 }, host], 'h')).toBe('Brian S.');
  });

  it('is null when it cannot be told for sure (no host, no host seat, or a seat with no seat name)', async () => {
    const { hostRosterLabel } = await import('../../../../server/shared/roster-names.mjs');
    const host = { id: 'h', displayName: 'Brian', lastInitial: 'S' };
    expect(hostRosterLabel([host], null)).toBeNull();
    expect(hostRosterLabel([host], 'other')).toBeNull();
    expect(hostRosterLabel([host, { id: 'bot_1' }], 'h')).toBeNull();
  });
});
