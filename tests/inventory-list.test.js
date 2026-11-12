import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterInventory,
  groupInventoryByLocation,
  statusLabel,
  locationLabel,
  formatInventoryNameQty,
  repairOtherCategories,
} from '../src/domain/inventoryList.js';
import { inferCategory } from '../src/domain/quick-add.js';
import { createEmptyState } from '../src/domain/state.js';
import { applyPurchaseToInventory, createInventoryItem } from '../src/domain/inventory.js';
import { inventoryProposalsFromChecked, addShoppingItem, ensureActiveList } from '../src/domain/shopping.js';

const sample = [
  { id: '1', name: '달걀', location: 'fridge', status: 'enough', quantity: 10, unit: '개' },
  { id: '2', name: '우유', location: 'fridge', status: 'low', quantity: 1.8, unit: 'L' },
  { id: '3', name: '두부', location: 'fridge', status: 'out', quantity: null, unit: null },
  { id: '4', name: '화장지', location: 'storage', status: 'enough', quantity: 30, unit: '롤' },
  { id: '5', name: '라면', location: 'pantry', status: 'unknown', quantity: 3, unit: '개' },
];

test('filterInventory keeps keyword search only', () => {
  assert.deepEqual(
    filterInventory(sample, { query: '두' }).map((i) => i.name),
    ['두부'],
  );
});

test('groupInventoryByLocation sorts groups by fewest items first', () => {
  const groups = groupInventoryByLocation(sample);
  assert.deepEqual(
    groups.map((g) => `${g.id}:${g.items.length}`),
    ['pantry:1', 'storage:1', 'fridge:3'],
  );
  assert.equal(groups[0].label, '실온·팬트리');
  assert.equal(groups[2].items.length, 3);
});

test('formatInventoryNameQty shows qty only when known', () => {
  assert.equal(formatInventoryNameQty({ name: '감귤', quantity: 2.5, unit: 'kg' }), '감귤 2.5kg');
  assert.equal(formatInventoryNameQty({ name: '달걀', quantity: 10, unit: '개' }), '달걀 10개');
  assert.equal(formatInventoryNameQty({ name: '대파', quantity: null, unit: 'kg' }), '대파');
});

test('produce names infer as food not other', () => {
  assert.equal(inferCategory('무'), 'food');
  assert.equal(inferCategory('감귤'), 'food');
  assert.equal(inferCategory('귤'), 'food');
  assert.equal(inferCategory('대파'), 'food');
  assert.equal(inferCategory('화장지'), 'household');
});

test('repairOtherCategories upgrades only other rows', () => {
  const inv = [
    { id: 'a', name: '무', category: 'other', updatedAt: '2020-01-01' },
    { id: 'b', name: '감귤', category: 'other', updatedAt: '2020-01-01' },
    { id: 'c', name: '특별', category: 'other', updatedAt: '2020-01-01' },
    { id: 'd', name: '무', category: 'snack', updatedAt: '2020-01-01' },
  ];
  const n = repairOtherCategories(inv);
  assert.equal(n, 2);
  assert.equal(inv[0].category, 'food');
  assert.equal(inv[1].category, 'food');
  assert.equal(inv[2].category, 'other');
  assert.equal(inv[3].category, 'snack');
});

test('purchase complete proposes enough; shopping add alone does not touch inventory', () => {
  const state = createEmptyState();
  const list = ensureActiveList(state);
  addShoppingItem(list, { name: '감귤', quantity: 1, unit: 'kg' });
  assert.equal(state.inventory.length, 0);

  list.items[0].checked = true;
  const proposals = inventoryProposalsFromChecked(list, state.inventory);
  assert.equal(proposals[0].suggestedStatus, 'enough');
  applyPurchaseToInventory(state, proposals[0], { accept: true });
  assert.equal(state.inventory.length, 1);
  assert.equal(state.inventory[0].status, 'enough');
  assert.equal(state.inventory[0].name, '감귤');
  assert.equal(state.inventory[0].category, 'food');
});

test('status and location short labels are text-readable', () => {
  assert.equal(statusLabel('enough'), '충분');
  assert.equal(locationLabel('fridge'), '냉장');
  assert.equal(createInventoryItem({ name: '무', status: 'enough' }).category, 'food');
});
