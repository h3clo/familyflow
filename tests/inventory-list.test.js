import test from 'node:test';
import assert from 'node:assert/strict';
import { filterSortInventory, statusLabel, locationLabel } from '../src/domain/inventoryList.js';

const sample = [
  { id: '1', name: '달걀', location: 'fridge', status: 'enough', updatedAt: '2026-01-01' },
  { id: '2', name: '우유', location: 'fridge', status: 'low', updatedAt: '2026-01-03' },
  { id: '3', name: '두부', location: 'fridge', status: 'out', updatedAt: '2026-01-02' },
  { id: '4', name: '화장지', location: 'storage', status: 'enough', updatedAt: '2026-01-04' },
  { id: '5', name: '라면', location: 'pantry', status: 'unknown', updatedAt: '2026-01-05' },
];

test('filterSortInventory filters by query / location / status', () => {
  assert.deepEqual(
    filterSortInventory(sample, { query: '두' }).map((i) => i.name),
    ['두부'],
  );
  assert.equal(filterSortInventory(sample, { location: 'storage' }).length, 1);
  assert.deepEqual(
    filterSortInventory(sample, { status: 'low' }).map((i) => i.name),
    ['우유'],
  );
});

test('filterSortInventory sorts by name / status / location', () => {
  assert.deepEqual(
    filterSortInventory(sample, { sort: 'name' }).map((i) => i.name),
    ['달걀', '두부', '라면', '우유', '화장지'],
  );
  assert.deepEqual(
    filterSortInventory(sample, { sort: 'status' }).map((i) => i.status),
    ['enough', 'enough', 'low', 'out', 'unknown'],
  );
  assert.equal(filterSortInventory(sample, { sort: 'location' })[0].location, 'fridge');
});

test('status and location short labels are text-readable', () => {
  assert.equal(statusLabel('enough'), '충분');
  assert.equal(statusLabel('low'), '부족');
  assert.equal(locationLabel('fridge'), '냉장');
  assert.equal(locationLabel('storage', { short: false }), '창고');
});
