/**
 * BUG-8: guests showed as "Player <uid>" in the host lobby because no public name was on the seat.
 */
import { describe, expect, it } from 'vitest';
import { rosterDisplayNames, seatNameFields } from '../../utils/seatDisplayName.js';

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
});
