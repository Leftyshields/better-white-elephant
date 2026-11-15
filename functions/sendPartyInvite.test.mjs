/**
 * Unit tests for sendPartyInvite security logic and handler branches.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PARTY_INVITE_INTRO_ANONYMOUS,
  PARTY_INVITE_RATE_LIMITS,
  SEND_PARTY_INVITE_ERRORS,
  assertCallerIsPartyHost,
  buildGiftSubmitterNotifyHtml,
  buildInviteEmailHtml,
  escapeHtml,
  inviteEmailSubject,
  resolveClientUrl,
  sanitizeEmailSubjectPart,
  INVITE_EMAIL_SUBJECT_MAX_LENGTH,
  getRateLimitBuckets,
  hostDisplayNameForInvite,
  nextRateLimitState,
  normalizeInviteEmail,
  pendingInviteBlocksSend,
  recipientIsExistingParticipant,
} from './sendPartyInviteLogic.js';
import { pickDisplayName } from './displayName.js';
import { handleSendPartyInviteRequest } from './sendPartyInviteHandler.js';

test('buildGiftSubmitterNotifyHtml escapes winner display name and address body', () => {
  const html = buildGiftSubmitterNotifyHtml({
    winnerDisplayName: '<img src=x onerror=alert(1)>',
    shippingAddressJson: '{"line1":"</pre><script>"}',
  });
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;\/pre&gt;&lt;script&gt;/);
});

test('copywriter strings for invalidPartyId, missingFields, and server error', () => {
  assert.equal(
    SEND_PARTY_INVITE_ERRORS.missingFields,
    'Enter an email address to send an invite.',
  );
  assert.equal(
    SEND_PARTY_INVITE_ERRORS.invalidPartyId,
    "We couldn't find this party. Refresh the page and try again.",
  );
  assert.equal(
    SEND_PARTY_INVITE_ERRORS.invalidPartyId,
    SEND_PARTY_INVITE_ERRORS.partyNotFound,
  );
  assert.equal(
    SEND_PARTY_INVITE_ERRORS.sendInviteServerError,
    "We couldn't send that invite. Try again in a moment.",
  );
});

test('invite email uses anonymous intro when host has no usable name', () => {
  const uid = 'abcdefghijklmnop';
  const hostDisplayName = hostDisplayNameForInvite(uid, {
    email: 'leaky@example.com',
    displayName: 'leaky',
  });
  const html = buildInviteEmailHtml({
    hostUid: uid,
    hostDisplayName,
    partyTitle: 'Holiday',
    partyDateLabel: 'Soon',
    inviteLink: 'https://example.com/party/1',
  });
  assert.match(html, new RegExp(escapeHtml(PARTY_INVITE_INTRO_ANONYMOUS)));
  assert.doesNotMatch(html, /has invited you to a White Elephant gift exchange party/);
});

test('invite email uses named intro when host has a usable name', () => {
  const html = buildInviteEmailHtml({
    hostUid: 'uid-1',
    hostDisplayName: 'Sam',
    partyTitle: 'Holiday',
    partyDateLabel: 'Soon',
    inviteLink: 'https://example.com/party/1',
  });
  assert.match(html, /Sam has invited you to a White Elephant gift exchange party/);
});

test('escapeHtml neutralizes HTML injection in email body', () => {
  const html = buildInviteEmailHtml({
    hostUid: 'host-1',
    hostDisplayName: '<script>x</script>',
    partyTitle: 'Fun & <Games>',
    partyDateLabel: '1/1/26',
    inviteLink: 'https://example.com/party/1" onclick="evil"',
  });
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /Fun &amp; &lt;Games&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

test('hostName and partyTitle are HTML-escaped in invite email body', () => {
  const html = buildInviteEmailHtml({
    hostUid: 'host-2',
    hostDisplayName: '<b>Host</b>',
    partyTitle: '"><img onerror=alert(1)>',
    partyDateLabel: 'Soon',
    inviteLink: 'https://example.com/party/1',
  });
  assert.match(html, /&lt;b&gt;Host&lt;\/b&gt;/);
  assert.match(html, /&quot;&gt;&lt;img onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<b>Host<\/b>/);
  assert.doesNotMatch(html, /<img onerror/);
});

test('inviteEmailSubject strips markup from party title', () => {
  assert.equal(
    inviteEmailSubject('Holiday <script>', 'Host'),
    "You're invited to Holiday script!",
  );
});

test('inviteEmailSubject strips CRLF injection from party title and host name', () => {
  const subject = inviteEmailSubject(
    "Party\r\nBcc: evil@example.com",
    "Host\r\nCc: spam@example.com",
  );
  assert.doesNotMatch(subject, /\r/);
  assert.doesNotMatch(subject, /\n/);
  assert.match(subject, /PartyBcc: evil@example.com/);
});

test('inviteEmailSubject caps total length', () => {
  const longTitle = 'A'.repeat(200);
  const subject = inviteEmailSubject(longTitle, 'Host');
  assert.ok(subject.length <= INVITE_EMAIL_SUBJECT_MAX_LENGTH);
  assert.match(subject, /\.\.\.!/);
});

test('sanitizeEmailSubjectPart removes control characters', () => {
  assert.equal(sanitizeEmailSubjectPart('a\u0000b'), 'ab');
});

test('resolveClientUrl uses production origin outside emulator', () => {
  assert.equal(
    resolveClientUrl('https://localhost.attacker.com', null, {
      functionsEmulator: false,
    }),
    'https://stealorreveal.com',
  );
  assert.equal(
    resolveClientUrl('https://evil.com', 'https://evil.com', {
      functionsEmulator: false,
    }),
    'https://stealorreveal.com',
  );
});

test('resolveClientUrl allows localhost only in emulator', () => {
  assert.equal(
    resolveClientUrl('http://localhost:5173', null, { functionsEmulator: true }),
    'http://localhost:5173',
  );
  assert.equal(
    resolveClientUrl(null, 'http://127.0.0.1:5000/party', { functionsEmulator: true }),
    'http://127.0.0.1:5000',
  );
  assert.equal(
    resolveClientUrl('https://localhost.attacker.com', null, {
      functionsEmulator: true,
    }),
    'https://stealorreveal.com',
  );
});

test('pickDisplayName skips email-like display names', () => {
  assert.equal(
    pickDisplayName('uid-1', 'host@evil.com', 'Real Name'),
    'Real Name',
  );
  assert.equal(hostDisplayNameForInvite('uid-1', { displayName: 'a@b.co', name: 'Host' }), 'Host');
  assert.equal(
    hostDisplayNameForInvite('uid-2', {
      email: 'secret@example.com',
      displayName: 'secret',
    }),
    'Player uid-2',
  );
});

test('normalizeInviteEmail rejects invalid addresses', () => {
  assert.equal(normalizeInviteEmail('  Host@Example.COM '), 'host@example.com');
  assert.equal(normalizeInviteEmail('not-an-email'), null);
});

test('assertCallerIsPartyHost requires matching adminId', () => {
  assert.equal(assertCallerIsPartyHost({ adminId: 'host' }, 'host'), true);
  assert.equal(assertCallerIsPartyHost({ adminId: 'host' }, 'other'), false);
});

test('pendingInviteBlocksSend only blocks ACCEPTED', () => {
  assert.equal(pendingInviteBlocksSend({ status: 'ACCEPTED' }), true);
  assert.equal(pendingInviteBlocksSend({ status: 'PENDING' }), false);
  assert.equal(pendingInviteBlocksSend(null), false);
});

test('recipientIsExistingParticipant matches normalized email set', () => {
  const set = new Set(['alice@example.com']);
  assert.equal(recipientIsExistingParticipant('alice@example.com', set), true);
  assert.equal(recipientIsExistingParticipant('bob@example.com', set), false);
});

test('rate limit: host hour bucket blocks at limit', () => {
  const buckets = getRateLimitBuckets(0);
  const limits = { perHour: 2, perDay: 100 };
  let state = { hourBucket: buckets.hourBucket, hourCount: 0, dayBucket: buckets.dayBucket, dayCount: 0 };
  state = nextRateLimitState(state, buckets, limits);
  assert.equal(state.allowed, true);
  state = { ...state, hourCount: state.hourCount, dayCount: state.dayCount };
  state = nextRateLimitState(state, buckets, limits);
  assert.equal(state.allowed, true);
  state = { hourBucket: buckets.hourBucket, hourCount: 2, dayBucket: buckets.dayBucket, dayCount: 2 };
  const blocked = nextRateLimitState(state, buckets, limits);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, 'hour');
});

test('documented rate limits are defined', () => {
  assert.equal(PARTY_INVITE_RATE_LIMITS.hostPerHour, 50);
  assert.equal(PARTY_INVITE_RATE_LIMITS.hostPerDay, 200);
  assert.equal(PARTY_INVITE_RATE_LIMITS.recipientPerHour, 10);
  assert.equal(PARTY_INVITE_RATE_LIMITS.recipientPerDay, 25);
});

function makeMockDeps(overrides = {}) {
  const store = new Map();

  function ref(path) {
    return {
      _path: path,
      get: async () => {
        const data = store.get(path);
        return { exists: data != null, data: () => data };
      },
    };
  }

  function makeCollection(pathPrefix) {
    return {
      async get() {
        const docs = [];
        const needle = `${pathPrefix}/`;
        for (const [key, data] of store.entries()) {
          if (key.startsWith(needle) && key.slice(needle.length).indexOf('/') === -1) {
            docs.push({
              id: key.slice(needle.length),
              data: () => data,
            });
          }
        }
        return { docs };
      },
      doc(id) {
        const docPath = `${pathPrefix}/${id}`;
        return {
          ...ref(docPath),
          get: async () => {
            const data = store.get(docPath);
            return { exists: data != null, data: () => data };
          },
          collection(subName) {
            return makeCollection(`${docPath}/${subName}`);
          },
        };
      },
      where(field, op, value) {
        return {
          limit() {
            return {
              get: async () => {
                if (pathPrefix !== 'users' || field !== 'email' || op !== '==') {
                  return { docs: [] };
                }
                const docs = [];
                for (const [key, data] of store.entries()) {
                  if (key.startsWith('users/') && data?.email === value) {
                    docs.push({
                      id: key.slice('users/'.length),
                      data: () => data,
                    });
                  }
                }
                return { docs };
              },
            };
          },
        };
      },
    };
  }

  const transaction = {
    async get(docRef) {
      return docRef.get();
    },
    set(docRef, data) {
      const existing = store.get(docRef._path) ?? {};
      store.set(docRef._path, { ...existing, ...data });
    },
  };

  const db = {
    collection(name) {
      return makeCollection(name);
    },
    runTransaction(fn) {
      return fn(transaction);
    },
  };

  const seed = overrides.seed ?? {};
  for (const [path, value] of Object.entries(seed)) {
    store.set(path, value);
  }

  const auth = {
    verifyIdToken: async (token) => {
      if (token === 'valid-host') {
        return { uid: overrides.hostUid ?? 'host-uid' };
      }
      throw new Error('invalid');
    },
  };

  const getResend = () => ({
    emails: {
      send: async () => ({ data: { id: 'msg-1' }, error: null }),
    },
  });

  return {
    db,
    auth,
    getResend,
    getFromEmail: () => 'noreply@example.com',
    store,
  };
}

test('handler rejects invalid auth token', async () => {
  const deps = makeMockDeps({
    seed: { 'parties/p1': { adminId: 'host-uid', title: 'Party' } },
  });
  const result = await handleSendPartyInviteRequest(
    {
      body: { email: 'a@b.com', partyId: 'p1' },
      headers: { authorization: 'Bearer bad-token' },
    },
    deps,
  );
  assert.equal(result.status, 401);
  assert.equal(result.body.message, SEND_PARTY_INVITE_ERRORS.invalidAuth);
});

test('handler rejects missing auth', async () => {
  const deps = makeMockDeps();
  const result = await handleSendPartyInviteRequest(
    { body: { email: 'a@b.com', partyId: 'p1' }, headers: {} },
    deps,
  );
  assert.equal(result.status, 401);
  assert.equal(result.body.message, SEND_PARTY_INVITE_ERRORS.missingAuth);
});

test('handler rejects non-host', async () => {
  const deps = makeMockDeps({
    hostUid: 'other-uid',
    seed: { 'parties/p1': { adminId: 'host-uid', title: 'Party' } },
  });
  const result = await handleSendPartyInviteRequest(
    {
      body: { email: 'guest@example.com', partyId: 'p1' },
      headers: { authorization: 'Bearer valid-host' },
    },
    deps,
  );
  assert.equal(result.status, 403);
  assert.equal(result.body.message, SEND_PARTY_INVITE_ERRORS.notHost);
});

test('handler rejects ACCEPTED pending invite', async () => {
  const deps = makeMockDeps({
    hostUid: 'host-uid',
    seed: {
      'parties/p1': { adminId: 'host-uid', title: 'Party' },
      'parties/p1/pendingInvites/guest_example_com': {
        status: 'ACCEPTED',
        email: 'guest@example.com',
      },
    },
  });
  const result = await handleSendPartyInviteRequest(
    {
      body: { email: 'guest@example.com', partyId: 'p1' },
      headers: { authorization: 'Bearer valid-host' },
    },
    deps,
  );
  assert.equal(result.status, 409);
  assert.equal(result.body.error, SEND_PARTY_INVITE_ERRORS.inviteAccepted);
});

test('handler rejects existing participant by email', async () => {
  const deps = makeMockDeps({
    hostUid: 'host-uid',
    seed: {
      'parties/p1': { adminId: 'host-uid', title: 'Party' },
      'parties/p1/participants/user-1': { status: 'GOING' },
      'users/user-1': { email: 'guest@example.com', displayName: 'Guest' },
    },
  });
  const result = await handleSendPartyInviteRequest(
    {
      body: { email: 'guest@example.com', partyId: 'p1' },
      headers: { authorization: 'Bearer valid-host' },
      get: () => undefined,
    },
    deps,
  );
  assert.equal(result.status, 409);
  assert.equal(result.body.error, SEND_PARTY_INVITE_ERRORS.alreadyParticipant);
});

test('handler rejects host hourly rate limit', async () => {
  const buckets = getRateLimitBuckets();
  const deps = makeMockDeps({
    hostUid: 'host-uid',
    seed: {
      'parties/p1': { adminId: 'host-uid', title: 'Holiday' },
      'users/host-uid': { displayName: 'Sam' },
      '_rateLimits/partyInviteHosts/records/host-uid': {
        hourBucket: buckets.hourBucket,
        hourCount: PARTY_INVITE_RATE_LIMITS.hostPerHour,
        dayBucket: buckets.dayBucket,
        dayCount: 1,
      },
    },
  });
  const result = await handleSendPartyInviteRequest(
    {
      body: { email: 'guest@example.com', partyId: 'p1' },
      headers: { authorization: 'Bearer valid-host' },
      get: () => undefined,
    },
    deps,
  );
  assert.equal(result.status, 429);
  assert.equal(result.body.message, SEND_PARTY_INVITE_ERRORS.rateLimitHostHour);
});

test('handler happy path sends email', async () => {
  const deps = makeMockDeps({
    hostUid: 'host-uid',
    seed: {
      'parties/p1': { adminId: 'host-uid', title: 'Holiday' },
      'users/host-uid': { displayName: 'Sam', email: 'host@example.com' },
    },
  });
  const result = await handleSendPartyInviteRequest(
    {
      body: { email: 'guest@example.com', partyId: 'p1' },
      headers: { authorization: 'Bearer valid-host' },
      get: () => 'https://stealorreveal.com',
    },
    deps,
  );
  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
});

test('escapeHtml standalone', () => {
  assert.equal(escapeHtml(`a'b"c<d>`), 'a&#39;b&quot;c&lt;d&gt;');
});