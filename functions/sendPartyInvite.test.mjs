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
  buildPartyInviteLink,
  generateInviteToken,
  isValidInviteToken,
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
import { pickDisplayName } from './lib/display-names.js';
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
    "We couldn't send that invite right now. Try again later.",
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
  assert.doesNotMatch(html, /White Elephant gift exchange party/);
});

test('invite email uses named intro when host has a usable name', () => {
  const html = buildInviteEmailHtml({
    hostUid: 'uid-1',
    hostDisplayName: 'Sam',
    partyTitle: 'Holiday',
    partyDateLabel: 'Soon',
    inviteLink: 'https://example.com/party/1',
  });
  assert.match(html, /Sam invited you to a Steal or Reveal game/);
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

test('sanitizeEmailSubjectPart strips Unicode line and paragraph separators', () => {
  assert.equal(sanitizeEmailSubjectPart('a\u2028b\u2029c\u0085d'), 'abcd');
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

test('resolveClientUrl rejects userinfo in emulator', () => {
  assert.equal(
    resolveClientUrl('https://user:pass@localhost:5173', null, { functionsEmulator: true }),
    'https://stealorreveal.com',
  );
  assert.equal(
    resolveClientUrl(null, 'https://evil:secret@127.0.0.1:5000/party', {
      functionsEmulator: true,
    }),
    'https://stealorreveal.com',
  );
});

test('resolveClientUrl rejects non-https origins except local http in emulator', () => {
  assert.equal(
    resolveClientUrl('http://example.com', null, { functionsEmulator: true }),
    'https://stealorreveal.com',
  );
  assert.equal(
    resolveClientUrl('ftp://localhost:5173', null, { functionsEmulator: true }),
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

const googleToken = (uid) => ({ uid, firebase: { sign_in_provider: 'google.com' } });

test('assertCallerIsPartyHost requires matching adminId and a Google sign-in', () => {
  assert.equal(assertCallerIsPartyHost({ adminId: 'host' }, googleToken('host')), true);
  assert.equal(assertCallerIsPartyHost({ adminId: 'host' }, googleToken('other')), false);
  for (const provider of ['anonymous', 'password', 'emailLink', 'custom']) {
    assert.equal(
      assertCallerIsPartyHost(
        { adminId: 'host' },
        { uid: 'host', email: 'h@example.com', email_verified: true, firebase: { sign_in_provider: provider } },
      ),
      false,
      provider,
    );
  }
  assert.equal(assertCallerIsPartyHost({ adminId: 'host' }, { uid: 'host' }), false);
  assert.equal(assertCallerIsPartyHost({ adminId: 'host' }, 'host'), false);
  assert.equal(assertCallerIsPartyHost(null, googleToken('host')), false);
});

test('invite tokens are 128-bit hex and ride in the link fragment', () => {
  const a = generateInviteToken();
  const b = generateInviteToken();
  assert.match(a, /^[0-9a-f]{32}$/);
  assert.notEqual(a, b);
  assert.equal(isValidInviteToken(a), true);
  assert.equal(isValidInviteToken('nope'), false);
  assert.equal(
    buildPartyInviteLink('https://stealorreveal.com', 'p1', a),
    `https://stealorreveal.com/party/p1#t=${a}`,
  );
  assert.equal(
    buildPartyInviteLink('https://stealorreveal.com', 'p1', 'bad'),
    'https://stealorreveal.com/party/p1',
  );
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
        return {
          uid: overrides.hostUid ?? 'host-uid',
          firebase: { sign_in_provider: overrides.provider ?? 'google.com' },
        };
      }
      throw new Error('invalid');
    },
  };

  const sentEmails = [];
  const getResend = () => ({
    emails: {
      send: async (message) => {
        sentEmails.push(message);
        return { data: { id: 'msg-1' }, error: null };
      },
    },
  });

  return {
    db,
    auth,
    getResend,
    getFromEmail: () => 'noreply@example.com',
    store,
    sentEmails,
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

test('handler returns Copywriter server error when Resend fails', async () => {
  const deps = makeMockDeps({
    hostUid: 'host-uid',
    seed: {
      'parties/p1': { adminId: 'host-uid', title: 'Holiday' },
      'users/host-uid': { displayName: 'Sam', email: 'host@example.com' },
    },
  });
  deps.getResend = () => ({
    emails: {
      send: async () => ({
        data: null,
        error: { statusCode: 403, name: 'validation_error' },
      }),
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
  assert.equal(result.status, 500);
  assert.equal(result.body.error, SEND_PARTY_INVITE_ERRORS.sendInviteServerError);
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

test('handler rejects a party owner who is not signed in with Google', async () => {
  for (const provider of ['anonymous', 'password', 'emailLink']) {
    const deps = makeMockDeps({
      hostUid: 'host-uid',
      provider,
      seed: { 'parties/p1': { adminId: 'host-uid', title: 'Party' } },
    });
    const result = await handleSendPartyInviteRequest(
      {
        body: { email: 'guest@example.com', partyId: 'p1' },
        headers: { authorization: 'Bearer valid-host' },
        get: () => undefined,
      },
      deps,
    );
    assert.equal(result.status, 403, provider);
    assert.equal(result.body.message, SEND_PARTY_INVITE_ERRORS.notHost);
    assert.equal(deps.sentEmails.length, 0);
  }
});

test('invite email link carries the stored party token in the fragment', async () => {
  const stored = 'aaaaaaaaaaaaaaaabbbbbbbbbbbbbbbb';
  const deps = makeMockDeps({
    hostUid: 'host-uid',
    seed: {
      'parties/p1': { adminId: 'host-uid', title: 'Holiday' },
      'parties/p1/private/invite': { token: stored },
      'users/host-uid': { displayName: 'Sam' },
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
  assert.equal(result.status, 200);
  assert.equal(deps.sentEmails.length, 1);
  assert.ok(deps.sentEmails[0].html.includes(`https://stealorreveal.com/party/p1#t=${stored}`));
  assert.equal(deps.store.get('parties/p1/private/invite').token, stored);
});

test('invite email mints and stores a token for a party made before tokens', async () => {
  const deps = makeMockDeps({
    hostUid: 'host-uid',
    seed: {
      'parties/p1': { adminId: 'host-uid', title: 'Holiday' },
      'users/host-uid': { displayName: 'Sam' },
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
  assert.equal(result.status, 200);
  const minted = deps.store.get('parties/p1/private/invite')?.token;
  assert.match(minted, /^[0-9a-f]{32}$/);
  assert.ok(deps.sentEmails[0].html.includes(`/party/p1#t=${minted}`));
});
