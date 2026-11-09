import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createShoppingList,
  addFromQuickText,
  toggleShoppingItem,
  shoppingTotals,
  addShoppingItem,
} from '../src/domain/shopping.js';

test('shopping list add check budget', () => {
  const list = createShoppingList({ budgetWon: 10000 });
  addFromQuickText(list, '휴지 30롤');
  addShoppingItem(list, { name: '계란', quantity: 1, unit: '판', priority: 'nice', category: 'food', estimatedPrice: 7000 });
  assert.equal(list.items.length, 2);
  const tissue = list.items[0];
  assert.equal(tissue.name, '휴지');
  assert.equal(tissue.quantity, 30);
  toggleShoppingItem(list, tissue.id, true);
  const totals = shoppingTotals(list);
  assert.equal(totals.checkedCount, 1);
  assert.equal(totals.openCount, 1);
  assert.equal(totals.estimatedOpen, 7000);
});
