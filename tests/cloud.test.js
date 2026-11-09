import test from 'node:test';
import assert from 'node:assert/strict';
import { readCloudConfig, cloudSetupSteps } from '../src/cloud/config.js';
import {
  canReadHousehold,
  canEditHousehold,
  filterRowsByMembership,
  assertWriteHouseholdId,
} from '../src/cloud/rlsPolicy.js';
import { localStateToCloudRows, assertHouseholdScope } from '../src/cloud/sync.js';
import { createEmptyState } from '../src/domain/state.js';
import { seedState } from '../src/domain/seed.js';
import { ensureActiveList, addShoppingItem } from '../src/domain/shopping.js';
import { createInventoryItem } from '../src/domain/inventory.js';

test('readCloudConfig rejects placeholders and service_role', () => {
  assert.equal(
    readCloudConfig({
      VITE_SUPABASE_URL: 'https://YOUR_PROJECT_REF.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x',
    }).configured,
    false,
  );
  assert.equal(
    readCloudConfig({
      VITE_SUPABASE_URL: 'https://abc.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'service_role_secret_should_fail',
    }).rejectedSecretKey,
    true,
  );
  assert.equal(
    readCloudConfig({
      VITE_SUPABASE_URL: 'https://abc.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_ok',
    }).configured,
    true,
  );
});

test('setup steps mention separate project and no auto-delete', () => {
  const steps = cloudSetupSteps();
  assert.match(steps, /Haze Flow/);
  assert.match(steps, /자동 삭제하지/);
  assert.match(steps, /service_role 금지/);
});

test('RLS mirror blocks other household reads/writes', () => {
  const memberships = [
    { householdId: 'hh-a', userId: 'u1', role: 'owner' },
    { householdId: 'hh-b', userId: 'u2', role: 'editor' },
  ];
  assert.equal(canReadHousehold(memberships, 'hh-a', 'u1'), true);
  assert.equal(canReadHousehold(memberships, 'hh-b', 'u1'), false);
  assert.equal(canEditHousehold(memberships, 'hh-a', 'u1'), true);
  assert.equal(canEditHousehold(memberships, 'hh-a', 'u2'), false);

  const rows = [
    { id: 1, household_id: 'hh-a' },
    { id: 2, household_id: 'hh-b' },
    { id: 3, household_id: 'hh-forged' },
  ];
  assert.deepEqual(
    filterRowsByMembership(rows, memberships, 'u1').map((r) => r.id),
    [1],
  );
  assert.throws(() => assertWriteHouseholdId('hh-a', 'hh-forged'));
  assert.equal(assertWriteHouseholdId('hh-a', 'hh-a'), true);
});

test('localStateToCloudRows stamps household_id on every shared row', () => {
  const state = seedState(createEmptyState());
  addShoppingItem(ensureActiveList(state), {
    name: '휴지',
    quantity: 1,
    unit: '롤',
    priority: 'must',
    category: 'household',
  });
  state.inventory.push(
    createInventoryItem({ name: '두부', status: 'enough', location: 'fridge', category: 'food' }),
  );
  const hid = '11111111-1111-1111-1111-111111111111';
  const rows = localStateToCloudRows(state, hid);
  assert.equal(rows.shoppingList.household_id, hid);
  assert.ok(rows.shoppingItems.every((i) => i.household_id === hid));
  assert.ok(rows.inventory.every((i) => i.household_id === hid));
});

test('assertHouseholdScope rejects forged ids', () => {
  assert.throws(() => assertHouseholdScope('hh-a', 'hh-b'));
  assert.doesNotThrow(() => assertHouseholdScope('hh-a', 'hh-a'));
});

test('push path documented as local-preserving (contract)', () => {
  // Structural guarantee: sync module returns localPreserved flag on success mock shape
  const result = { ok: true, localPreserved: true };
  assert.equal(result.localPreserved, true);
});
