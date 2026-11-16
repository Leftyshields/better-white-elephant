/**
 * anonymousUserCleanup: unlinked anonymous Auth users older than 30 days, plus their seat, join proof
 * and gift docs in ENDED parties past the 30-day post-game window. No emulator needed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isPastAnonRetention,
  isUnlinkedAnonymousUser,
  planAnonymousUserCleanup,
  runAnonymousUserCleanup,
} from './anonymousUserCleanup.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 15);
const daysAgo = (n) => new Date(NOW - n * DAY);
const ts = (date) => ({ toMillis: () => date.getTime() });

function anonUser(uid, ageDays, extra = {}) {
  return {
    uid,
    providerData: [],
    metadata: { creationTime: daysAgo(ageDays).toUTCString() },
    ...extra,
  };
}

function makeFakes({ users, parties, seats, gifts, pageSize = 2, failCommit = false }) {
  const deletedPaths = [];
  const deletedUids = [];
  let authUsers = [...users];

  const auth = {
    async listUsers(max, pageToken) {
      const start = pageToken ? Number(pageToken) : 0;
      const page = authUsers.slice(start, start + Math.min(max, pageSize));
      const next = start + page.length;
      return { users: page, pageToken: next < authUsers.length ? String(next) : undefined };
    },
    async deleteUsers(uids) {
      deletedUids.push(...uids);
      authUsers = authUsers.filter((u) => !uids.includes(u.uid));
      return { successCount: uids.length, failureCount: 0 };
    },
  };

  const seatDocs = seats.map(([partyId, uid]) => ({
    id: uid,
    ref: { parent: { parent: { id: partyId, parent: { id: 'parties' } } } },
  }));

  function seatQuery(offset = 0, lim = Infinity) {
    return {
      limit: (n) => seatQuery(offset, n),
      startAfter: (docRef) => seatQuery(seatDocs.indexOf(docRef) + 1, lim),
      get: async () => ({ docs: seatDocs.slice(offset, offset + lim) }),
    };
  }

  const partyRef = (id) => ({
    id,
    path: `parties/${id}`,
    collection: (sub) => ({ doc: (docId) => ({ path: `parties/${id}/${sub}/${docId}` }) }),
  });

  const db = {
    collectionGroup: (name) => {
      assert.equal(name, 'participants');
      return { select: () => seatQuery() };
    },
    collection(name) {
      if (name === 'parties') {
        return { doc: partyRef };
      }
      assert.equal(name, 'gifts');
      return {
        where: (field, op, uid) => ({
          get: async () => ({
            docs: Object.entries(gifts)
              .filter(([, g]) => g.submitterId === uid)
              .map(([id, g]) => ({ ref: { path: `gifts/${id}` }, data: () => g })),
          }),
        }),
      };
    },
    async getAll(...refs) {
      return refs.map((ref) => ({
        id: ref.id,
        exists: parties[ref.id] != null,
        data: () => parties[ref.id],
      }));
    },
    batch() {
      const pending = [];
      return {
        delete: (ref) => pending.push(ref.path),
        update: () => {},
        commit: async () => {
          if (failCommit) throw Object.assign(new Error('boom'), { code: 'unavailable' });
          deletedPaths.push(...pending);
        },
      };
    },
  };

  const logs = [];
  const logger = { log: (...args) => logs.push(args) };
  return { db, auth, deletedPaths, deletedUids, logs, logger };
}

const PARTIES = {
  endedOld: { status: 'ENDED', endedAt: ts(daysAgo(45)) },
  endedRecent: { status: 'ENDED', endedAt: ts(daysAgo(5)) },
  active: { status: 'ACTIVE' },
  lobby: { status: 'LOBBY' },
  cancelled: { status: 'CANCELLED', updatedAt: ts(daysAgo(60)) },
};

test('isUnlinkedAnonymousUser: no providers, email or phone', () => {
  assert.equal(isUnlinkedAnonymousUser(anonUser('a', 40)), true);
  assert.equal(
    isUnlinkedAnonymousUser(anonUser('g', 40, { providerData: [{ providerId: 'google.com' }] })),
    false,
  );
  assert.equal(isUnlinkedAnonymousUser(anonUser('e', 40, { email: 'x@example.com' })), false);
  assert.equal(isUnlinkedAnonymousUser(anonUser('p', 40, { phoneNumber: '+15555550100' })), false);
  assert.equal(isUnlinkedAnonymousUser({ uid: 'x' }), false);
});

test('isPastAnonRetention: strictly by creation time, 30 days', () => {
  assert.equal(isPastAnonRetention(anonUser('a', 31), NOW), true);
  assert.equal(isPastAnonRetention(anonUser('a', 30), NOW), true);
  assert.equal(isPastAnonRetention(anonUser('a', 29), NOW), false);
  assert.equal(isPastAnonRetention({ metadata: {} }, NOW), false);
});

test('planAnonymousUserCleanup keeps seats in open or recently ended parties', () => {
  const byId = new Map(Object.entries(PARTIES));
  assert.deepEqual(planAnonymousUserCleanup(['endedOld'], byId, NOW), {
    keepUser: false,
    endedPartyIds: ['endedOld'],
  });
  assert.equal(planAnonymousUserCleanup(['endedOld', 'active'], byId, NOW).keepUser, true);
  assert.equal(planAnonymousUserCleanup(['lobby'], byId, NOW).keepUser, true);
  assert.equal(planAnonymousUserCleanup(['endedRecent'], byId, NOW).keepUser, true);
  // CANCELLED or deleted parties neither keep the user nor get their docs deleted here.
  assert.deepEqual(planAnonymousUserCleanup(['cancelled', 'gone'], byId, NOW), {
    keepUser: false,
    endedPartyIds: [],
  });
});

test('deletes old anonymous users and only their ENDED-party docs; keeps everyone else', async () => {
  const fakes = makeFakes({
    users: [
      anonUser('anon-ended', 40),
      anonUser('anon-active', 40),
      anonUser('anon-recent', 40),
      anonUser('anon-young', 10),
      anonUser('anon-noparty', 40),
      anonUser('google-old', 400, { providerData: [{ providerId: 'google.com' }], email: 'g@example.com' }),
    ],
    parties: PARTIES,
    seats: [
      ['endedOld', 'anon-ended'],
      ['cancelled', 'anon-ended'],
      ['active', 'anon-active'],
      ['endedRecent', 'anon-recent'],
      ['endedOld', 'anon-young'],
      ['endedOld', 'google-old'],
    ],
    gifts: {
      g1: { partyId: 'endedOld', submitterId: 'anon-ended' },
      g2: { partyId: 'cancelled', submitterId: 'anon-ended' },
      g3: { partyId: 'active', submitterId: 'anon-active' },
      g4: { partyId: 'endedOld', submitterId: 'google-old' },
    },
  });

  const stats = await runAnonymousUserCleanup({ ...fakes, nowMs: NOW });

  assert.deepEqual(fakes.deletedUids.sort(), ['anon-ended', 'anon-noparty']);
  assert.deepEqual(fakes.deletedPaths.sort(), [
    'gifts/g1',
    'parties/endedOld/joinProofs/anon-ended',
    'parties/endedOld/participants/anon-ended',
  ]);
  assert.deepEqual(stats, {
    scannedUsers: 6,
    expiredAnonymousUsers: 4,
    keptForOpenOrRecentParty: 2,
    deletedDocs: 3,
    deletedUsers: 2,
    failedUserDeletes: 0,
  });
});

test('second run is a no-op (idempotent)', async () => {
  const fakes = makeFakes({
    users: [anonUser('anon-ended', 40)],
    parties: PARTIES,
    seats: [['endedOld', 'anon-ended']],
    gifts: {},
  });
  await runAnonymousUserCleanup({ ...fakes, nowMs: NOW });
  const second = await runAnonymousUserCleanup({ ...fakes, nowMs: NOW });
  assert.equal(second.expiredAnonymousUsers, 0);
  assert.equal(second.deletedUsers, 0);
  assert.deepEqual(fakes.deletedUids, ['anon-ended']);
});

test('a failed doc commit deletes no Auth users, so the next run retries everything', async () => {
  const fakes = makeFakes({
    users: [anonUser('anon-ended', 40)],
    parties: PARTIES,
    seats: [['endedOld', 'anon-ended']],
    gifts: {},
    failCommit: true,
  });
  await assert.rejects(runAnonymousUserCleanup({ ...fakes, nowMs: NOW }));
  assert.deepEqual(fakes.deletedUids, []);
});

test('logs counts only: no uids, emails or names', async () => {
  const fakes = makeFakes({
    users: [anonUser('anon-secret-uid', 40), anonUser('anon-young', 1)],
    parties: PARTIES,
    seats: [['endedOld', 'anon-secret-uid']],
    gifts: { g1: { partyId: 'endedOld', submitterId: 'anon-secret-uid' } },
  });
  await runAnonymousUserCleanup({ ...fakes, nowMs: NOW });
  assert.equal(fakes.logs.length, 1);
  const [label, stats] = fakes.logs[0];
  assert.equal(label, 'anonymousUserCleanup');
  for (const value of Object.values(stats)) {
    assert.equal(typeof value, 'number');
  }
  assert.doesNotMatch(JSON.stringify(fakes.logs), /anon-secret-uid|@/);
});

test('no candidates: no Firestore scans at all', async () => {
  const fakes = makeFakes({ users: [anonUser('anon-young', 3)], parties: PARTIES, seats: [], gifts: {} });
  fakes.db.collectionGroup = () => {
    throw new Error('should not scan participants');
  };
  const stats = await runAnonymousUserCleanup({ ...fakes, nowMs: NOW });
  assert.equal(stats.expiredAnonymousUsers, 0);
});
