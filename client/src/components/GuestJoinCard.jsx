/**
 * Guest one-screen join card (batch 2 item 4), shared by the invite-link and party-code paths.
 *
 * Progress strip: three real items. "You're here" is credited the moment the card shows (the guest
 * really opened the link or typed a valid code), then "Your name" and "Your gift". The header says
 * what's left. "I'm ready" is the finish, the only primary button, and it saves the gift, the name
 * and ready: true together. No reloads, no alert(), no address step.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { addDoc, collection, doc, getDocs, limit, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import { db } from '../utils/firebase.js';
import { scrapeGiftUrl } from '../utils/api.js';
import { seatNameFields } from '../utils/seatDisplayName.js';
import { sanitizeUserChosenDisplayName } from '../../../server/lib/display-names.js';
import { GUEST_JOIN_COPY as COPY, guestStepsHeader } from '../utils/guestJoinCopy.js';
import { trackSubmitGift } from '../utils/analytics.js';
import { readGuestGiftDraft, writeGuestGiftDraft } from '../utils/guestGiftDraft.js';

const FOCUS_RING =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950';
const FIELD =
  `w-full min-h-11 px-3 py-2 text-base bg-slate-950/50 border border-slate-700 rounded-md text-white placeholder:text-slate-500 disabled:opacity-60 ${FOCUS_RING}`;

// Typed values survive the remount when the invite landing hands over to the lobby after the
// background seat write. The gift part also goes to sessionStorage (this tab only) so F5 keeps it.
const drafts = new Map();
// Wait this long after the name field loses focus before saving the name to the seat (G18).
export const NAME_SAVE_DEBOUNCE_MS = 400;

function normalizeGiftUrl(raw) {
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

/** True when the title is just the store's name or domain (gift.error.store_name). */
export function isBareStoreName(title, url) {
  const t = (title || '').trim().toLowerCase().replace(/^www\./, '');
  if (!t) return false;
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return false;
  }
  const brand = host.split('.')[0];
  return t === host || t === brand || t === `${brand}.com`;
}

function usableScrapedTitle(title) {
  return typeof title === 'string' && title.trim() && title !== 'Gift' && title !== 'Untitled Gift';
}

/**
 * The guest's own gift in this party, if one exists. Ready checks this before adding a gift, so a
 * reload during a slow save (gift written, page gone before the lobby saw it) can't make a second.
 */
async function findOwnGiftId(partyId, uid) {
  const snap = await getDocs(
    query(collection(db, 'gifts'), where('partyId', '==', partyId), where('submitterId', '==', uid), limit(1)),
  );
  return snap.empty ? null : snap.docs[0].id;
}

/** Seat name from the typed value, or null if it isn't a valid public name. */
export function typedSeatName(value) {
  const safe = sanitizeUserChosenDisplayName(value);
  if (!safe) return null;
  const fields = seatNameFields(safe);
  return fields.displayName ? fields : null;
}

export function GuestJoinCard({
  partyId,
  partyTitle,
  hostFirstName,
  user,
  participant,
  gift,
  seated,
  terminalMessage,
}) {
  const draft = drafts.get(partyId) || readGuestGiftDraft(partyId);
  const savedName = participant?.displayName || sanitizeUserChosenDisplayName(user?.displayName) || '';
  const [name, setName] = useState(draft.name ?? savedName);
  const [nameTouched, setNameTouched] = useState(false);
  const [giftUrl, setGiftUrl] = useState(draft.giftUrl ?? '');
  const [preview, setPreview] = useState(draft.preview ?? null);
  const [manual, setManual] = useState(draft.manual ?? false);
  const [manualTitle, setManualTitle] = useState(draft.manualTitle ?? '');
  const [manualPrice, setManualPrice] = useState(draft.manualPrice ?? '');
  const [scraping, setScraping] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const savingRef = useRef(false);
  const scrapeSeq = useRef(0);
  const ids = { name: useId(), nameError: useId(), gift: useId(), lock: useId(), header: useId(), manual: useId() };

  useEffect(() => {
    drafts.set(partyId, { name, giftUrl, preview, manual, manualTitle, manualPrice });
    writeGuestGiftDraft(partyId, { giftUrl, preview, manual, manualTitle, manualPrice });
  }, [partyId, name, giftUrl, preview, manual, manualTitle, manualPrice]);

  // G18: the name saves to the guest's own seat a moment after the field loses focus, so the host
  // sees it before Ready and it survives F5. Only a valid name that differs from the seat is written.
  const [blurredName, setBlurredName] = useState(null);
  const nameWriteRef = useRef(null);
  const seatDisplayName = participant?.displayName;
  const seatLastInitial = participant?.lastInitial;
  useEffect(() => {
    if (blurredName === null || !seated || !user?.uid || participant?.ready === true) return undefined;
    const fields = typedSeatName(blurredName);
    if (!fields) return undefined;
    const key = `${fields.displayName}|${fields.lastInitial ?? ''}`;
    const onSeat =
      fields.displayName === seatDisplayName && (!fields.lastInitial || fields.lastInitial === seatLastInitial);
    if (onSeat || nameWriteRef.current === key) return undefined;
    const timer = setTimeout(() => {
      nameWriteRef.current = key;
      updateDoc(doc(db, 'parties', partyId, 'participants', user.uid), { ...fields, updatedAt: new Date() })
        .catch((error) => {
          nameWriteRef.current = null;
          console.error('Guest name save failed:', { code: error?.code, name: error?.name });
        });
    }, NAME_SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [blurredName, seated, user?.uid, partyId, participant?.ready, seatDisplayName, seatLastInitial]);

  useEffect(() => {
    if (!nameTouched && !name && savedName) setName(savedName);
  }, [savedName, nameTouched, name]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(timer);
  }, [toast]);

  const seatName = typedSeatName(name);
  const nameDone = !!seatName;
  const showNameError = nameTouched && name.trim() !== '' && !nameDone;

  const manualUrl = normalizeGiftUrl(giftUrl);
  const manualStoreName = manual && isBareStoreName(manualTitle, manualUrl);
  const pendingGift = manual
    ? manualUrl && manualTitle.trim() && !manualStoreName
      ? { url: manualUrl, title: manualTitle.trim(), image: null, price: manualPrice.trim() || null }
      : null
    : preview;
  const editingGift = manual || !!preview || giftUrl.trim() !== '';
  const giftDone = !!pendingGift || (!!gift && !editingGift);

  const remaining = (nameDone ? 0 : 1) + (giftDone ? 0 : 1);
  const canReady = seated && nameDone && giftDone && !saving && !scraping;
  const lockReason = !nameDone ? COPY.readyLockedName : !giftDone ? COPY.readyLockedGift : null;

  const runScrape = async (rawUrl) => {
    const url = normalizeGiftUrl(rawUrl);
    if (!url) return;
    const seq = ++scrapeSeq.current;
    setScraping(true);
    setPreview(null);
    try {
      const { title, image, price, error } = await scrapeGiftUrl(url);
      if (seq !== scrapeSeq.current) return;
      if (!error && usableScrapedTitle(title) && !isBareStoreName(title, url)) {
        setPreview({ url, title: title.trim(), image: image || null, price: price || null });
        setManual(false);
      } else {
        setManual(true);
        setManualTitle(usableScrapedTitle(title) ? title : '');
        setManualPrice(price || '');
      }
    } catch {
      if (seq === scrapeSeq.current) setManual(true);
    } finally {
      if (seq === scrapeSeq.current) setScraping(false);
    }
  };

  const handleReady = async () => {
    if (savingRef.current || !canReady) return;
    savingRef.current = true;
    setSaving(true);
    setToast(null);
    try {
      if (pendingGift) {
        const fields = { url: pendingGift.url, title: pendingGift.title, image: pendingGift.image, price: pendingGift.price };
        const existingGiftId = gift?.id || (await findOwnGiftId(partyId, user.uid));
        if (existingGiftId) {
          await updateDoc(doc(db, 'gifts', existingGiftId), { ...fields, updatedAt: new Date() });
        } else {
          await addDoc(collection(db, 'gifts'), {
            partyId,
            submitterId: user.uid,
            ...fields,
            isFrozen: false,
            winnerId: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
        trackSubmitGift(partyId);
      }
      await updateDoc(doc(db, 'parties', partyId, 'participants', user.uid), {
        ...seatName,
        ready: true,
        updatedAt: new Date(),
      });
      // Profile name for later games; best effort (the seat name above is what the party shows).
      // Skipped for anonymous guests: their account is temporary (anonymousUserCleanup), the seat name is enough.
      if (!user.isAnonymous) {
        setDoc(doc(db, 'users', user.uid), { displayName: sanitizeUserChosenDisplayName(name), updatedAt: new Date() }, { merge: true })
          .catch(() => {});
      }
      setGiftUrl('');
      setPreview(null);
      setManual(false);
      setManualTitle('');
      setManualPrice('');
    } catch (error) {
      console.error('Guest ready failed:', { code: error?.code, name: error?.name });
      setToast(COPY.joinFailedToast);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleUndo = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'parties', partyId, 'participants', user.uid), { ready: false, updatedAt: new Date() });
    } catch (error) {
      console.error('Guest undo ready failed:', { code: error?.code, name: error?.name });
      setToast(COPY.joinFailedToast);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const isReady = participant?.ready === true;
  const steps = [
    { id: 'arrived', label: COPY.stepArrived, done: true },
    { id: 'name', label: COPY.stepName, done: nameDone },
    { id: 'gift', label: COPY.stepGift, done: giftDone },
  ];

  return (
    <section
      data-testid="guest-join-card"
      aria-labelledby={ids.header}
      className="w-full max-w-md mx-auto bg-slate-900/80 backdrop-blur-xl border border-white/10 shadow-2xl rounded-2xl p-4 sm:p-6 space-y-5"
    >
      <div className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-bold text-white break-words">{COPY.welcomeTitle(partyTitle)}</h1>
        <p className="text-sm text-slate-300">
          {isReady && !terminalMessage ? COPY.welcomeDone(hostFirstName) : COPY.welcomeBody(hostFirstName)}
        </p>
      </div>

      {terminalMessage ? (
        <div className="space-y-4">
          <p className="text-base text-slate-200">{terminalMessage}</p>
          <a
            href="/"
            className={`inline-flex items-center justify-center w-full min-h-11 px-4 py-2 rounded-md font-medium bg-slate-800 text-white hover:bg-slate-700 ${FOCUS_RING}`}
          >
            {COPY.goHome}
          </a>
        </div>
      ) : isReady ? (
        <div className="space-y-4" role="status">
          <p className="flex items-start gap-2 text-base text-green-300">
            <CheckCircleIcon className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{COPY.readyDone}</span>
          </p>
          <button
            type="button"
            onClick={handleUndo}
            disabled={saving}
            aria-busy={saving || undefined}
            className={`w-full min-h-11 px-4 py-2 rounded-md font-medium bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-60 ${FOCUS_RING}`}
          >
            {COPY.readyUndo}
          </button>
        </div>
      ) : (
        <>
          <div>
            <p id={ids.header} className="text-sm font-semibold text-white mb-2" aria-live="polite">
              {guestStepsHeader(remaining)}
            </p>
            <ol className="grid grid-cols-3 gap-2" aria-label={guestStepsHeader(remaining)}>
              {steps.map((step) => (
                <li
                  key={step.id}
                  data-step={step.id}
                  data-done={step.done ? 'true' : 'false'}
                  className={`flex items-center gap-1.5 min-h-11 px-2 rounded-lg border text-xs sm:text-sm leading-tight ${
                    step.done ? 'border-green-500/40 bg-green-500/10 text-green-200' : 'border-white/10 bg-slate-950/40 text-slate-300'
                  }`}
                >
                  {step.done ? (
                    <CheckCircleIcon className="w-5 h-5 shrink-0 text-green-400" aria-hidden="true" />
                  ) : (
                    <span className="w-5 h-5 shrink-0 rounded-full border-2 border-slate-500" aria-hidden="true" />
                  )}
                  <span>{step.label}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="space-y-1">
            <label htmlFor={ids.name} className="block text-sm font-medium text-slate-200">
              {COPY.nameLabel}
            </label>
            <input
              id={ids.name}
              type="text"
              autoComplete="given-name"
              enterKeyHint="next"
              maxLength={64}
              value={name}
              disabled={saving}
              onChange={(e) => {
                setNameTouched(true);
                setName(e.target.value);
              }}
              onBlur={(e) => {
                setNameTouched(true);
                setBlurredName(e.target.value);
              }}
              aria-invalid={showNameError || undefined}
              aria-describedby={showNameError ? ids.nameError : undefined}
              className={FIELD}
            />
            {showNameError && (
              <p id={ids.nameError} className="text-sm text-red-300">
                {COPY.nameError}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor={ids.gift} className="block text-sm font-medium text-slate-200">
              {COPY.giftUrlLabel}
            </label>
            <input
              id={ids.gift}
              type="url"
              inputMode="url"
              autoComplete="off"
              enterKeyHint="go"
              placeholder={COPY.giftUrlPlaceholder}
              value={giftUrl}
              disabled={saving}
              onChange={(e) => {
                setGiftUrl(e.target.value);
                setPreview(null);
              }}
              onPaste={(e) => {
                const pasted = e.clipboardData?.getData('text');
                if (pasted) {
                  e.preventDefault();
                  setGiftUrl(pasted.trim());
                  if (!manual) runScrape(pasted);
                }
              }}
              onBlur={() => {
                if (!manual && !preview && !scraping) runScrape(giftUrl);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !manual) {
                  e.preventDefault();
                  runScrape(giftUrl);
                }
              }}
              className={FIELD}
            />
            {scraping && (
              <p className="flex items-center gap-2 text-sm text-slate-300" role="status">
                <span className="inline-block w-4 h-4 rounded-full border-2 border-purple-400 border-t-transparent animate-spin" aria-hidden="true" />
                {COPY.giftPending}
              </p>
            )}
            {!manual && preview && (
              <div data-testid="gift-preview" className="flex items-center gap-3 p-3 rounded-lg bg-slate-950/50 border border-white/10">
                {preview.image ? (
                  <img src={preview.image} alt="" className="w-12 h-12 rounded object-cover shrink-0" />
                ) : null}
                <p className="text-sm text-white break-words">{preview.title}</p>
              </div>
            )}
            {!manual && !preview && gift && !giftUrl.trim() && (
              <div data-testid="gift-saved" className="flex items-center gap-3 p-3 rounded-lg bg-slate-950/50 border border-white/10">
                {gift.image ? <img src={gift.image} alt="" className="w-12 h-12 rounded object-cover shrink-0" /> : null}
                <p className="text-sm text-white break-words">{gift.title}</p>
              </div>
            )}
            {manual ? (
              <div id={ids.manual} className="space-y-3">
                <p className="text-sm text-slate-300">{COPY.giftManualHelper}</p>
                <div className="space-y-1">
                  <label htmlFor={`${ids.manual}-title`} className="block text-sm font-medium text-slate-200">
                    {COPY.giftTitleLabel}
                  </label>
                  <input
                    id={`${ids.manual}-title`}
                    type="text"
                    maxLength={200}
                    placeholder={COPY.giftTitlePlaceholder}
                    value={manualTitle}
                    disabled={saving}
                    onChange={(e) => setManualTitle(e.target.value)}
                    aria-invalid={manualStoreName || undefined}
                    aria-describedby={manualStoreName ? `${ids.manual}-store` : undefined}
                    className={FIELD}
                  />
                  {manualStoreName && (
                    <p id={`${ids.manual}-store`} className="text-sm text-red-300">
                      {COPY.giftStoreName}
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <label htmlFor={`${ids.manual}-price`} className="block text-sm font-medium text-slate-200">
                    {COPY.giftPriceLabel}
                  </label>
                  <input
                    id={`${ids.manual}-price`}
                    type="text"
                    inputMode="decimal"
                    maxLength={20}
                    placeholder={COPY.giftPricePlaceholder}
                    value={manualPrice}
                    disabled={saving}
                    onChange={(e) => setManualPrice(e.target.value)}
                    className={FIELD}
                  />
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    setManual(false);
                    setManualTitle('');
                    setManualPrice('');
                  }}
                  className={`min-h-11 px-2 text-sm text-purple-300 hover:text-purple-200 underline ${FOCUS_RING}`}
                >
                  {COPY.giftTryUrl}
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={saving}
                onClick={() => setManual(true)}
                className={`min-h-11 px-2 text-sm text-purple-300 hover:text-purple-200 underline ${FOCUS_RING}`}
              >
                {COPY.giftManualToggle}
              </button>
            )}
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={handleReady}
              disabled={!canReady}
              aria-busy={saving || undefined}
              aria-describedby={lockReason ? ids.lock : undefined}
              className={`inline-flex items-center justify-center gap-2 w-full min-h-12 px-4 py-3 rounded-md text-lg font-semibold text-white bg-gradient-to-r from-indigo-600 to-purple-600 disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS_RING}`}
            >
              {saving && (
                <span className="inline-block w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" aria-hidden="true" />
              )}
              {saving ? COPY.readySaving : COPY.readyCta}
            </button>
            {lockReason && (
              <p id={ids.lock} className="text-sm text-slate-400">
                {lockReason}
              </p>
            )}
          </div>
        </>
      )}

      {toast && (
        <div
          role="alert"
          className="fixed top-20 left-4 right-4 sm:left-auto sm:right-4 sm:w-96 z-50 flex items-start gap-3 rounded-lg border border-red-500/30 bg-slate-950 px-4 py-3 text-sm text-red-200 shadow-lg"
        >
          <span className="flex-1">{toast}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className={`min-h-11 min-w-11 -my-2 -mr-2 px-2 text-red-200 underline ${FOCUS_RING}`}
          >
            {COPY.dismiss}
          </button>
        </div>
      )}
    </section>
  );
}
