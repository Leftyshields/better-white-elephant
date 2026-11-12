/**
 * Firestore batch helper — max 500 operations per commit.
 */

const BATCH_LIMIT = 500;

/**
 * @param {FirebaseFirestore.Firestore} db
 * @param {Array<{ type: 'delete'|'update', ref: FirebaseFirestore.DocumentReference, data?: object }>} operations
 */
export async function commitOperationsInBatches(db, operations) {
  for (let i = 0; i < operations.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    const chunk = operations.slice(i, i + BATCH_LIMIT);
    for (const op of chunk) {
      if (op.type === 'delete') {
        batch.delete(op.ref);
      } else if (op.type === 'update') {
        batch.update(op.ref, op.data);
      }
    }
    if (chunk.length > 0) {
      await batch.commit();
    }
  }
}
