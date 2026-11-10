import test from 'node:test';
import assert from 'node:assert/strict';
import { addShoppingItem, updateShoppingItem, createShoppingList } from '../src/domain/shopping.js';
import { createInventoryItem, updateInventoryItem } from '../src/domain/inventory.js';
import { createEmptyState } from '../src/domain/state.js';

test('shopping add without category infers from name', () => {
  const list = createShoppingList();
  const snack = addShoppingItem(list, { name: '과자', quantity: 1, unit: '봉' });
  const tissue = addShoppingItem(list, { name: '휴지', quantity: 1, unit: '롤' });
  assert.equal(snack.category, 'snack');
  assert.equal(tissue.category, 'household');
});

test('shopping edit can override category', () => {
  const list = createShoppingList();
  const item = addShoppingItem(list, { name: '과자', quantity: 1, unit: '봉' });
  updateShoppingItem(list, item.id, { category: 'food' });
  assert.equal(item.category, 'food');
});

test('inventory add without category infers; edit can override', () => {
  const state = createEmptyState();
  const item = createInventoryItem({ name: '초콜릿', location: 'pantry', status: 'enough' });
  assert.equal(item.category, 'snack');
  state.inventory.push(item);
  updateInventoryItem(state, item.id, { category: 'other' });
  assert.equal(item.category, 'other');
});
