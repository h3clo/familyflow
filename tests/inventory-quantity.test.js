import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState } from '../src/domain/state.js';
import { createInventoryItem, updateInventoryItem } from '../src/domain/inventory.js';

test('clearing quantity on edit sets null (수량 미확인), does not keep old value', () => {
  const state = createEmptyState();
  const item = createInventoryItem({
    name: '브로콜리',
    status: 'enough',
    location: 'fridge',
    quantity: 3,
    unit: '개',
  });
  state.inventory.push(item);

  // FormData empty field arrives as ''.
  updateInventoryItem(state, item.id, {
    name: '브로콜리',
    location: 'fridge',
    status: 'enough',
    category: 'food',
    quantity: '',
    unit: '개',
  });

  assert.equal(item.quantity, null);
});

test('omitting quantity key on patch keeps previous quantity', () => {
  const state = createEmptyState();
  const item = createInventoryItem({
    name: '두부',
    status: 'enough',
    location: 'fridge',
    quantity: 2,
    unit: '모',
  });
  state.inventory.push(item);

  updateInventoryItem(state, item.id, {
    name: '두부',
    location: 'fridge',
    status: 'low',
    category: 'food',
  });

  assert.equal(item.quantity, 2);
  assert.equal(item.status, 'low');
});

test('explicit null quantity clears to 수량 미확인', () => {
  const state = createEmptyState();
  const item = createInventoryItem({
    name: '계란',
    status: 'enough',
    location: 'fridge',
    quantity: 10,
    unit: '개',
  });
  state.inventory.push(item);

  updateInventoryItem(state, item.id, { quantity: null });
  assert.equal(item.quantity, null);
});
