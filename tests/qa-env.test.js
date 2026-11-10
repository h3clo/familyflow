import test from 'node:test';
import assert from 'node:assert/strict';
import { readQaEnv, assertQaSafeKey } from '../qa/env.mjs';
import { makeRunId, qaLabel, isQaLabel } from '../qa/markers.mjs';

test('readQaEnv skips clearly when secrets missing', () => {
  const qa = readQaEnv({});
  assert.equal(qa.configured, false);
  assert.match(qa.skipReason, /실제 서버 미검증/);
});

test('readQaEnv rejects service_role publishable slot', () => {
  const qa = readQaEnv({
    SUPABASE_QA_URL: 'https://example.supabase.co',
    SUPABASE_QA_PUBLISHABLE_KEY: 'service_role_secret',
    SUPABASE_QA_USER_A_EMAIL: 'a@example.com',
    SUPABASE_QA_USER_A_PASSWORD: 'x',
  });
  assert.equal(qa.configured, false);
  assert.equal(qa.rejectedSecret, true);
});

test('assertQaSafeKey throws on service_role', () => {
  assert.throws(() => assertQaSafeKey('service_role_xxx'));
});

test('QA markers are stable for cleanup filters', () => {
  const id = makeRunId();
  const label = qaLabel(id, '휴지');
  assert.equal(isQaLabel(label, id), true);
  assert.equal(isQaLabel('일반 휴지', id), false);
});
