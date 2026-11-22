/**
 * Guest one-screen join card (batch 2 item 4), shared by the invite-link and party-code paths.
 *
 * Progress strip: three real items. "You're here" is credited the moment the card shows (the guest
 * really opened the link or typed a valid code), then "Your name" and "Your gift". The header says
 * what's left. "I'm ready" is the finish, the only primary button, and it saves the gift, the name
 * and ready: true together. No reloads, no alert(), no address step.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { collection, doc, getDocs, limit, query, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import { seatGiftLink } from '../utils/seatGift.js';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import { db } from '../utils/firebase.js';
import { scrapeGiftUrl } from '../utils/api.js';
import { REQUEST_TIMEOUT_MS, isCancelledError, isTimeoutError, withTimeout } from '../utils/withTimeout.js';
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
// The name never goes in that gift draft (Security signed that it holds no name). A typed or
// blurred name lives in this module Map only, keyed by party and uid, so the lobby card can save
// it once the seat exists. A full reload (F5) clears the Map; the name then comes back from the seat.
const drafts = new Map();
// Wait this long after the name field loses focus before saving the name to the seat (G18).
export const NAME_SAVE_DEBOUNCE_MS = 400;
// A rejected save may retry on a later seat snapshot, but only a few times, with backoff, and
// then it waits for the next blur. Otherwise a deny plus rollback snapshot can loop forever.
export const NAME_SAVE_MAX_RETRIES = 3;

function memoryDraftKey(partyId, uid) {
  return uid ? `${partyId}::${uid}` : `${partyId}::pending`;
}

function readMemoryDraft(partyId, uid) {
  if (uid) {
    const keyed = drafts.get(`${partyId}::${uid}`);
    if (keyed) return keyed;
  }
  return drafts.get(`${partyId}::pending`) || null;
}

/** Give this uid the pending draft once, then drop pending so a later account cannot adopt it. */
function claimPendingMemoryDraft(partyId, uid) {
  if (!uid) return;
  if (drafts.has(`${partyId}::${uid}`)) {
    drafts.delete(`${partyId}::pending`);
    return;
  }
  const pending = drafts.get(`${partyId}::pending`);
  if (pending) drafts.set(`${partyId}::${uid}`, pending);
  drafts.delete(`${partyId}::pending`);
}

function previewMatchesLink(preview, giftUrl) {
  if (!preview) return null;
  const a = normalizeGiftUrl(preview.url);
  const b = normalizeGiftUrl(giftUrl);
  return a && b && a === b ? preview : null;
}

/** Field value after F5: the seat's first name, plus a space and last initial when the seat has one. */
export function savedSeatName(participant, user) {
  const display = typeof participant?.displayName === 'string' ? participant.displayName : '';
  const initial = typeof participant?.lastInitial === 'string' ? participant.lastInitial.trim() : '';
  if (display && initial) return `${display} ${initial}`;
  if (display) return display;
  return sanitizeUserChosenDisplayName(user?.displayName) || '';
}

/** Test-only: typed values are in-memory and would leak across landing tests that share a partyId. */
export function clearGuestJoinDrafts() {
  drafts.clear();
}

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
  seatWriteSlow = false,
  onRetrySeat,
  onBusyChange,
}) {
  claimPendingMemoryDraft(partyId, user?.uid);
  const memory = readMemoryDraft(partyId, user?.uid) || {};
  const stored = readGuestGiftDraft(partyId, user?.uid);
  const draft = { ...stored, ...memory };
  const savedName = savedSeatName(participant, user);
  const [name, setName] = useState(draft.name ?? savedName);
  const [nameTouched, setNameTouched] = useState(Boolean(draft.nameTouched || draft.blurredName != null));
  const [giftUrl, setGiftUrl] = useState(draft.giftUrl ?? '');
  const [preview, setPreview] = useState(previewMatchesLink(draft.preview ?? null, draft.giftUrl ?? ''));
  const [manual, setManual] = useState(draft.manual ?? false);
  const [manualTitle, setManualTitle] = useState(draft.manualTitle ?? '');
  const [manualPrice, setManualPrice] = useState(draft.manualPrice ?? '');
  const [scraping, setScraping] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const savingRef = useRef(false);
  const scrapeSeq = useRef(0);
  const saveSeq = useRef(0);
  const saveGeneration = useRef(0);
  const giftDocIdRef = useRef(gift?.id || null);
  const giftWriteInFlightRef = useRef(null);
  const [lookupSlow, setLookupSlow] = useState(false);
  const [saveSlow, setSaveSlow] = useState(false);
  const [undoSlow, setUndoSlow] = useState(false);
  // "You're in!" only after the write is confirmed, not after Firestore's local pending snapshot.
  // A confirmed seat snapshot wins. Otherwise keep what the card that handed over (invite landing
  // to lobby) already knew: its ready save may have been acked before the confirmed snapshot lands.
  const [readyAcked, setReadyAcked] = useState(() =>
    participant && participant.hasPendingWrites !== true
      ? participant.ready === true
      : draft.readyAcked === true,
  );
  // Seat retries and ready saves still in flight; the invite landing stays up until this is 0.
  const busyCount = useRef(0);
  const undoSeq = useRef(0);
  const editVersion = useRef(0);
  const timeoutAbortRef = useRef(null);
  if (timeoutAbortRef.current == null) {
    timeoutAbortRef.current = new AbortController();
  }
  const ids = { name: useId(), nameError: useId(), gift: useId(), lock: useId(), header: useId(), manual: useId(), lookup: useId(), saveSlow: useId(), undoSlow: useId() };

  // G18: the name saves to the guest's own seat a moment after the field loses focus, so the host
  // sees it before Ready and it survives F5. Only a valid name that differs from the seat is written.
  // blurredName and nameTouched also live in the module Map so a remounted lobby card can save a
  // name that was typed (and usually blurred) on the landing card before the seat existed.
  const [blurredName, setBlurredName] = useState(
    draft.blurredName != null ? draft.blurredName : (draft.nameTouched ? (draft.name ?? null) : null),
  );
  const [nameSaveGen, setNameSaveGen] = useState(0);
  const nameWriteRef = useRef(null);
  const nameSaveAttemptsRef = useRef(0);
  const wasSeatedRef = useRef(seated);

  useEffect(() => {
    const key = memoryDraftKey(partyId, user?.uid);
    drafts.set(key, { name, giftUrl, preview, manual, manualTitle, manualPrice, nameTouched, blurredName, readyAcked });
    if (user?.uid) drafts.delete(`${partyId}::pending`);
    writeGuestGiftDraft(partyId, user?.uid, { giftUrl, preview, manual, manualTitle, manualPrice });
  }, [partyId, user?.uid, name, giftUrl, preview, manual, manualTitle, manualPrice, nameTouched, blurredName, readyAcked]);

  useEffect(() => {
    if (gift?.id) giftDocIdRef.current = gift.id;
  }, [gift?.id]);
  const seatDisplayName = participant?.displayName;
  const seatLastInitial = participant?.lastInitial;
  const seatUpdatedAt = participant?.updatedAt?.valueOf?.() ?? participant?.updatedAt ?? null;

  // Catch up a name typed on the landing card only when the seat actually lands (false -> true)
  // on this instance. A remount already seeds blurredName from the in-memory draft. Do not run
  // this when nameTouched flips true on an already-seated lobby card: that would write the first
  // letter to the seat while the guest is still typing.
  useEffect(() => {
    const justSeated = seated && !wasSeatedRef.current;
    wasSeatedRef.current = seated;
    if (justSeated && nameTouched && blurredName === null && participant?.ready !== true) {
      setBlurredName(name);
    }
  }, [seated, nameTouched, blurredName, participant?.ready, name]);

  useEffect(() => {
    if (blurredName === null || !seated || !user?.uid || participant?.ready === true) return undefined;
    const fields = typedSeatName(blurredName);
    if (!fields) return undefined;
    const key = `${fields.displayName}|${fields.lastInitial ?? ''}`;
    const onSeat =
      fields.displayName === seatDisplayName && (!fields.lastInitial || fields.lastInitial === seatLastInitial);
    if (onSeat || nameWriteRef.current === key) return undefined;
    if (nameSaveAttemptsRef.current >= NAME_SAVE_MAX_RETRIES) return undefined;
    const delay = NAME_SAVE_DEBOUNCE_MS * (2 ** nameSaveAttemptsRef.current);
    const timer = setTimeout(() => {
      nameWriteRef.current = key;
      nameSaveAttemptsRef.current += 1;
      updateDoc(doc(db, 'parties', partyId, 'participants', user.uid), { ...fields, updatedAt: new Date() })
        .catch((error) => {
          nameWriteRef.current = null;
          console.error('Guest name save failed:', { code: error?.code, name: error?.name });
        });
    }, delay);
    return () => clearTimeout(timer);
  }, [blurredName, nameSaveGen, seated, user?.uid, partyId, participant?.ready, seatDisplayName, seatLastInitial, seatUpdatedAt]);

  useEffect(() => {
    if (!nameTouched && !name && savedName) setName(savedName);
  }, [savedName, nameTouched, name]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const controller = timeoutAbortRef.current;
    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    // Follow a confirmed server snapshot, not Firestore's local pending write.
    // After an undo timeout the player stays ready until this says otherwise:
    // a late un-ready write that lands flips the card off "You're in!" on its own.
    if (participant?.ready === true && participant?.hasPendingWrites === false) {
      setReadyAcked(true);
      setUndoSlow(false);
      // The save landed after all: no "Tap I'm ready" hint under "You're in!".
      setSaveSlow(false);
    }
    if (participant?.ready === false && participant?.hasPendingWrites === false) {
      setReadyAcked(false);
      setUndoSlow(false);
      savingRef.current = false;
      setSaving(false);
    }
  }, [participant?.ready, participant?.hasPendingWrites]);

  const timeoutOpts = () => ({ signal: timeoutAbortRef.current.signal });
  const bumpEdit = () => {
    editVersion.current += 1;
  };
  const changeBusy = (delta) => {
    busyCount.current += delta;
    onBusyChange?.(busyCount.current > 0);
  };

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
  const canRetrySeat = !seated && seatWriteSlow && typeof onRetrySeat === 'function';
  const canReady = (seated || canRetrySeat) && nameDone && giftDone && !saving && !scraping;
  const lockReason = !nameDone
    ? COPY.readyLockedName
    : !giftDone
      ? COPY.readyLockedGift
      : !seated && (saving || !seatWriteSlow)
        ? COPY.readyLockedSeat
        : null;
  const showSaveSlow = (saveSlow && !saving) || (seatWriteSlow && nameDone && giftDone && !seated && !saving);

  const runScrape = async (rawUrl) => {
    const url = normalizeGiftUrl(rawUrl);
    if (!url) return;
    const seq = ++scrapeSeq.current;
    setScraping(true);
    setLookupSlow(false);
    setPreview(null);
    try {
      const { title, image, price, error } = await withTimeout(scrapeGiftUrl(url), REQUEST_TIMEOUT_MS, timeoutOpts());
      if (seq !== scrapeSeq.current) return;
      if (!error && usableScrapedTitle(title) && !isBareStoreName(title, url)) {
        setPreview({ url, title: title.trim(), image: image || null, price: price || null });
        setManual(false);
        setLookupSlow(false);
      } else {
        setManual(true);
        setManualTitle(usableScrapedTitle(title) ? title : '');
        setManualPrice(price || '');
      }
    } catch (error) {
      if (seq !== scrapeSeq.current) return;
      if (isCancelledError(error)) return;
      setManual(true);
      if (isTimeoutError(error)) {
        scrapeSeq.current += 1;
        setLookupSlow(true);
        setScraping(false);
        return;
      }
    } finally {
      if (seq === scrapeSeq.current) setScraping(false);
    }
  };

  // One batch (G26): the gift plus the seat's name, ready and hasGift link; rules check the link.
  // newGift set: add that gift under giftId. Otherwise update the existing gift with fields.
  const commitGiftAndSeat = async (giftId, { fields, newGift, seat }) => {
    const batch = writeBatch(db);
    const giftRef = doc(db, 'gifts', giftId);
    if (newGift) batch.set(giftRef, newGift);
    else batch.update(giftRef, { ...fields, updatedAt: new Date() });
    batch.update(doc(db, 'parties', partyId, 'participants', user.uid), {
      ...seat,
      ...seatGiftLink(giftId),
      ready: true,
      updatedAt: new Date(),
    });
    await batch.commit();
    return giftId;
  };

  const persistGift = async (fields, seat) => {
    if (giftDocIdRef.current) {
      return commitGiftAndSeat(giftDocIdRef.current, { fields, seat });
    }
    if (giftWriteInFlightRef.current) {
      const id = await giftWriteInFlightRef.current;
      return commitGiftAndSeat(id, { fields, seat });
    }
    // G24: a gift written before a reload is not in this card's refs; find it instead of adding a second.
    const write = (async () => {
      const existingId = await findOwnGiftId(partyId, user.uid);
      if (existingId) return commitGiftAndSeat(existingId, { fields, seat });
      const newId = doc(collection(db, 'gifts')).id;
      return commitGiftAndSeat(newId, {
        seat,
        newGift: {
          partyId,
          submitterId: user.uid,
          ...fields,
          isFrozen: false,
          winnerId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    })().then((id) => {
      giftDocIdRef.current = id;
      return id;
    });
    giftWriteInFlightRef.current = write;
    try {
      return await write;
    } finally {
      giftWriteInFlightRef.current = null;
    }
  };

  // After F5 mid-scrape the link is back but the preview is gone; start the lookup again so Ready
  // is not stuck on "Add your gift" until the guest blurs the URL field.
  const mountScrapeRef = useRef(false);
  useEffect(() => {
    if (mountScrapeRef.current) return;
    mountScrapeRef.current = true;
    if (!manual && !preview && giftUrl.trim()) {
      runScrape(giftUrl);
    }
  }, []); // mount only: a later blur or Enter still goes through the field handlers

  const handleReady = async () => {
    if (savingRef.current) return;
    if (!((seated || canRetrySeat) && nameDone && giftDone) || scraping) return;
    // Busy state is set synchronously so a double tap cannot start a second write (item 3).
    savingRef.current = true;
    setSaving(true);
    setSaveSlow(false);
    setToast(null);
    const seq = ++saveSeq.current;
    const generation = ++saveGeneration.current;
    const startedVersion = editVersion.current;
    const fields = pendingGift
      ? { url: pendingGift.url, title: pendingGift.title, image: pendingGift.image, price: pendingGift.price }
      : null;
    const seatAtStart = seatName;
    const nameAtStart = name;
    // Busy until the retry gives up or the writes settle (late, too), so the page keeps this
    // card mounted and the save is never dropped mid-flight.
    changeBusy(1);
    let busyHandedToWrites = false;

    const ackIfUnchanged = () => {
      if (startedVersion !== editVersion.current) return false;
      // Written now, not in the drafts effect: the invite landing may hand over to the lobby in
      // the same render, and the lobby's card must open on "You're in!" with an empty gift form.
      const draftKey = memoryDraftKey(partyId, user?.uid);
      drafts.set(draftKey, {
        ...drafts.get(draftKey),
        giftUrl: '',
        preview: null,
        manual: false,
        manualTitle: '',
        manualPrice: '',
        readyAcked: true,
      });
      writeGuestGiftDraft(partyId, user?.uid, {});
      setReadyAcked(true);
      setGiftUrl('');
      setPreview(null);
      setManual(false);
      setManualTitle('');
      setManualPrice('');
      setSaveSlow(false);
      return true;
    };

    try {
      if (!seated) {
        const retryResult = await withTimeout(Promise.resolve(onRetrySeat()), REQUEST_TIMEOUT_MS, timeoutOpts());
        if (seq !== saveSeq.current) return;
        if (retryResult === false) {
          setSaveSlow(true);
          return;
        }
      }
      const writes = (async () => {
        if (fields) {
          // Gift and seat (with its hasGift link) land in one batch.
          await persistGift(fields, seatAtStart);
          trackSubmitGift(partyId);
        } else {
          // No gift edit: link the gift I already have, if any (same as the pre-merge single batch).
          await updateDoc(doc(db, 'parties', partyId, 'participants', user.uid), {
            ...seatAtStart,
            ...(gift?.id ? seatGiftLink(gift.id) : {}),
            ready: true,
            updatedAt: new Date(),
          });
        }
        // Profile name for later games; best effort (the seat name above is what the party shows).
        // Skipped for anonymous guests: their account is temporary (anonymousUserCleanup), the seat name is enough.
        if (!user.isAnonymous) {
          setDoc(doc(db, 'users', user.uid), { displayName: sanitizeUserChosenDisplayName(nameAtStart), updatedAt: new Date() }, { merge: true })
            .catch(() => {});
        }
      })();
      busyHandedToWrites = true;
      writes.finally(() => changeBusy(-1)).catch(() => {});
      writes.then(() => {
        // Late success after a timeout: never touch the form if the guest edited or started a retry.
        if (generation !== saveGeneration.current) return;
        if (startedVersion !== editVersion.current) return;
        ackIfUnchanged();
      }).catch(() => {});
      await withTimeout(writes, REQUEST_TIMEOUT_MS, timeoutOpts());
      if (seq !== saveSeq.current) return;
      ackIfUnchanged();
    } catch (error) {
      if (seq !== saveSeq.current) return;
      if (isCancelledError(error)) return;
      if (isTimeoutError(error)) {
        saveSeq.current += 1;
        setSaveSlow(true);
        savingRef.current = false;
        setSaving(false);
        return;
      }
      console.error('Guest ready failed:', { code: error?.code, name: error?.name });
      setToast(COPY.joinFailedToast);
    } finally {
      if (!busyHandedToWrites) changeBusy(-1);
      if (seq === saveSeq.current) {
        savingRef.current = false;
        setSaving(false);
      }
    }
  };

  const handleUndo = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setUndoSlow(false);
    const seq = ++undoSeq.current;
    const generation = saveGeneration.current;
    try {
      const undoWrite = updateDoc(doc(db, 'parties', partyId, 'participants', user.uid), { ready: false, updatedAt: new Date() });
      Promise.resolve(undoWrite).then(() => {
        // Late success after a timeout: the server now says not ready, so leave "You're in!",
        // unless the guest has tapped I'm ready again since.
        if (generation !== saveGeneration.current) return;
        setReadyAcked(false);
        setUndoSlow(false);
      }).catch(() => {});
      await withTimeout(undoWrite, REQUEST_TIMEOUT_MS, timeoutOpts());
      if (seq !== undoSeq.current) return;
      setReadyAcked(false);
      setUndoSlow(false);
    } catch (error) {
      if (seq !== undoSeq.current) return;
      if (isCancelledError(error)) return;
      if (isTimeoutError(error)) {
        undoSeq.current += 1;
        setUndoSlow(true);
        savingRef.current = false;
        setSaving(false);
        return;
      }
      console.error('Guest undo ready failed:', { code: error?.code, name: error?.name });
      setToast(COPY.joinFailedToast);
    } finally {
      if (seq === undoSeq.current) {
        savingRef.current = false;
        setSaving(false);
      }
    }
  };

  const isReady = readyAcked;
  const steps = [
    { id: 'arrived', label: COPY.stepArrived, done: true },
    { id: 'name', label: COPY.stepName, done: nameDone },
    { id: 'gift', label: COPY.stepGift, done: giftDone },
  ];

  // A terminal message is a string, or { title, body } (G28 removed guest): the title replaces
  // the welcome header, since "welcome" would be false for someone the host removed.
  const terminalTitle = terminalMessage && typeof terminalMessage === 'object' ? terminalMessage.title : null;
  const terminalBody = terminalMessage && typeof terminalMessage === 'object' ? terminalMessage.body : terminalMessage;

  return (
    <section
      data-testid="guest-join-card"
      aria-labelledby={ids.header}
      className="w-full max-w-md mx-auto bg-slate-900/80 backdrop-blur-xl border border-white/10 shadow-2xl rounded-2xl p-4 sm:p-6 space-y-5"
    >
      <div className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-bold text-white break-words">
          {terminalTitle || COPY.welcomeTitle(partyTitle)}
        </h1>
        {!terminalTitle && (
          <p className="text-sm text-slate-300">
            {isReady && !terminalMessage ? COPY.welcomeDone(hostFirstName) : COPY.welcomeBody(hostFirstName)}
          </p>
        )}
      </div>

      {terminalMessage ? (
        <div className="space-y-4">
          <p className="text-base text-slate-200">{terminalBody}</p>
          <a
            href="/"
            className={`inline-flex items-center justify-center w-full min-h-11 px-4 py-2 rounded-md font-medium bg-slate-800 text-white hover:bg-slate-700 ${FOCUS_RING}`}
          >
            {COPY.goHome}
          </a>
        </div>
      ) : isReady ? (
        <div className="space-y-4">
          <p className="flex items-start gap-2 text-base text-green-300" role="status" aria-live="polite">
            <CheckCircleIcon className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{COPY.readyDone}</span>
          </p>
          <button
            type="button"
            onClick={handleUndo}
            disabled={saving}
            aria-busy={saving || undefined}
            aria-describedby={ids.undoSlow}
            className={`w-full min-h-11 px-4 py-2 rounded-md font-medium bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-60 ${FOCUS_RING}`}
          >
            {saving ? COPY.readySaving : COPY.readyUndo}
          </button>
          <p id={ids.undoSlow} className="text-sm text-slate-400" role="status" aria-live="polite">
            {undoSlow && !saving ? COPY.readyUndoSlow : ''}
          </p>
          <p id={ids.saveSlow} className="text-sm text-slate-400" role="status" aria-live="polite">
            {saveSlow && !saving ? COPY.readySaveSlow : ''}
          </p>
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
                bumpEdit();
                setName(e.target.value);
              }}
              onBlur={(e) => {
                setNameTouched(true);
                setBlurredName(e.target.value);
                nameSaveAttemptsRef.current = 0;
                setNameSaveGen((n) => n + 1);
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
                bumpEdit();
                setGiftUrl(e.target.value);
                setPreview(null);
              }}
              onPaste={(e) => {
                const pasted = e.clipboardData?.getData('text');
                if (pasted) {
                  e.preventDefault();
                  bumpEdit();
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
            <p className="flex items-center gap-2 text-sm text-slate-300" role="status" aria-live="polite">
              {scraping ? (
                <>
                  <span className="inline-block w-4 h-4 rounded-full border-2 border-purple-400 border-t-transparent animate-spin" aria-hidden="true" />
                  {COPY.giftChecking}
                </>
              ) : null}
            </p>
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
            <p id={ids.lookup} className="text-sm text-slate-300" role="status" aria-live="polite">
              {scraping ? '' : lookupSlow ? COPY.giftLookupSlow : manual ? COPY.giftManualHelper : ''}
            </p>
            {manual ? (
              <div id={ids.manual} className="space-y-3">
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
                    onChange={(e) => {
                      bumpEdit();
                      setManualTitle(e.target.value);
                    }}
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
                    onChange={(e) => {
                      bumpEdit();
                      setManualPrice(e.target.value);
                    }}
                    className={FIELD}
                  />
                </div>
                <button
                  type="button"
                  disabled={saving || scraping}
                  onClick={() => {
                    runScrape(giftUrl);
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
              aria-describedby={lockReason ? ids.lock : showSaveSlow ? ids.saveSlow : undefined}
              className={`inline-flex items-center justify-center gap-2 w-full min-h-12 px-4 py-3 rounded-md text-lg font-semibold text-white bg-gradient-to-r from-indigo-600 to-purple-600 disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS_RING}`}
            >
              {saving && (
                <span className="inline-block w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" aria-hidden="true" />
              )}
              {saving ? COPY.readySaving : COPY.readyCta}
            </button>
            <p id={ids.lock} className="text-sm text-slate-400" role="status" aria-live="polite">
              {lockReason || ''}
            </p>
            <p id={ids.saveSlow} className="text-sm text-slate-400" role="status" aria-live="polite">
              {showSaveSlow ? COPY.readySaveSlow : ''}
            </p>
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
