/**
 * Scheduled cleanup for unlinked anonymous guests (no Identity Platform auto-cleanup on this project).
 *
 * Deletes Firebase Auth users that have NO linked providers (anonymous) and were created more than
 * ANON_USER_RETENTION_DAYS ago, plus their participant seat, join proof and gift docs, but ONLY for
 * parties whose status is ENDED. A guest is skipped entirely while they sit in a LOBBY or ACTIVE
 * party, or in a party that ended less than ANON_USER_RETENTION_DAYS ago (the post-game window for
 * shipping details and account linking), so nobody loses a seat or their win screen. Docs are deleted before the Auth user, so a failed run
 * is retried in full next time (idempotent). Logs carry counts only: no uids, emails or names.
 */
import {
  commitOperationsInBatches,
  dedupeOperationsByDocumentPath,
  getAllDocumentsFromQuery,
} from './dataRetentionBatch.js';
import { isEndedPartyPastRetention } from './dataRetentionLogic.js';

export const ANON_USER_RETENTION_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const LIST_USERS_PAGE_SIZE = 1000;
const DELETE_USERS_CHUNK = 1000;
const SEAT_KEEPING_STATUSES = new Set(['LOBBY', 'ACTIVE']);

/**
 * Anonymous Auth users carry no provider entries, email or phone. Any linked provider keeps the user.
 * @param {{ providerData?: unknown[], email?: string, phoneNumber?: string }} userRecord
 */
export function isUnlinkedAnonymousUser(userRecord) {
  return (
    !!userRecord &&
    Array.isArray(userRecord.providerData) &&
    userRecord.providerData.length === 0 &&
    !userRecord.email &&
    !userRecord.phoneNumber
  );
}

/**
 * @param {{ metadata?: { creationTime?: string } }} userRecord
 * @param {number} nowMs
 */
export function isPastAnonRetention(userRecord, nowMs) {
  const created = Date.parse(userRecord?.metadata?.creationTime ?? '');
  if (!Number.isFinite(created)) {
    return false;
  }
  return created <= nowMs - ANON_USER_RETENTION_DAYS * MS_PER_DAY;
}

/**
 * Decide what to do with one candidate given the parties they sit in.
 * @param {string[]} partyIds
 * @param {Map<string, object | null>} partyById  party doc data, null when the party doc is gone
 * @param {number} nowMs
 * @returns {{ keepUser: boolean, endedPartyIds: string[] }}
 */
export function planAnonymousUserCleanup(partyIds, partyById, nowMs) {
  const cutoffMs = nowMs - ANON_USER_RETENTION_DAYS * MS_PER_DAY;
  const endedPartyIds = [];
  for (const partyId of partyIds) {
    const party = partyById.get(partyId) ?? null;
    const status = party?.status ?? null;
    if (SEAT_KEEPING_STATUSES.has(status)) {
      return { keepUser: true, endedPartyIds: [] };
    }
    if (status === 'ENDED') {
      if (!isEndedPartyPastRetention(party, cutoffMs)) {
        return { keepUser: true, endedPartyIds: [] };
      }
      endedPartyIds.push(partyId);
    }
  }
  return { keepUser: false, endedPartyIds };
}

async function listExpiredAnonymousUids(auth, nowMs) {
  const uids = [];
  let scanned = 0;
  let pageToken;
  do {
    const page = await auth.listUsers(LIST_USERS_PAGE_SIZE, pageToken);
    scanned += page.users.length;
    for (const userRecord of page.users) {
      if (isUnlinkedAnonymousUser(userRecord) && isPastAnonRetention(userRecord, nowMs)) {
        uids.push(userRecord.uid);
      }
    }
    pageToken = page.pageToken;
  } while (pageToken);
  return { uids, scanned };
}

/** uid -> partyIds, from participant doc paths parties/{partyId}/participants/{uid}. */
async function loadPartyIdsByUid(db, candidateUids) {
  const wanted = new Set(candidateUids);
  const partyIdsByUid = new Map();
  const seatDocs = await getAllDocumentsFromQuery(db.collectionGroup('participants').select());
  for (const seatDoc of seatDocs) {
    const partyRef = seatDoc.ref.parent.parent;
    if (!wanted.has(seatDoc.id) || !partyRef || partyRef.parent.id !== 'parties') {
      continue;
    }
    const list = partyIdsByUid.get(seatDoc.id) ?? [];
    list.push(partyRef.id);
    partyIdsByUid.set(seatDoc.id, list);
  }
  return partyIdsByUid;
}

async function loadParties(db, partyIds) {
  const partyById = new Map();
  const unique = [...new Set(partyIds)];
  if (unique.length === 0) {
    return partyById;
  }
  const snaps = await db.getAll(...unique.map((id) => db.collection('parties').doc(id)));
  for (const snap of snaps) {
    partyById.set(snap.id, snap.exists ? snap.data() : null);
  }
  return partyById;
}

async function queueEndedPartyDocDeletes(db, uid, endedPartyIds, operations) {
  if (endedPartyIds.length === 0) {
    return;
  }
  const ended = new Set(endedPartyIds);
  for (const partyId of endedPartyIds) {
    const partyRef = db.collection('parties').doc(partyId);
    operations.push({ type: 'delete', ref: partyRef.collection('participants').doc(uid) });
    operations.push({ type: 'delete', ref: partyRef.collection('joinProofs').doc(uid) });
  }
  const gifts = await db.collection('gifts').where('submitterId', '==', uid).get();
  for (const giftDoc of gifts.docs) {
    if (ended.has(giftDoc.data()?.partyId)) {
      operations.push({ type: 'delete', ref: giftDoc.ref });
    }
  }
}

async function deleteAuthUsers(auth, uids) {
  let deleted = 0;
  let failed = 0;
  for (let i = 0; i < uids.length; i += DELETE_USERS_CHUNK) {
    const result = await auth.deleteUsers(uids.slice(i, i + DELETE_USERS_CHUNK));
    deleted += result.successCount;
    failed += result.failureCount;
  }
  return { deleted, failed };
}

/**
 * @param {object} deps
 * @param {FirebaseFirestore.Firestore} deps.db
 * @param {import('firebase-admin/auth').Auth} deps.auth
 * @param {number} [deps.nowMs]
 * @param {{ log: Function }} [deps.logger]
 */
export async function runAnonymousUserCleanup({ db, auth, nowMs = Date.now(), logger = console }) {
  const { uids: candidateUids, scanned } = await listExpiredAnonymousUids(auth, nowMs);
  const stats = {
    scannedUsers: scanned,
    expiredAnonymousUsers: candidateUids.length,
    keptForOpenOrRecentParty: 0,
    deletedDocs: 0,
    deletedUsers: 0,
    failedUserDeletes: 0,
  };

  if (candidateUids.length > 0) {
    const partyIdsByUid = await loadPartyIdsByUid(db, candidateUids);
    const partyById = await loadParties(db, [...partyIdsByUid.values()].flat());

    const operations = [];
    const uidsToDelete = [];
    for (const uid of candidateUids) {
      const plan = planAnonymousUserCleanup(partyIdsByUid.get(uid) ?? [], partyById, nowMs);
      if (plan.keepUser) {
        stats.keptForOpenOrRecentParty += 1;
        continue;
      }
      await queueEndedPartyDocDeletes(db, uid, plan.endedPartyIds, operations);
      uidsToDelete.push(uid);
    }

    const deduped = dedupeOperationsByDocumentPath(operations);
    await commitOperationsInBatches(db, deduped);
    stats.deletedDocs = deduped.length;

    const authResult = await deleteAuthUsers(auth, uidsToDelete);
    stats.deletedUsers = authResult.deleted;
    stats.failedUserDeletes = authResult.failed;
  }

  logger.log('anonymousUserCleanup', stats);
  return stats;
}
