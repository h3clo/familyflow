import test from 'node:test';
import assert from 'node:assert/strict';
import { needsCloudAuthGate, parseSignupHouseholdName } from '../src/cloud/onboarding.js';

test('auth gate shows when cloud configured and logged out', () => {
  assert.equal(needsCloudAuthGate({ configured: true, user: null, deferAuth: false }), true);
  assert.equal(needsCloudAuthGate({ configured: true, user: { id: 'u' }, deferAuth: false }), false);
  assert.equal(needsCloudAuthGate({ configured: true, user: null, deferAuth: true }), false);
  assert.equal(needsCloudAuthGate({ configured: false, user: null, deferAuth: false }), false);
});

test('signup household name is required and trimmed', () => {
  assert.equal(parseSignupHouseholdName('').ok, false);
  assert.equal(parseSignupHouseholdName('   ').ok, false);
  const ok = parseSignupHouseholdName('  우리집  ');
  assert.equal(ok.ok, true);
  assert.equal(ok.householdName, '우리집');
  assert.equal(ok.profileDisplayName, '관리자');
});
