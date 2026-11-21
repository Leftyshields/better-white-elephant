/**
 * Minimal in-memory Firestore for server unit tests: nested collection/doc paths, get/set/update/
 * delete, and runTransaction (reads see committed data; writes apply together at commit, and a
 * read after a write throws, as in the Admin SDK).
 */
export function createFakeFirestore(seed = {}) {
  const docs = new Map(Object.entries(seed).map(([k, v]) => [k, structuredClone(v)]));

  function snapshot(ref) {
    const data = docs.get(ref.path);
    return { exists: data !== undefined, id: ref.id, ref, data: () => (data === undefined ? undefined : structuredClone(data)) };
  }

  function docRef(path) {
    const id = path.split('/').pop();
    return {
      path,
      id,
      collection: (name) => collectionRef(`${path}/${name}`),
      get: async () => snapshot(docRef(path)),
      set: async (data) => { docs.set(path, structuredClone(data)); },
      update: async (patch) => {
        if (!docs.has(path)) throw Object.assign(new Error('not found'), { code: 5 });
        docs.set(path, { ...docs.get(path), ...structuredClone(patch) });
      },
      delete: async () => { docs.delete(path); },
    };
  }

  function collectionRef(path) {
    return { path, doc: (id) => docRef(`${path}/${id}`) };
  }

  return {
    docs,
    reads: 0,
    collection: (name) => collectionRef(name),
    async runTransaction(fn) {
      const writes = [];
      const tx = {
        get: async (ref) => {
          if (writes.length) throw new Error('Firestore transactions require all reads before writes');
          this.reads += 1;
          return snapshot(ref);
        },
        set: (ref, data) => { writes.push(() => docs.set(ref.path, structuredClone(data))); },
        update: (ref, patch) => {
          writes.push(() => {
            if (!docs.has(ref.path)) throw new Error(`update of missing doc ${ref.path}`);
            docs.set(ref.path, { ...docs.get(ref.path), ...structuredClone(patch) });
          });
        },
        delete: (ref) => { writes.push(() => docs.delete(ref.path)); },
      };
      const result = await fn(tx);
      for (const w of writes) w();
      return result;
    },
  };
}
