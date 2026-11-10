import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState } from '../src/domain/state.js';
import { seedState } from '../src/domain/seed.js';
import { suggestToday, draftWeek } from '../src/domain/meals.js';

test('suggestToday returns dinner only — no fixed 구운란 breakfast', () => {
  const state = seedState(createEmptyState());
  const today = suggestToday(state);
  assert.equal(today.slots.length, 1);
  assert.equal(today.slots[0].mealType, 'dinner');
  assert.doesNotMatch(today.slots[0].title || '', /구운란|찐빵/);
});

test('draftWeek leaves breakfast and lunch empty', () => {
  const state = seedState(createEmptyState());
  const plan = draftWeek(state);
  for (const day of plan.days) {
    const breakfast = day.slots.find((s) => s.mealType === 'breakfast');
    const lunch = day.slots.find((s) => s.mealType === 'lunch');
    const dinner = day.slots.find((s) => s.mealType === 'dinner');
    assert.equal(breakfast.status, 'empty');
    assert.equal(breakfast.title, '');
    assert.equal(lunch.status, 'empty');
    assert.equal(dinner.status, 'suggested');
    assert.ok(dinner.title);
  }
});
