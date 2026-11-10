import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMigrationPlan, formatMigrationPreview } from '../src/cloud/migratePlan.js';
import { reconcileDeleteIds, localStateToCloudRows, mapMemberToProfile } from '../src/cloud/sync.js';
import { createEmptyState, migrateState } from '../src/domain/state.js';
import { seedState } from '../src/domain/seed.js';
import { ensureActiveList, addShoppingItem } from '../src/domain/shopping.js';
import { createInventoryItem } from '../src/domain/inventory.js';
import { syncBadgeLabel, SyncStatus, createSyncRuntime } from '../src/cloud/syncRuntime.js';
import { cloudCacheKey } from '../src/cloud/sessionScope.js';

test('reconcileDeleteIds drops remote-only ids (prevents zombie reappear)', () => {
  assert.deepEqual(reconcileDeleteIds(['a', 'b', 'c'], ['a', 'c']), ['b']);
  assert.deepEqual(reconcileDeleteIds(['a'], ['a', 'b']), []);
  assert.deepEqual(reconcileDeleteIds([], ['a']), []);
});

test('migration plan flags conflicts and name duplicates without mutating', () => {
  const local = seedState(createEmptyState());
  const list = ensureActiveList(local);
  addShoppingItem(list, { name: '휴지', quantity: 2, unit: '롤', priority: 'must', category: 'household' });
  const sharedId = list.items[0].id;
  local.inventory.push(
    createInventoryItem({ name: '두부', status: 'low', location: 'fridge', category: 'food' }),
  );

  const cloud = structuredClone(local);
  cloud.shoppingLists[0].items[0].quantity = 9; // conflict same id
  cloud.shoppingLists[0].items.push({
    id: 'cloud-only-dup',
    name: '우유',
    quantity: 1,
    unit: '개',
    priority: 'must',
    checked: false,
  });
  addShoppingItem(ensureActiveList(local), {
    name: '우유',
    quantity: 2,
    unit: '개',
    priority: 'must',
    category: 'food',
  });
  cloud.inventory[0].status = 'enough'; // inventory conflict

  const plan = buildMigrationPlan(local, cloud);
  assert.equal(plan.shopping.conflicts.some((c) => c.id === sharedId), true);
  assert.ok(plan.shopping.duplicatesByName.some((d) => d.name === '우유'));
  assert.ok(plan.inventory.conflicts.length >= 1);
  assert.equal(plan.needsAttention, true);
  assert.match(formatMigrationPreview(plan), /충돌/);
});

test('migration plan cloudEmpty when remote has no rows', () => {
  const local = seedState(createEmptyState());
  addShoppingItem(ensureActiveList(local), {
    name: '세제',
    quantity: 1,
    unit: '개',
    priority: 'must',
    category: 'household',
  });
  const plan = buildMigrationPlan(local, {
    shoppingLists: [],
    inventory: [],
    mealPlan: null,
    todayDinner: null,
  });
  assert.equal(plan.cloudEmpty, true);
  assert.equal(plan.summary.shoppingLocalOnly, 1);
});

test('family profiles map has no health/finance fields', () => {
  const row = mapMemberToProfile(
    { id: 'm1', displayName: '엄마', roleLabel: '엄마', note: '장보기 담당' },
    'hh1',
    1,
  );
  assert.equal(row.role_label, '엄마');
  assert.equal(row.household_id, 'hh1');
  assert.equal('health' in row, false);
  assert.equal('finance' in row, false);
  assert.equal('blood' in row, false);
});

test('localStateToCloudRows includes family_profiles', () => {
  const state = createEmptyState();
  state.members = [{ id: 'p1', displayName: '아빠', roleLabel: '아빠' }];
  const rows = localStateToCloudRows(state, '11111111-1111-1111-1111-111111111111');
  assert.equal(rows.familyProfiles.length, 1);
  assert.equal(rows.familyProfiles[0].display_name, '아빠');
});

test('state migrates through v6–v9 food hub and sauce catalog', () => {
  const raw = createEmptyState();
  raw.version = 5;
  delete raw.cloud.mode;
  raw.members = [{ id: 'x', displayName: '나', role: 'owner' }];
  raw.settings.view = 'shopping';
  raw.sauces = [{ id: 'old', name: '토마토소스' }];
  const m = migrateState(raw);
  assert.equal(m.version, 9);
  assert.equal(m.cloud.mode, 'local');
  assert.equal(m.members[0].roleLabel, '관리자');
  assert.equal(m.settings.view, 'food');
  assert.equal(m.settings.foodSegment, 'shopping');
  assert.ok(m.sauces.some((s) => s.name === '넛맥 올리브유 시즈닝'));
});

test('sync badge labels cover statuses', () => {
  assert.equal(syncBadgeLabel({ status: SyncStatus.ok }), '동기화됨');
  assert.equal(syncBadgeLabel({ status: SyncStatus.offline }), '오프라인');
  assert.equal(syncBadgeLabel({ status: SyncStatus.error }), '동기화 실패');
});

test('sync runtime canWrite blocks offline cloud-primary', () => {
  const rt = createSyncRuntime();
  // Force offline status path
  rt.setStatus(SyncStatus.offline, 'off');
  // navigator may be online in node — canWrite also checks ui.status offline
  assert.equal(rt.canWrite('cloud-primary'), false);
  assert.equal(rt.canWrite('local'), true);
});

test('cloud cache key scopes by user and household', () => {
  assert.equal(cloudCacheKey('u1', 'h1'), 'familyflow-cache:u1:h1');
  assert.equal(cloudCacheKey(null, 'h1'), null);
});
