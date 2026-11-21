/**
 * Guest gift draft (G24): the gift link, the scraped preview and the manual title and price the
 * guest typed before tapping I'm ready. Kept in sessionStorage for this tab only, keyed by party
 * and the guest's uid, so F5 doesn't wipe it and a second account in the same tab doesn't see it.
 * It's private, so it never goes on the seat doc (other players can read seats). The name isn't
 * kept here: it saves to the guest's own seat on blur instead (G18). A typed name that has to
 * survive the landing-to-lobby remount lives in an in-memory module Map only, never in this draft.
 * sessionStorage clears itself when the tab closes; an empty draft (after Ready) removes the key.
 */
const KEY_PREFIX = 'sor.guestGiftDraft.';

const str = (v, max) => (typeof v === 'string' && v.length <= max ? v : '');
const optStr = (v, max) => (typeof v === 'string' && v.length <= max ? v : null);
const httpUrl = (v) => (typeof v === 'string' && /^https?:\/\//i.test(v) && v.length <= 2048 ? v : null);

/** sessionStorage key, or null when party or uid is missing (no write, empty read). */
export function guestGiftDraftKey(partyId, uid) {
  if (!partyId || !uid) return null;
  return KEY_PREFIX + partyId + '.' + uid;
}

function comparableUrl(raw) {
  const trimmed = (raw || '').trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    return url.hostname.includes('.') ? url.toString() : null;
  } catch {
    return null;
  }
}

function cleanPreview(p, giftUrl) {
  if (!p || typeof p !== 'object') return null;
  const url = httpUrl(p.url);
  const title = str(p.title, 200).trim();
  if (!url || !title) return null;
  if (giftUrl) {
    const previewUrl = comparableUrl(url);
    const linkUrl = comparableUrl(giftUrl);
    if (!previewUrl || !linkUrl || previewUrl !== linkUrl) return null;
  }
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
export function readGuestGiftDraft(partyId, uid) {
  try {
    const key = guestGiftDraftKey(partyId, uid);
    if (!key) return {};
    const raw = store()?.getItem(key);
    if (!raw) return {};
    const d = JSON.parse(raw);
    const giftUrl = str(d?.giftUrl, 2048);
    return {
      giftUrl,
      preview: cleanPreview(d?.preview, giftUrl),
      manual: d?.manual === true,
      manualTitle: str(d?.manualTitle, 200),
      manualPrice: str(d?.manualPrice, 32),
    };
  } catch {
    return {};
  }
}

export function writeGuestGiftDraft(partyId, uid, { giftUrl, preview, manual, manualTitle, manualPrice } = {}) {
  try {
    const key = guestGiftDraftKey(partyId, uid);
    const s = store();
    if (!s || !key) return;
    const empty = !giftUrl?.trim() && !preview && !manualTitle?.trim() && !manualPrice?.trim();
    if (empty) {
      s.removeItem(key);
    } else {
      s.setItem(key, JSON.stringify({ giftUrl, preview, manual, manualTitle, manualPrice }));
    }
  } catch {
    // Storage full or blocked: the in-memory draft still covers the remount.
  }
}
