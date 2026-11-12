/**
 * Firestore batch helper — max 500 operations per commit.
 */

const BATCH_LIMIT = 500;

/**
 * Firestore batches cannot update the same document twice. Keep the first op per ref.path.
 * @param {Array<{ ref: { path: string } }>} operations
 */
export function dedupeOperationsByDocumentPath(operations) {
  const byPath = new Map();
  for (const op of operations) {
    const path = op.ref?.path;
    if (!path || byPath.has(path)) continue;
    byPath.set(path, op);
  }
  return [...byPath.values()];
}

/**
 * Page through a query until all documents are read (avoids silent truncation at limit(500)).
 * @param {FirebaseFirestore.Query} baseQuery — without limit/startAfter
 * @param {number} [pageSize=500]
 */
export async function getAllDocumentsFromQuery(baseQuery, pageSize = BATCH_LIMIT) {
  const docs = [];
  let lastDoc = null;
  for (;;) {
    let pageQuery = baseQuery.limit(pageSize);
    if (lastDoc) {
      pageQuery = pageQuery.startAfter(lastDoc);
    }
    const snapshot = await pageQuery.get();
    docs.push(...snapshot.docs);
    if (snapshot.docs.length < pageSize) {
      return docs;
    }
    lastDoc = snapshot.docs[snapshot.docs.length - 1];
  }
}

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
