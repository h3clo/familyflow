import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState, persist } from '../src/domain/state.js';
import { seedState } from '../src/domain/seed.js';
import { createInventoryItem } from '../src/domain/inventory.js';
import { ensureActiveList, addShoppingItem } from '../src/domain/shopping.js';
import {
  generateSuggestions,
  applySuggestion,
  dismissSuggestion,
  suggestionFingerprint,
  isDismissed,
} from '../src/domain/suggestions.js';

function fresh() {
  return seedState(createEmptyState());
}

test('empty data shows setup, not invented stock', () => {
  const state = fresh();
  const pack = generateSuggestions(state);
  assert.equal(pack.mode, 'setup');
  assert.equal(pack.suggestions.length, 0);
  assert.ok(pack.setup.steps.length >= 2);
});

test('out-of-stock tissue suggests shopping', () => {
  const state = fresh();
  state.inventory.push(
    createInventoryItem({ name: '휴지', status: 'out', location: 'storage', category: 'household', unit: '롤' }),
  );
  const pack = generateSuggestions(state);
  assert.equal(pack.mode, 'active');
  const hit = pack.suggestions.find((s) => s.type === 'shopping.add' && s.payload.name === '휴지');
  assert.ok(hit);
  assert.match(hit.reason, /없음/);
});

test('tissue already on list is not suggested again', () => {
  const state = fresh();
  state.inventory.push(
    createInventoryItem({ name: '휴지', status: 'out', location: 'storage', category: 'household' }),
  );
  const list = ensureActiveList(state);
  addShoppingItem(list, { name: '휴지', quantity: 30, unit: '롤', priority: 'must', category: 'household' });
  const pack = generateSuggestions(state);
  const hit = pack.suggestions.find((s) => s.type === 'shopping.add' && s.payload.name === '휴지');
  assert.equal(hit, undefined);
});

test('chicken drumstick in stock suggests dinner', () => {
  const state = fresh();
  state.inventory.push(
    createInventoryItem({ name: '닭다리살', status: 'enough', location: 'fridge', category: 'food' }),
  );
  const pack = generateSuggestions(state);
  const hit = pack.suggestions.find((s) => s.type === 'meals.confirm_dinner');
  assert.ok(hit);
  assert.match(hit.title, /닭다리살/);
  applySuggestion(state, hit);
  assert.equal(state.todayDinner.protein, '닭다리살');
});

test('dismiss prevents immediate repeat', () => {
  const state = fresh();
  state.inventory.push(
    createInventoryItem({ name: '휴지', status: 'out', location: 'storage', category: 'household' }),
  );
  let pack = generateSuggestions(state);
  const hit = pack.suggestions.find((s) => s.payload?.name === '휴지');
  assert.ok(hit);
  dismissSuggestion(state, hit);
  assert.equal(isDismissed(state, hit), true);
  pack = generateSuggestions(state);
  assert.equal(
    pack.suggestions.find((s) => suggestionFingerprint(s) === suggestionFingerprint(hit)),
    undefined,
  );
});

test('accept shopping persists via applySuggestion', () => {
  const state = fresh();
  const item = createInventoryItem({ name: '휴지', status: 'out', location: 'storage', category: 'household' });
  state.inventory.push(item);
  const pack = generateSuggestions(state);
  const hit = pack.suggestions.find((s) => s.payload?.name === '휴지');
  const result = applySuggestion(state, hit);
  assert.match(result.message, /장보기/);
  const list = ensureActiveList(state);
  assert.ok(list.items.some((i) => i.name === '휴지' && !i.checked));
  // second generate should not re-add suggestion
  const again = generateSuggestions(state).suggestions.find((s) => s.payload?.name === '휴지');
  assert.equal(again, undefined);
});

// silence unused in case tree-shaken
void persist;
