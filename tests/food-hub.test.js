import test from 'node:test';
import assert from 'node:assert/strict';
import { nextFoodAction, normalizeFoodNav } from '../src/domain/foodHub.js';

function state(partial = {}) {
  return {
    household: { budgetWon: 80000 },
    todayDinner: null,
    mealPlan: null,
    inventory: [],
    cookingPatterns: [],
    sauces: [],
    shoppingLists: [{ id: 'l1', items: [], budgetWon: 80000 }],
    settings: { activeListId: 'l1' },
    ...partial,
  };
}

test('normalizeFoodNav maps legacy tabs into food segments', () => {
  assert.deepEqual(normalizeFoodNav('shopping'), { view: 'food', foodSegment: 'shopping' });
  assert.deepEqual(normalizeFoodNav('inventory'), { view: 'food', foodSegment: 'inventory' });
  assert.deepEqual(normalizeFoodNav('meals', 'x'), { view: 'food', foodSegment: 'meals' });
  assert.deepEqual(normalizeFoodNav('food', 'inventory'), { view: 'food', foodSegment: 'inventory' });
  assert.deepEqual(normalizeFoodNav('home'), { view: 'home', foodSegment: 'shopping' });
});

test('nextFoodAction prioritizes open shopping list', () => {
  const s = state({
    shoppingLists: [
      { id: 'l1', budgetWon: 80000, items: [{ id: 'a', name: '휴지', checked: false, priority: 'must' }] },
    ],
  });
  const next = nextFoodAction(s);
  assert.equal(next.segment, 'shopping');
  assert.match(next.title, /필수|살 것/);
});

test('nextFoodAction points to inventory when stock is low and list empty', () => {
  const next = nextFoodAction(
    state({
      inventory: [{ id: 'i1', name: '휴지', status: 'low' }],
    }),
  );
  assert.equal(next.segment, 'inventory');
});

test('nextFoodAction points to meals when starters cover empty inventory', () => {
  const next = nextFoodAction(
    state({
      inventory: [],
      cookingPatterns: [{ id: 'p1', name: '야채찜', method: 'steam', effort: 'medium' }],
    }),
  );
  assert.equal(next.segment, 'meals');
  assert.match(next.title, /저녁/);
});
