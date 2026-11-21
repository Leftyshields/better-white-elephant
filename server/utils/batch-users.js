/**
 * Party-scoped batch user display lookup (no email / cross-party leakage).
 */

import {
  displayNameMatchesEmailLocalPart,
  pickDisplayName,
  playerFallbackForUserId,
} from '../lib/display-names.js';

export {
  looksLikeEmail,
  playerFallbackForUserId,
  pickDisplayName,
  emailLocalPart,
  displayNameMatchesEmailLocalPart,
  pickHostNameForInvite,
  resolveSyncedFirestoreDisplayName,
} from '../lib/display-names.js';

export function isValidPartyId(partyId) {
  return (
    typeof partyId === 'string' &&
    partyId.length > 0 &&
    partyId.length <= 128 &&
    /^[a-zA-Z0-9_-]+$/.test(partyId)
  );
}

/**
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {string} partyId
 * @param {string} callerUid
 * @returns {Promise<boolean>}
 */
export async function verifyCallerPartyAccess(db, partyId, callerUid) {
  if (!partyId || !callerUid) {
    return false;
  }

  try {
    const partyDoc = await db.collection('parties').doc(partyId).get();
    if (!partyDoc.exists) {
      return false;
    }

    const adminId = partyDoc.data()?.adminId;
    if (adminId === callerUid) {
      return true;
    }

    const participantDoc = await db
      .collection('parties')
      .doc(partyId)
      .collection('participants')
      .doc(callerUid)
      .get();

    return participantDoc.exists;
  } catch (error) {
    console.error('batch-users: party access check failed:', error);
    return false;
  }
}

/**
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {string} partyId
 * @returns {Promise<Set<string>>}
 */
export async function getPartyMemberUserIds(db, partyId) {
  const allowed = new Set();

  try {
    const partyDoc = await db.collection('parties').doc(partyId).get();
    if (!partyDoc.exists) {
      return allowed;
    }

    const adminId = partyDoc.data()?.adminId;
    if (adminId) {
      allowed.add(adminId);
    }

    const participantsSnap = await db
      .collection('parties')
      .doc(partyId)
      .collection('participants')
      .get();

    for (const participantDoc of participantsSnap.docs) {
      allowed.add(participantDoc.id);
    }

    return allowed;
  } catch (error) {
    console.error('batch-users: failed to load party members:', error);
    return new Set();
  }
}

/**
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {import('firebase-admin/auth').Auth} auth
 * @param {string[]} userIds
 * @returns {Promise<{ users: Record<string, string>, bots: Record<string, boolean>, photos: Record<string, string|null> }>}
 */
export async function fetchDisplayProfilesForUserIds(db, auth, userIds) {
  const users = {};
  const bots = {};
  const photos = {};

  for (const userId of userIds) {
    try {
      const isBot = userId.startsWith('bot_');

      const userDoc = await db.collection('users').doc(userId).get();
      let firestoreDisplayName = null;
      let firestoreName = null;
      let avatarUrl = null;
      let isBotUser = false;
      // Emails are read only to reject names derived from them; they are never returned.
      const emails = [];

      if (userDoc.exists) {
        const userData = userDoc.data();
        if (typeof userData.email === 'string') emails.push(userData.email);
        firestoreDisplayName =
          userData.displayName != null ? userData.displayName : null;
        firestoreName = userData.name != null ? userData.name : null;
        avatarUrl = userData.avatarUrl || null;
        isBotUser = userData.isBot === true || isBot;
      }

      let authDisplayName = null;
      if (!isBotUser) {
        try {
          const authUser = await auth.getUser(userId);
          authDisplayName = authUser.displayName || null;
          if (typeof authUser.email === 'string') emails.push(authUser.email);
          if (!avatarUrl && authUser.photoURL) {
            avatarUrl = authUser.photoURL;
          }
        } catch {
          // User may not exist in Auth; Firestore-only is OK.
        }
      }

      const notEmailLocalPart = (name) =>
        emails.some((email) => displayNameMatchesEmailLocalPart(name, email)) ? null : name;
      const displayName = pickDisplayName(
        userId,
        notEmailLocalPart(firestoreDisplayName),
        notEmailLocalPart(firestoreName),
        notEmailLocalPart(authDisplayName),
      );

      users[userId] = displayName;
      photos[userId] = avatarUrl || null;
      bots[userId] = isBotUser;
    } catch (error) {
      console.error(`batch-users: error fetching user ${userId}:`, error);
      users[userId] = playerFallbackForUserId(userId);
      photos[userId] = null;
      bots[userId] = false;
    }
  }

  return { users, bots, photos };
}

/**
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {import('firebase-admin/auth').Auth} auth
 * @param {string} callerUid
 * @param {string} partyId
 * @param {string[]} userIds
 * @returns {Promise<{ users: Record<string, string>, bots: Record<string, boolean>, photos: Record<string, string|null> }>}
 */
export async function batchUsersLookup(db, auth, callerUid, partyId, userIds) {
  const hasAccess = await verifyCallerPartyAccess(db, partyId, callerUid);
  if (!hasAccess) {
    return { users: {}, bots: {}, photos: {} };
  }

  const allowedIds = await getPartyMemberUserIds(db, partyId);
  const visibleUserIds = userIds.filter((id) => allowedIds.has(id));
  return fetchDisplayProfilesForUserIds(db, auth, visibleUserIds);
}