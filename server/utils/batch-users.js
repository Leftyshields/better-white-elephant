import admin from 'firebase-admin';

/**
 * User IDs the caller may resolve via batch lookup: self, party admins, and
 * participants in parties where the caller is admin or a participant.
 *
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {string} callerUid
 * @returns {Promise<Set<string>>}
 */
export async function getCoParticipantUserIds(db, callerUid) {
  if (!callerUid) {
    return new Set();
  }

  try {
    const partyIds = new Set();

    const adminPartiesSnap = await db
      .collection('parties')
      .where('adminId', '==', callerUid)
      .get();

    for (const doc of adminPartiesSnap.docs) {
      partyIds.add(doc.id);
    }

    let participantMembershipSnap;
    try {
      participantMembershipSnap = await db
        .collectionGroup('participants')
        .where(admin.firestore.FieldPath.documentId(), '==', callerUid)
        .get();
    } catch (groupError) {
      console.error('batch-users: collectionGroup participants lookup failed:', groupError);
      participantMembershipSnap = { docs: [] };
    }

    for (const doc of participantMembershipSnap.docs) {
      const partyRef = doc.ref.parent?.parent;
      if (partyRef?.id) {
        partyIds.add(partyRef.id);
      }
    }

    const allowed = new Set();
    if (partyIds.size === 0) {
      return allowed;
    }

    allowed.add(callerUid);

    await Promise.all(
      [...partyIds].map(async (partyId) => {
        const partyDoc = await db.collection('parties').doc(partyId).get();
        if (partyDoc.exists) {
          const adminId = partyDoc.data()?.adminId;
          if (adminId) {
            allowed.add(adminId);
          }
        }

        const participantsSnap = await db
          .collection('parties')
          .doc(partyId)
          .collection('participants')
          .get();

        for (const participantDoc of participantsSnap.docs) {
          allowed.add(participantDoc.id);
        }
      }),
    );

    return allowed;
  } catch (error) {
    console.error('batch-users: failed to resolve co-participants:', error);
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
      let avatarUrl = null;
      let isBotUser = false;

      if (userDoc.exists) {
        const userData = userDoc.data();
        firestoreDisplayName = userData.displayName || userData.name || null;
        avatarUrl = userData.avatarUrl || null;
        isBotUser = userData.isBot === true || isBot;
      }

      let authDisplayName = null;
      if (!isBotUser) {
        try {
          const authUser = await auth.getUser(userId);
          authDisplayName = authUser.displayName || null;
          if (!avatarUrl && authUser.photoURL) {
            avatarUrl = authUser.photoURL;
          }
        } catch {
          // User may not exist in Auth; Firestore-only is OK.
        }
      }

      const displayName =
        firestoreDisplayName ||
        authDisplayName ||
        `User ${userId.slice(0, 8)}`;

      users[userId] = displayName;
      photos[userId] = avatarUrl || null;
      bots[userId] = isBotUser;
    } catch (error) {
      console.error(`batch-users: error fetching user ${userId}:`, error);
      users[userId] = `User ${userId.slice(0, 8)}`;
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
 * @param {string[]} userIds
 * @returns {Promise<{ users: Record<string, string>, bots: Record<string, boolean>, photos: Record<string, string|null> }>}
 */
export async function batchUsersLookup(db, auth, callerUid, userIds) {
  const allowedIds = await getCoParticipantUserIds(db, callerUid);
  const visibleUserIds = userIds.filter((id) => allowedIds.has(id));
  return fetchDisplayProfilesForUserIds(db, auth, visibleUserIds);
}