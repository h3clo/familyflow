import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSyncableFootprint,
  chooseCloudBootstrapAction,
  prepareHouseholdSwitch,
  bootstrapNetworkFailure,
  syncSidesDiffer,
} from '../src/cloud/bootstrap.js';
import { buildMigrationPlan } from '../src/cloud/migratePlan.js';
import { createEmptyState, migrateState } from '../src/domain/state.js';
import { seedState } from '../src/domain/seed.js';
import { ensureActiveList, addShoppingItem } from '../src/domain/shopping.js';
import { createInventoryItem } from '../src/domain/inventory.js';

function seeded() {
  return seedState(createEmptyState());
}

test('footprint includes meals, profiles, and kitchen catalog — not just inventory/shopping', () => {
  const local = seeded();
  local.mealPlan = { id: 'mp1', weekStart: '2026-11-10', days: [] };
  local.todayDinner = { title: '야채찜 · 닭고기', protein: '닭고기' };
  local.members.push({ id: 'm2', displayName: '엄마', roleLabel: '엄마', note: '' });
  local.cookingPatterns.push({ id: 'px', name: '에어프라이', method: 'roast', effort: 'low' });

  const fp = buildSyncableFootprint(local);
  assert.equal(fp.shopping, 0);
  assert.equal(fp.inventory, 0);
  assert.equal(fp.mealPlan, 1);
  assert.equal(fp.todayDinner, 1);
  assert.equal(fp.familyProfiles, 1);
  assert.equal(fp.catalogCustomized, true);
  assert.ok(fp.transactional >= 3);
});

test('bootstrap: local-only transactional data → push', () => {
  const local = seeded();
  local.inventory.push(createInventoryItem({ name: '두부', status: 'enough', location: 'fridge' }));
  local.mealPlan = { id: 'mp1', weekStart: '2026-11-10', days: [] };
  const cloud = seeded();
  cloud.inventory = [];
  cloud.mealPlan = null;
  cloud.todayDinner = null;
  cloud.members = [];
  cloud.shoppingLists = [{ id: 'c1', items: [] }];

  const action = chooseCloudBootstrapAction({
    local: buildSyncableFootprint(local),
    cloud: buildSyncableFootprint(cloud),
    plan: buildMigrationPlan(local, cloud),
  });
  assert.equal(action, 'push');
});

test('bootstrap: cloud-only data (local seed only) → pull', () => {
  const local = seeded();
  const cloud = seeded();
  cloud.inventory = [createInventoryItem({ name: '고등어', status: 'enough', location: 'fridge' })];
  cloud.todayDinner = { title: '야채구이 · 고등어', protein: '고등어' };
  cloud.members = [{ id: 'c1', displayName: '아빠', roleLabel: '아빠' }];

  const action = chooseCloudBootstrapAction({
    local: buildSyncableFootprint(local),
    cloud: buildSyncableFootprint(cloud),
    plan: buildMigrationPlan(local, cloud),
  });
  assert.equal(action, 'pull');
});

test('bootstrap: both sides have different records → needs-preview (no auto overwrite)', () => {
  const local = seeded();
  addShoppingItem(ensureActiveList(local), {
    name: '휴지',
    quantity: 2,
    unit: '롤',
    priority: 'must',
    category: 'household',
  });
  local.inventory.push(createInventoryItem({ name: '닭고기', status: 'enough', location: 'freezer' }));

  const cloud = seeded();
  cloud.shoppingLists = [
    {
      id: 'clist',
      items: [{ id: 'cx', name: '세제', quantity: 1, unit: '개', priority: 'must', checked: false }],
    },
  ];
  cloud.inventory = [createInventoryItem({ name: '두부', status: 'low', location: 'fridge' })];
  cloud.mealPlan = { id: 'cmp', weekStart: '2026-11-03', days: [] };

  const plan = buildMigrationPlan(local, cloud);
  assert.equal(plan.needsAttention, true);
  assert.equal(syncSidesDiffer(plan, buildSyncableFootprint(local), buildSyncableFootprint(cloud)), true);

  const action = chooseCloudBootstrapAction({
    local: buildSyncableFootprint(local),
    cloud: buildSyncableFootprint(cloud),
    plan,
  });
  assert.equal(action, 'needs-preview');
});

test('bootstrap: meal-plan-only local vs inventory-only cloud still needs preview', () => {
  const local = seeded();
  local.mealPlan = { id: 'mp1', weekStart: '2026-11-10', days: [{ date: '2026-11-10', slots: [] }] };
  const cloud = seeded();
  cloud.inventory = [createInventoryItem({ name: '계란', status: 'enough', location: 'fridge' })];
  cloud.members = [];

  const plan = buildMigrationPlan(local, cloud);
  const action = chooseCloudBootstrapAction({
    local: buildSyncableFootprint(local),
    cloud: buildSyncableFootprint(cloud),
    plan,
  });
  assert.equal(action, 'needs-preview');
});

test('household switch isolates caches and does not carry previous inventory', () => {
  const caches = new Map();
  const userId = 'user-1';
  const hhA = 'hh-a';
  const hhB = 'hh-b';

  const stateA = seeded();
  stateA.cloud = {
    userId,
    householdId: hhA,
    mode: 'cloud-primary',
    migratedAt: '2026-11-10T00:00:00.000Z',
  };
  stateA.inventory.push(
    createInventoryItem({ name: '집A-닭고기', status: 'enough', location: 'fridge' }),
  );
  caches.set(`${userId}:${hhA}`, structuredClone(stateA));

  const switched = prepareHouseholdSwitch({
    prevState: stateA,
    nextHouseholdId: hhB,
    userId,
    loadScoped: (uid, hid) => caches.get(`${uid}:${hid}`) || null,
    saveScoped: (uid, hid, st) => {
      caches.set(`${uid}:${hid}`, structuredClone(st));
    },
  });

  assert.equal(switched.fromCache, false);
  assert.equal(switched.state.cloud.householdId, hhB);
  assert.equal(switched.state.cloud.mode, 'local');
  assert.equal(
    (switched.state.inventory || []).some((i) => i.name === '집A-닭고기'),
    false,
  );
  assert.ok(caches.get(`${userId}:${hhA}`));
  assert.equal(caches.get(`${userId}:${hhA}`).inventory[0].name, '집A-닭고기');

  // Returning to A restores scoped cache, not B's empty shell.
  caches.set(`${userId}:${hhB}`, structuredClone(switched.state));
  const back = prepareHouseholdSwitch({
    prevState: switched.state,
    nextHouseholdId: hhA,
    userId,
    loadScoped: (uid, hid) => caches.get(`${uid}:${hid}`) || null,
    saveScoped: (uid, hid, st) => caches.set(`${uid}:${hid}`, structuredClone(st)),
  });
  assert.equal(back.fromCache, true);
  assert.equal(back.state.cloud.householdId, hhA);
  assert.equal(back.state.inventory[0].name, '집A-닭고기');
});

test('network failure helper keeps local mode and does not claim success', () => {
  const fail = bootstrapNetworkFailure(new Error('Failed to fetch'));
  assert.equal(fail.ok, false);
  assert.equal(fail.action, 'error');
  assert.equal(fail.keepMode, 'local');
  assert.match(fail.message, /Failed to fetch|네트워크|실패/);
});

test('migration plan treats local-only + cloud-only rows as needing attention', () => {
  const local = seeded();
  local.inventory.push(createInventoryItem({ name: '로컬만', status: 'enough', location: 'pantry' }));
  const cloud = {
    shoppingLists: [],
    inventory: [createInventoryItem({ name: '클라우드만', status: 'low', location: 'fridge' })],
    mealPlan: null,
    todayDinner: null,
    members: [],
  };
  const plan = buildMigrationPlan(local, cloud);
  assert.ok(plan.summary.inventoryLocalOnly >= 1);
  assert.ok(plan.summary.inventoryCloudOnly >= 1);
  assert.equal(plan.needsAttention, true);
});

test('migrateState still boots after bootstrap helpers (no schema wipe side effects)', () => {
  const raw = seeded();
  raw.version = 6;
  const migrated = migrateState(raw);
  assert.ok(migrated);
  assert.equal(migrated.version, 7);
  assert.ok(Array.isArray(migrated.cookingPatterns));
  assert.ok(Array.isArray(migrated.sauces));
});
