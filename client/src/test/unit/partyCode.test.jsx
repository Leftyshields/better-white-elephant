/**
 * Party code input parsing (party-code spec Rev 4, 8-character codes).
 */
import { describe, expect, it } from 'vitest';
import {
  PARTY_CODE_ALPHABET,
  PARTY_CODE_DISPLAY_MAXLENGTH,
  formatPartyCode,
  isCompletePartyCode,
  normalizePartyCodeInput,
  partyLinkPathFromText,
} from '../../utils/partyCode.js';

describe('party code input', () => {
  it('uses the 30-symbol alphabet with no 0, O, 1, I, L, or U', () => {
    expect(PARTY_CODE_ALPHABET).toBe('23456789ABCDEFGHJKMNPQRSTVWXYZ');
    expect(PARTY_CODE_ALPHABET).toHaveLength(30);
    for (const ch of '0O1ILU') expect(PARTY_CODE_ALPHABET).not.toContain(ch);
    expect(PARTY_CODE_DISPLAY_MAXLENGTH).toBe(9);
  });

  it("normalizes 'abcd efgh' and 'abcd-efgh' to ABCD-EFGH", () => {
    for (const raw of ['abcd efgh', 'abcd-efgh', 'ABCDEFGH', ' abcd - efgh ']) {
      const { code, dropped } = normalizePartyCodeInput(raw);
      expect(code).toBe('ABCDEFGH');
      expect(dropped).toBe(false);
      expect(formatPartyCode(code)).toBe('ABCD-EFGH');
      expect(isCompletePartyCode(code)).toBe(true);
    }
  });

  it('keeps the first 8 valid characters and ignores a 9th', () => {
    expect(normalizePartyCodeInput('KX7P-4MRBZ').code).toBe('KX7P4MRB');
  });

  it('drops excluded characters (never maps them) and flags the hint', () => {
    expect(normalizePartyCodeInput('kx0p-4mrb')).toEqual({ code: 'KXP4MRB', dropped: true });
    expect(normalizePartyCodeInput('O1IL')).toEqual({ code: '', dropped: true });
    expect(isCompletePartyCode('KXP4MRB')).toBe(false);
  });

  it('shows the dash only after the 4th character', () => {
    expect(formatPartyCode('KX7')).toBe('KX7');
    expect(formatPartyCode('KX7P')).toBe('KX7P');
    expect(formatPartyCode('KX7P4')).toBe('KX7P-4');
  });

  it('routes a pasted party link as a link, keeping the #t= fragment', () => {
    const token = 'f'.repeat(32);
    expect(partyLinkPathFromText(`https://stealorreveal.com/party/abc123#t=${token}`)).toBe(`/party/abc123#t=${token}`);
    expect(partyLinkPathFromText('Join me! stealorreveal.com/party/abc123')).toBe('/party/abc123');
    expect(partyLinkPathFromText('KX7P-4MRB')).toBeNull();
  });
});
