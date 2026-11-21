/**
 * Party code input parsing for the Home "Join a party" box (party-code spec Rev 4).
 * Liberal at parse: uppercase, strip spaces and dashes, drop characters outside the alphabet
 * (never mapped to another letter), keep the first 8. The server re-normalizes and decides.
 */
export const PARTY_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
export const PARTY_CODE_LENGTH = 8;
export const PARTY_CODE_DISPLAY_MAXLENGTH = PARTY_CODE_LENGTH + 1;

/**
 * @param {string} raw
 * @returns {{ code: string, dropped: boolean }} dropped is true when a non-space, non-dash
 *   character was removed (for the polite hint).
 */
export function normalizePartyCodeInput(raw) {
  let code = '';
  let dropped = false;
  for (const ch of String(raw ?? '').toUpperCase()) {
    if (ch === '-' || /\s/.test(ch)) continue;
    if (!PARTY_CODE_ALPHABET.includes(ch)) {
      if (code.length < PARTY_CODE_LENGTH) dropped = true;
      continue;
    }
    if (code.length < PARTY_CODE_LENGTH) code += ch;
  }
  return { code, dropped };
}

/** "KX7P4MRB" -> "KX7P-4MRB"; the dash appears after the 4th kept character. */
export function formatPartyCode(code) {
  return code.length > 4 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

export function isCompletePartyCode(code) {
  return typeof code === 'string' && code.length === PARTY_CODE_LENGTH;
}

/**
 * If pasted text contains a /party/{id} link, return the in-app path (keeping a #t= fragment),
 * so it is routed as a link and never sent to the code resolver.
 */
export function partyLinkPathFromText(text) {
  const match = String(text ?? '').match(/\/party\/([A-Za-z0-9_-]{1,128})(#t=[0-9a-f]{32})?/);
  return match ? `/party/${match[1]}${match[2] ?? ''}` : null;
}
