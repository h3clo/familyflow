import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeItemName,
  componentNameCandidates,
  findInventoryByName,
  resolveSauceComponentStatuses,
  shoppingNeedsFromStatuses,
} from '../src/domain/inventoryMatch.js';

test('normalizeItemName strips spaces and case', () => {
  assert.equal(normalizeItemName(' 다진 마늘 '), '다진마늘');
});

test('componentNameCandidates expands 또는 and prep prefixes', () => {
  const a = componentNameCandidates('꿀 또는 올리고당');
  assert.ok(a.includes('꿀'));
  assert.ok(a.includes('올리고당'));
  const b = componentNameCandidates('다진 마늘');
  assert.ok(b.includes('마늘'));
  assert.ok(b.includes('다진 마늘'));
});

test('findInventoryByName matches prep-stripped name', () => {
  const state = {
    inventory: [{ id: '1', name: '마늘', status: 'low', quantity: 2, unit: '쪽' }],
  };
  const hit = findInventoryByName(state, '다진 마늘');
  assert.equal(hit?.id, '1');
});

test('optional components do not become shopping needs when missing', () => {
  const sauce = {
    name: '폰즈',
    components: [
      { name: '간장' },
      { name: '다시마·가쓰오 육수(선택)' },
    ],
  };
  const rows = resolveSauceComponentStatuses({ inventory: [] }, sauce);
  const needs = shoppingNeedsFromStatuses(rows);
  assert.equal(needs.length, 0);
  assert.ok(rows.some((r) => r.optional && r.status === 'missing'));
});

test('shoppingNeedsFromStatuses only includes confirmed low/out', () => {
  const rows = [
    { name: '간장', matchedName: '간장', status: 'out', inventoryId: 'a', optional: false, item: { quantity: null } },
    { name: '마늘', matchedName: '마늘', status: 'unknown', inventoryId: 'b', optional: false, item: {} },
    { name: '깨', matchedName: '깨', status: 'missing', inventoryId: null, optional: false, item: null },
    { name: '식초', matchedName: '식초', status: 'low', inventoryId: 'c', optional: false, item: { quantity: 1, unit: '병' } },
  ];
  const needs = shoppingNeedsFromStatuses(rows);
  assert.deepEqual(
    needs.map((n) => n.name).sort(),
    ['간장', '식초'],
  );
  assert.equal(needs.find((n) => n.name === '식초').unit, '병');
});
