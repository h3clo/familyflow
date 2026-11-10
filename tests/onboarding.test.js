import test from 'node:test';
import assert from 'node:assert/strict';
import {
  needsCloudAuthGate,
  parseSignupHouseholdName,
  chooseCloudBootstrapAction,
  buildSyncableFootprint,
} from '../src/cloud/onboarding.js';

test('auth gate shows when cloud configured and logged out', () => {
  assert.equal(needsCloudAuthGate({ configured: true, user: null, deferAuth: false }), true);
  assert.equal(needsCloudAuthGate({ configured: true, user: { id: 'u' }, deferAuth: false }), false);
  assert.equal(needsCloudAuthGate({ configured: true, user: null, deferAuth: true }), false);
  assert.equal(needsCloudAuthGate({ configured: false, user: null, deferAuth: false }), false);
});

test('cloud bootstrap prefers push/pull without wiping the other side', () => {
  assert.equal(
    chooseCloudBootstrapAction({
      local: { shopping: 0, inventory: 0, mealPlan: 0, todayDinner: 0, familyProfiles: 0 },
      cloud: { shopping: 0, inventory: 0, mealPlan: 0, todayDinner: 0, familyProfiles: 0 },
    }),
    'empty',
  );
  assert.equal(
    chooseCloudBootstrapAction({
      local: { shopping: 0, inventory: 2, mealPlan: 0, todayDinner: 0, familyProfiles: 0 },
      cloud: { shopping: 0, inventory: 0, mealPlan: 0, todayDinner: 0, familyProfiles: 0 },
    }),
    'push',
  );
  assert.equal(
    chooseCloudBootstrapAction({
      local: { shopping: 0, inventory: 0, mealPlan: 0, todayDinner: 0, familyProfiles: 0 },
      cloud: { shopping: 1, inventory: 3, mealPlan: 0, todayDinner: 0, familyProfiles: 0 },
    }),
    'pull',
  );
  assert.equal(
    chooseCloudBootstrapAction({
      local: { shopping: 0, inventory: 1, mealPlan: 0, todayDinner: 0, familyProfiles: 0 },
      cloud: { shopping: 0, inventory: 2, mealPlan: 0, todayDinner: 0, familyProfiles: 0 },
    }),
    'needs-preview',
  );
});

test('buildSyncableFootprint ignores default owner-only seed member', () => {
  const fp = buildSyncableFootprint({
    shoppingLists: [{ items: [] }],
    inventory: [],
    mealPlan: null,
    todayDinner: null,
    members: [{ id: '1', displayName: '나', roleLabel: '관리자', note: '' }],
    cookingPatterns: [
      { name: '야채찜' },
      { name: '야채구이' },
      { name: '간단 아침' },
    ],
    sauces: [
      { name: '부추장' },
      { name: '마늘 간장 소스' },
      { name: '스리라차 소스' },
      { name: '참깨 간장 소스' },
      { name: '겨자 간장 소스' },
      { name: '토마토 양파 소스' },
      { name: '간장마늘 양념' },
      { name: '양꼬치 양념' },
      { name: '허니머스터드 소스' },
      { name: '넛맥 버터 시즈닝' },
    ],
  });
  assert.equal(fp.transactional, 0);
  assert.equal(fp.catalogCustomized, false);
});

test('signup household name defaults when blank and trims custom names', () => {
  assert.equal(parseSignupHouseholdName('').householdName, '우리 집');
  assert.equal(parseSignupHouseholdName('   ').householdName, '우리 집');
  const ok = parseSignupHouseholdName('  우리집  ');
  assert.equal(ok.ok, true);
  assert.equal(ok.householdName, '우리집');
  assert.equal(ok.profileDisplayName, '관리자');
  assert.equal(parseSignupHouseholdName('x'.repeat(81)).ok, false);
});
