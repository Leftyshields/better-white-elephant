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