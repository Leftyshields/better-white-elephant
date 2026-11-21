/**
 * Guest gift draft (G24): the gift link, the scraped preview and the manual title and price the
 * guest typed before tapping I'm ready. Kept in sessionStorage for this tab only, keyed by party,
 * so F5 doesn't wipe it. It's private, so it never goes on the seat doc (other players can read
 * seats). The name isn't kept here: it saves to the guest's own seat on blur instead (G18).
 * sessionStorage clears itself when the tab closes; an empty draft (after Ready) removes the key.
 */
const KEY_PREFIX = 'sor.guestGiftDraft.';

const str = (v, max) => (typeof v === 'string' && v.length <= max ? v : '');
const optStr = (v, max) => (typeof v === 'string' && v.length <= max ? v : null);
const httpUrl = (v) => (typeof v === 'string' && /^https?:\/\//i.test(v) && v.length <= 2048 ? v : null);

function cleanPreview(p) {
  if (!p || typeof p !== 'object') return null;
  const url = httpUrl(p.url);
  const title = str(p.title, 200).trim();
  if (!url || !title) return null;
  return { url, title, image: httpUrl(p.image), price: optStr(p.price, 32) };
}

function store() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** @returns {{ giftUrl?: string, preview?: object|null, manual?: boolean, manualTitle?: string, manualPrice?: string }} */
export function readGuestGiftDraft(partyId) {
  try {
    const raw = store()?.getItem(KEY_PREFIX + partyId);
    if (!raw) return {};
    const d = JSON.parse(raw);
    return {
      giftUrl: str(d?.giftUrl, 2048),
      preview: cleanPreview(d?.preview),
      manual: d?.manual === true,
      manualTitle: str(d?.manualTitle, 200),
      manualPrice: str(d?.manualPrice, 32),
    };
  } catch {
    return {};
  }
}

export function writeGuestGiftDraft(partyId, { giftUrl, preview, manual, manualTitle, manualPrice }) {
  try {
    const s = store();
    if (!s) return;
    const empty = !giftUrl?.trim() && !preview && !manualTitle?.trim() && !manualPrice?.trim();
    if (empty) {
      s.removeItem(KEY_PREFIX + partyId);
    } else {
      s.setItem(KEY_PREFIX + partyId, JSON.stringify({ giftUrl, preview, manual, manualTitle, manualPrice }));
    }
  } catch {
    // Storage full or blocked: the in-memory draft still covers the remount.
  }
}
