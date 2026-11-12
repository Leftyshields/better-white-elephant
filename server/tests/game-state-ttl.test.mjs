import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REDIS_TTL_ENDED_SECONDS,
  REDIS_TTL_ACTIVE_SECONDS,
  clampEndedRedisKeyTtl,
  redisTtlSecondsForPartyStatus,
  resolveRedisTtlSeconds,
} from '../utils/redis-game-ttl.mjs';

test('redisTtlSecondsForPartyStatus: ENDED is 30 days (not 1 year)', () => {
  assert.equal(redisTtlSecondsForPartyStatus('ENDED'), REDIS_TTL_ENDED_SECONDS);
  assert.equal(REDIS_TTL_ENDED_SECONDS, 30 * 24 * 60 * 60);
  assert.notEqual(redisTtlSecondsForPartyStatus('ENDED'), 31536000);
});

test('redisTtlSecondsForPartyStatus: LOBBY and ACTIVE use long TTL', () => {
  assert.equal(redisTtlSecondsForPartyStatus('LOBBY'), REDIS_TTL_ACTIVE_SECONDS);
  assert.equal(redisTtlSecondsForPartyStatus('ACTIVE'), REDIS_TTL_ACTIVE_SECONDS);
  assert.equal(redisTtlSecondsForPartyStatus(undefined), REDIS_TTL_ACTIVE_SECONDS);
});

test('resolveRedisTtlSeconds: clamps legacy 1y/2y TTL on ENDED persist', () => {
  assert.equal(resolveRedisTtlSeconds('ENDED', null, 31536000), REDIS_TTL_ENDED_SECONDS);
  assert.equal(resolveRedisTtlSeconds('ACTIVE', 'ENDED', 63072000), REDIS_TTL_ENDED_SECONDS);
  assert.equal(resolveRedisTtlSeconds('ACTIVE', 'ACTIVE', null), REDIS_TTL_ACTIVE_SECONDS);
});

test('clampEndedRedisKeyTtl: refreshes Redis key when remaining TTL exceeds 30 days', async () => {
  const calls = [];
  const mockRedis = {
    async ttl() {
      return 31536000;
    },
    async setEx(key, ttl, payload) {
      calls.push({ key, ttl, payload });
    },
  };
  const payload = JSON.stringify({ phase: 'ENDED', partyId: 'p1' });
  const clamped = await clampEndedRedisKeyTtl(
    mockRedis,
    'game:p1',
    payload,
    'ENDED',
    'ENDED',
  );
  assert.equal(clamped, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].ttl, REDIS_TTL_ENDED_SECONDS);
  assert.equal(calls[0].payload, payload);
});

test('clampEndedRedisKeyTtl: no rewrite when TTL is already within 30 days', async () => {
  let writeCount = 0;
  const mockRedis = {
    async ttl() {
      return REDIS_TTL_ENDED_SECONDS;
    },
    async setEx() {
      writeCount += 1;
    },
  };
  const clamped = await clampEndedRedisKeyTtl(
    mockRedis,
    'game:p1',
    '{}',
    'ENDED',
    'ENDED',
  );
  assert.equal(clamped, false);
  assert.equal(writeCount, 0);
});

test('clampEndedRedisKeyTtl: skips non-ENDED games', async () => {
  let writeCount = 0;
  const mockRedis = {
    async ttl() {
      return 63072000;
    },
    async setEx() {
      writeCount += 1;
    },
  };
  const clamped = await clampEndedRedisKeyTtl(
    mockRedis,
    'game:p1',
    '{}',
    'ACTIVE',
    'ACTIVE',
  );
  assert.equal(clamped, false);
  assert.equal(writeCount, 0);
});
