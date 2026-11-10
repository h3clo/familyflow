import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDinnerHomeOffer, listDinnerCandidates } from '../src/domain/dinnerHome.js';
import { previewProposal, applyProposal } from '../src/domain/proposals.js';

function baseState(inventory = []) {
  return {
    household: { name: '우리집', budgetWon: 80000 },
    todayDinner: null,
    mealPlan: null,
    inventory,
    cookingPatterns: [
      { id: 'p1', name: '야채구이', method: 'roast', effort: 'medium' },
      { id: 'p2', name: '야채찜', method: 'steam', effort: 'medium' },
    ],
    sauces: [{ id: 's1', name: '마늘간장 소스', forPatterns: ['야채구이'] }],
    shoppingLists: [{ id: 'l1', name: '장보기', budgetWon: 80000, items: [] }],
    settings: { activeListId: 'l1' },
    proposalsMeta: { applied: {}, dismissed: {} },
    suggestionsMeta: { dismissed: {} },
  };
}

test('empty when no confirmed protein stock', () => {
  const offer = buildDinnerHomeOffer(baseState([]));
  assert.equal(offer.status, 'empty');
  assert.match(offer.emptyReason, /추천할 저녁이 부족/);
});

test('does not invent unknown inventory as usable stock', () => {
  const offer = buildDinnerHomeOffer(
    baseState([{ id: 'i1', name: '고등어', status: 'unknown' }]),
  );
  assert.equal(offer.status, 'empty');
});

test('offers dinner from enough protein with 이대로 proposal', () => {
  const state = baseState([
    { id: 'i1', name: '고등어', status: 'enough' },
    { id: 'i2', name: '닭고기', status: 'enough' },
  ]);
  const offer = buildDinnerHomeOffer(state, { altIndex: 0 });
  assert.equal(offer.status, 'offer');
  assert.ok(offer.offer.title.includes('고등어') || offer.offer.protein === '고등어' || offer.offer.protein === '닭고기');
  assert.ok(offer.offer.reasons.some((r) => /재고/.test(r)));
  assert.equal(offer.offer.proposal.ops[0].op, 'meals.confirm_dinner');
  const preview = previewProposal(state, offer.offer.proposal);
  assert.equal(preview.ok, true);
  assert.equal(state.todayDinner, null);
});

test('바꾸기 cycles to another candidate', () => {
  const state = baseState([
    { id: 'i1', name: '고등어', status: 'enough' },
    { id: 'i2', name: '닭고기', status: 'enough' },
  ]);
  const a = buildDinnerHomeOffer(state, { altIndex: 0 });
  const b = buildDinnerHomeOffer(state, { altIndex: a.offer.nextAltIndex });
  assert.equal(a.status, 'offer');
  assert.equal(b.status, 'offer');
  assert.notEqual(a.offer.protein, b.offer.protein);
});

test('out-of-stock protein includes shopping.add in proposal', () => {
  const state = baseState([{ id: 'i1', name: '고등어', status: 'out' }]);
  const offer = buildDinnerHomeOffer(state);
  assert.equal(offer.status, 'offer');
  assert.ok(offer.offer.proposal.ops.some((op) => op.op === 'shopping.add'));
});

test('이대로 apply confirms dinner after preview', () => {
  const state = baseState([{ id: 'i1', name: '계란', status: 'enough' }]);
  const offer = buildDinnerHomeOffer(state);
  const applied = applyProposal(state, offer.offer.proposal);
  assert.equal(applied.ok, true);
  assert.ok(state.todayDinner);
  assert.equal(buildDinnerHomeOffer(state).status, 'confirmed');
});

test('listDinnerCandidates sorts enough before out', () => {
  const list = listDinnerCandidates(
    baseState([
      { id: 'a', name: '닭고기', status: 'out' },
      { id: 'b', name: '고등어', status: 'enough' },
    ]),
  );
  assert.equal(list[0].protein, '고등어');
});
