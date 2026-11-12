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

test('findInventoryByName matches prep-stripped name exactly', () => {
  const state = {
    inventory: [{ id: '1', name: '마늘', status: 'low', quantity: 2, unit: '쪽' }],
  };
  const hit = findInventoryByName(state, '다진 마늘');
  assert.equal(hit?.id, '1');
});

test('findInventoryByName does not confuse 간장 with 국간장', () => {
  const state = {
    inventory: [{ id: 'g', name: '국간장', status: 'out', quantity: 1, unit: '병' }],
  };
  assert.equal(findInventoryByName(state, '간장'), null);
  assert.equal(findInventoryByName(state, '국간장')?.id, 'g');
});

test('findInventoryByName does not confuse 참기름 with 들기름', () => {
  const state = {
    inventory: [
      { id: 's', name: '참기름', status: 'enough' },
      { id: 'p', name: '들기름', status: 'out' },
    ],
  };
  assert.equal(findInventoryByName(state, '참기름')?.id, 's');
  assert.equal(findInventoryByName(state, '들기름')?.id, 'p');
  assert.equal(findInventoryByName(state, '기름'), null);
});

test('findInventoryByName does not treat substitute 또는-pair as each other across inventory', () => {
  // Component "꿀 또는 올리고당" may match either exact pantry row — not a third similar sweetener.
  const state = {
    inventory: [{ id: 'm', name: '메이플시럽', status: 'low' }],
  };
  assert.equal(findInventoryByName(state, '꿀 또는 올리고당'), null);
  state.inventory.push({ id: 'h', name: '꿀', status: 'low' });
  assert.equal(findInventoryByName(state, '꿀 또는 올리고당')?.id, 'h');
});

test('optional components do not become shopping needs when missing', () => {
  const sauce = {
    name: '폰즈',
    components: [{ name: '간장' }, { name: '다시마·가쓰오 육수(선택)' }],
  };
  const rows = resolveSauceComponentStatuses({ inventory: [] }, sauce);
  const needs = shoppingNeedsFromStatuses(rows);
  assert.equal(needs.length, 0);
  assert.ok(rows.some((r) => r.optional && r.status === 'missing'));
});

test('shoppingNeedsFromStatuses never invents 1 and never copies remaining stock qty', () => {
  const rows = [
    {
      name: '간장',
      matchedName: '간장',
      status: 'out',
      inventoryId: 'a',
      optional: false,
      item: { quantity: null },
    },
    {
      name: '마늘',
      matchedName: '마늘',
      status: 'unknown',
      inventoryId: 'b',
      optional: false,
      item: {},
    },
    {
      name: '깨',
      matchedName: '깨',
      status: 'missing',
      inventoryId: null,
      optional: false,
      item: null,
    },
    {
      name: '식초',
      matchedName: '식초',
      status: 'low',
      inventoryId: 'c',
      optional: false,
      item: { quantity: 3, unit: '병' },
    },
  ];
  const needs = shoppingNeedsFromStatuses(rows);
  assert.deepEqual(
    needs.map((n) => n.name).sort(),
    ['간장', '식초'],
  );
  for (const need of needs) {
    assert.equal(need.quantity, null, `${need.name} must not invent buy qty`);
  }
  // Remaining stock unit may label the row; remaining count must not become buy qty.
  assert.equal(needs.find((n) => n.name === '식초').unit, '병');
});
