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

test('shopping.add accepts quantity null as 수량 미확인', () => {
  const list = createShoppingList({ budgetWon: 10000 });
  addShoppingItem(list, {
    name: '간장',
    quantity: null,
    unit: '병',
    priority: 'must',
    category: 'food',
  });
  assert.equal(list.items[0].quantity, null);
  assert.equal(list.items[0].unit, '병');
});
