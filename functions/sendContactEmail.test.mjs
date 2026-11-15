/**
 * Unit tests for sendContactEmail security behavior.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAllowedOrigins, isOriginAllowed } from './corsAllowedOrigins.js';
import {
  CONTACT_HONEYPOT_FIELD,
  CONTACT_RATE_LIMITS,
  SEND_CONTACT_GENERIC_ERROR,
  buildContactNotificationText,
  escapePlainTextUserContent,
  getRateLimitBuckets,
  isEnforceContactAppCheckEnabled,
  normalizeContactEmail,
  resolveContactRecipient,
  hashIpForRateLimit,
} from './sendContactEmailLogic.js';
import { handleSendContactEmailRequest } from './sendContactEmailHandler.js';

test('escapePlainTextUserContent neutralizes angle brackets in plain text', () => {
  assert.equal(escapePlainTextUserContent('<script>'), '\uFF1Cscript\uFF1E');
  const body = buildContactNotificationText({
    contactType: 'general',
    name: '<b>',
    email: 'a@b.com',
    subject: '',
    message: '<img onerror=alert(1)>',
  });
  assert.match(body, /\uFF1Cimg onerror=alert\(1\)\uFF1E/);
  assert.doesNotMatch(body, /<img/);
});

test('normalizeContactEmail rejects CR/LF and multiple addresses', () => {
  assert.equal(normalizeContactEmail('good@example.com'), 'good@example.com');
  assert.equal(normalizeContactEmail('a@b.com\r\nBcc: evil@evil.com'), null);
  assert.equal(normalizeContactEmail('a@b.com, c@d.com'), null);
});

test('resolveContactRecipient fails closed on empty or invalid', () => {
  assert.equal(resolveContactRecipient(''), null);
  assert.equal(resolveContactRecipient('   '), null);
  assert.equal(resolveContactRecipient('not-an-email'), null);
  assert.equal(resolveContactRecipient('inbox@stealorreveal.com'), 'inbox@stealorreveal.com');
});

test('CORS rejects a foreign origin', async () => {
  const origins = buildAllowedOrigins({
    allowedOriginsCsv: 'https://stealorreveal.com',
    nodeEnv: 'production',
  });
  assert.equal(isOriginAllowed('https://evil.example', origins), false);

  const deps = makeContactDeps({ contactRecipient: 'inbox@stealorreveal.com' });
  const result = await handleSendContactEmailRequest(
    {
      method: 'POST',
      headers: { origin: 'https://evil.example' },
      body: { email: 'user@example.com', message: 'Hello' },
    },
    deps,
  );
  assert.equal(result.status, 403);
  assert.equal(result.corsOrigin, null);
  assert.equal(result.body.error, SEND_CONTACT_GENERIC_ERROR);
});

test('missing CONTACT_EMAIL config fails closed', async () => {
  const deps = makeContactDeps({ contactRecipient: '' });
  const result = await handleSendContactEmailRequest(
    {
      method: 'POST',
      headers: { origin: 'https://stealorreveal.com' },
      body: { email: 'user@example.com', message: 'Hello' },
    },
    deps,
  );
  assert.equal(result.status, 500);
  assert.equal(deps.sendCalls.length, 0);
});

test('rate limit trips for IP', async () => {
  const buckets = getRateLimitBuckets();
  const ipHash = hashIpForRateLimit('9.9.9.9');
  const deps = makeContactDeps({
    contactRecipient: 'inbox@stealorreveal.com',
    seed: {
      [`_rateLimits/contactFormIp/records/${ipHash}`]: {
        hourBucket: buckets.hourBucket,
        hourCount: CONTACT_RATE_LIMITS.ipPerHour,
        dayBucket: buckets.dayBucket,
        dayCount: 1,
      },
    },
  });
  const result = await handleSendContactEmailRequest(
    {
      method: 'POST',
      headers: { origin: 'https://stealorreveal.com', 'x-forwarded-for': '9.9.9.9' },
      body: { email: 'user@example.com', message: 'Hello' },
      ip: '9.9.9.9',
    },
    deps,
  );
  assert.equal(result.status, 429);
  assert.equal(deps.sendCalls.length, 0);
});

test('handler sends only internal notification with reply-to, no confirmation', async () => {
  const deps = makeContactDeps({ contactRecipient: 'inbox@stealorreveal.com' });
  const result = await handleSendContactEmailRequest(
    {
      method: 'POST',
      headers: { origin: 'https://stealorreveal.com' },
      body: {
        email: 'user@example.com',
        message: 'Need help',
        name: 'Sam',
        type: 'general',
        [CONTACT_HONEYPOT_FIELD]: '',
      },
    },
    deps,
  );
  assert.equal(result.status, 200);
  assert.equal(deps.sendCalls.length, 1);
  const send = deps.sendCalls[0];
  assert.equal(send.to, 'inbox@stealorreveal.com');
  assert.equal(send.replyTo, 'user@example.com');
  assert.ok(send.text);
  assert.equal(send.html, undefined);
});

test('App Check flag defaults off', () => {
  assert.equal(isEnforceContactAppCheckEnabled('false'), false);
  assert.equal(isEnforceContactAppCheckEnabled(undefined), false);
  assert.equal(isEnforceContactAppCheckEnabled('true'), true);
});

function makeContactDeps(overrides = {}) {
  const store = new Map();
  const sendCalls = [];

  const ref = (path) => ({
    _path: path,
    get: async () => {
      const data = store.get(path);
      return { exists: data != null, data: () => data };
    },
  });

  function makeCollection(pathPrefix) {
    return {
      doc(id) {
        const docPath = `${pathPrefix}/${id}`;
        return {
          ...ref(docPath),
          collection(subName) {
            return makeCollection(`${docPath}/${subName}`);
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

  for (const [path, value] of Object.entries(overrides.seed ?? {})) {
    store.set(path, value);
  }

  const ipOverride = overrides.ipHash ?? 'abc';

  return {
    db,
    getResend: () => ({
      emails: {
        send: async (payload) => {
          sendCalls.push(payload);
          return { data: { id: 'msg-1' }, error: null };
        },
      },
    }),
    getFromEmail: () => 'noreply@example.com',
    getContactRecipient: () => overrides.contactRecipient ?? 'inbox@stealorreveal.com',
    getEnforceAppCheck: () => 'false',
    getAllowedOrigins: () =>
      buildAllowedOrigins({
        allowedOriginsCsv: 'https://stealorreveal.com',
        nodeEnv: 'production',
      }),
    appCheck: null,
    sendCalls,
    _hashIp: ipOverride,
  };
}