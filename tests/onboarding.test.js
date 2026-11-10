import test from 'node:test';
import assert from 'node:assert/strict';
import {
  needsCloudAuthGate,
  parseSignupHouseholdName,
  chooseCloudBootstrapAction,
} from '../src/cloud/onboarding.js';

test('auth gate shows when cloud configured and logged out', () => {
  assert.equal(needsCloudAuthGate({ configured: true, user: null, deferAuth: false }), true);
  assert.equal(needsCloudAuthGate({ configured: true, user: { id: 'u' }, deferAuth: false }), false);
  assert.equal(needsCloudAuthGate({ configured: true, user: null, deferAuth: true }), false);
  assert.equal(needsCloudAuthGate({ configured: false, user: null, deferAuth: false }), false);
});

test('cloud bootstrap prefers push/pull without wiping the other side', () => {
  assert.equal(chooseCloudBootstrapAction({ localInventory: 0, localShopping: 0, cloudInventory: 0, cloudShopping: 0 }), 'empty');
  assert.equal(chooseCloudBootstrapAction({ localInventory: 2, localShopping: 0, cloudInventory: 0, cloudShopping: 0 }), 'push');
  assert.equal(chooseCloudBootstrapAction({ localInventory: 0, localShopping: 0, cloudInventory: 3, cloudShopping: 1 }), 'pull');
  assert.equal(chooseCloudBootstrapAction({ localInventory: 1, localShopping: 0, cloudInventory: 2, cloudShopping: 0 }), 'needs-preview');
});

test('signup household name is required and trimmed', () => {
  assert.equal(parseSignupHouseholdName('').ok, false);
  assert.equal(parseSignupHouseholdName('   ').ok, false);
  const ok = parseSignupHouseholdName('  우리집  ');
  assert.equal(ok.ok, true);
  assert.equal(ok.householdName, '우리집');
  assert.equal(ok.profileDisplayName, '관리자');
});
