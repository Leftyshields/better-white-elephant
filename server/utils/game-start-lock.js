/**
 * Firestore transaction to claim party LOBBY -> ACTIVE (prevents double-start races).
 */

/**
 * @param {import('firebase-admin/firestore').Firestore} firestoreDb
 * @param {string} partyId
 * @returns {Promise<'claimed' | 'already_active' | 'not_lobby'>}
 */
export async function claimPartyLobbyForStart(firestoreDb, partyId) {
  return firestoreDb.runTransaction(async (transaction) => {
    const partyRef = firestoreDb.collection('parties').doc(partyId);
    const snap = await transaction.get(partyRef);
    if (!snap.exists) {
      throw new Error('Party not found');
    }
    const status = snap.data()?.status;
    if (status === 'ACTIVE') {
      return 'already_active';
    }
    if (status !== 'LOBBY') {
      return 'not_lobby';
    }
    transaction.update(partyRef, {
      status: 'ACTIVE',
      updatedAt: new Date(),
    });
    return 'claimed';
  });
}

/**
 * Roll party ACTIVE → LOBBY when no game state was persisted (failed start).
 * Firestore transaction only applies when status is still ACTIVE (compare-and-set).
 * Call only after verifying loadGameState(partyId) is null so a concurrent winner is not undone.
 *
 * @returns {Promise<'reverted' | 'not_active' | 'missing'>}
 */
export async function revertOrphanedActivePartyToLobby(firestoreDb, partyId) {
  return firestoreDb.runTransaction(async (transaction) => {
    const partyRef = firestoreDb.collection('parties').doc(partyId);
    const snap = await transaction.get(partyRef);
    if (!snap.exists) {
      return 'missing';
    }
    if (snap.data()?.status !== 'ACTIVE') {
      return 'not_active';
    }
    transaction.update(partyRef, {
      status: 'LOBBY',
      updatedAt: new Date(),
    });
    return 'reverted';
  });
}