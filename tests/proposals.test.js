import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState } from '../src/domain/state.js';
import { seedState } from '../src/domain/seed.js';
import { createInventoryItem } from '../src/domain/inventory.js';
import { draftWeek } from '../src/domain/meals.js';
import { ensureActiveList, addShoppingItem } from '../src/domain/shopping.js';
import {
  createProposal,
  previewProposal,
  applyProposal,
  buildProteinSwapWithShoppingProposal,
  ProposalError,
  SUPPORTED_OPS,
  isProposalApplied,
} from '../src/domain/proposals.js';

function fresh() {
  return seedState(createEmptyState());
}

function withChickenWeek() {
  const state = fresh();
  state.mealPlan = draftWeek(state);
  // Force chicken proteins into dinner slots for deterministic swap.
  for (const day of state.mealPlan.days) {
    const dinner = day.slots.find((s) => s.mealType === 'dinner');
    if (dinner) {
      dinner.protein = '닭고기';
      dinner.title = `야채찜 · 닭고기`;
    }
  }
  return state;
}

test('SUPPORTED_OPS documents AI-whitelist surface', () => {
  assert.ok(SUPPORTED_OPS.includes('shopping.add'));
  assert.ok(SUPPORTED_OPS.includes('shopping.remove_unchecked'));
  assert.ok(SUPPORTED_OPS.includes('meals.replace_protein'));
});

test('preview does not mutate state', () => {
  const state = fresh();
  state.inventory.push(
    createInventoryItem({ name: '휴지', status: 'out', location: 'storage', category: 'household' }),
  );
  const proposal = createProposal({
    source: 'rules',
    key: 't1',
    title: '휴지',
    reason: '테스트',
    ops: [{ op: 'shopping.add', payload: { name: '휴지', quantity: 30, unit: '롤', priority: 'must', category: 'household' } }],
  });
  const before = JSON.stringify(state.shoppingLists);
  const preview = previewProposal(state, proposal);
  assert.equal(preview.ok, true);
  assert.equal(JSON.stringify(state.shoppingLists), before);
  assert.equal(ensureActiveList(state).items.length, 0);
});

test('unsupported op fails clearly', () => {
  assert.throws(
    () =>
      createProposal({
        source: 'ai',
        title: 'bad',
        reason: 'x',
        ops: [{ op: 'finance.hack', payload: {} }],
      }),
    (err) => err instanceof ProposalError && /지원하지 않는 작업/.test(err.message),
  );
});

test('shopping.add with null quantity stores 수량 미확인', () => {
  const state = fresh();
  const proposal = createProposal({
    source: 'rules',
    key: 'qty-null',
    title: '간장',
    reason: '부족 신호만',
    ops: [
      {
        op: 'shopping.add',
        payload: {
          name: '간장',
          quantity: null,
          unit: '병',
          priority: 'must',
          category: 'food',
        },
      },
    ],
  });
  const preview = previewProposal(state, proposal);
  assert.equal(preview.ok, true);
  assert.match(preview.changes.map((c) => c.text).join(' '), /수량 미확인/);
  assert.equal(applyProposal(state, proposal).ok, true);
  const item = ensureActiveList(state).items.find((i) => i.name === '간장');
  assert.equal(item.quantity, null);
});

test('duplicate shopping blocked before save', () => {
  const state = fresh();
  addShoppingItem(ensureActiveList(state), {
    name: '고등어',
    quantity: 1,
    unit: '마리',
    priority: 'must',
    category: 'food',
  });
  const proposal = createProposal({
    source: 'test',
    key: 'dup',
    title: '중복',
    reason: 'x',
    ops: [{ op: 'shopping.add', payload: { name: '고등어', quantity: 1, unit: '마리', priority: 'must', category: 'food' } }],
  });
  const preview = previewProposal(state, proposal);
  assert.equal(preview.ok, false);
  assert.match(preview.errors[0].message, /이미 장보기/);
  assert.equal(ensureActiveList(state).items.filter((i) => i.name === '고등어').length, 1);
});

test('atomic failure leaves state unchanged', () => {
  const state = withChickenWeek();
  const shoppingBefore = ensureActiveList(state).items.length;
  const proposal = createProposal({
    source: 'test',
    key: 'atomic-fail',
    title: '부분 실패',
    reason: '두 번째 작업이 실패해야 함',
    ops: [
      { op: 'meals.replace_protein', payload: { from: '닭고기', to: '고등어', scope: 'week' } },
      { op: 'shopping.add', payload: { name: '', quantity: 1, unit: '마리', priority: 'must', category: 'food' } },
    ],
  });
  const preview = previewProposal(state, proposal);
  assert.equal(preview.ok, false);
  assert.throws(() => applyProposal(state, proposal), ProposalError);
  // Chicken dinners untouched
  assert.ok(state.mealPlan.days.some((d) => d.slots.some((s) => s.protein === '닭고기')));
  assert.equal(ensureActiveList(state).items.length, shoppingBefore);
  assert.equal(isProposalApplied(state, proposal.id), false);
});

test('compound: chicken week → mackerel + shop when missing', () => {
  const state = withChickenWeek();
  // No 고등어 inventory → must add shopping
  const proposal = buildProteinSwapWithShoppingProposal(state, { from: '닭고기', to: '고등어' });
  assert.equal(proposal.ops.length, 2);
  assert.equal(proposal.ops[0].op, 'meals.replace_protein');
  assert.equal(proposal.ops[1].op, 'shopping.add');

  const preview = previewProposal(state, proposal);
  assert.equal(preview.ok, true, JSON.stringify(preview.errors));
  assert.ok(preview.changes.length >= 2);

  // Still unchanged before approve
  assert.ok(state.mealPlan.days[0].slots.find((s) => s.mealType === 'dinner').protein === '닭고기');
  assert.equal(ensureActiveList(state).items.some((i) => i.name === '고등어'), false);

  const result = applyProposal(state, proposal);
  assert.equal(result.ok, true);
  assert.equal(result.idempotent, false);
  assert.ok(state.mealPlan.days.every((d) => {
    const dinner = d.slots.find((s) => s.mealType === 'dinner');
    return dinner.protein === '고등어';
  }));
  assert.ok(ensureActiveList(state).items.some((i) => i.name === '고등어' && !i.checked));
  assert.equal(isProposalApplied(state, proposal.id), true);

  // Second approve is idempotent — no duplicate mackerel
  const shopCount = ensureActiveList(state).items.filter((i) => i.name === '고등어').length;
  const again = applyProposal(state, proposal);
  assert.equal(again.idempotent, true);
  assert.equal(ensureActiveList(state).items.filter((i) => i.name === '고등어').length, shopCount);
});

test('compound skips shopping when mackerel stock is enough', () => {
  const state = withChickenWeek();
  state.inventory.push(
    createInventoryItem({ name: '고등어', status: 'enough', location: 'fridge', category: 'food', unit: '마리' }),
  );
  const proposal = buildProteinSwapWithShoppingProposal(state, { from: '닭고기', to: '고등어' });
  assert.equal(proposal.ops.length, 1);
  assert.equal(proposal.ops[0].op, 'meals.replace_protein');
  applyProposal(state, proposal);
  assert.equal(ensureActiveList(state).items.some((i) => i.name === '고등어'), false);
});
