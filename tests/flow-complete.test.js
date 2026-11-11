import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDinnerHomeOffer,
  listDinnerCandidates,
} from '../src/domain/dinnerHome.js';
import {
  draftWeek,
  mealsTodayViewModel,
  weekDinnerShortages,
  buildWeekShoppingProposal,
} from '../src/domain/meals.js';
import { previewProposal, applyProposal } from '../src/domain/proposals.js';
import { ensureActiveList } from '../src/domain/shopping.js';

function baseState(inventory = [], sauces) {
  return {
    household: { name: '우리집', budgetWon: 80000 },
    todayDinner: null,
    mealPlan: null,
    inventory,
    cookingPatterns: [
      { id: 'p1', name: '야채구이', method: 'roast', effort: 'medium' },
      { id: 'p2', name: '야채찜', method: 'steam', effort: 'medium' },
    ],
    sauces: sauces || [
      {
        id: 's1',
        name: '간장마늘 양념',
        forPatterns: ['야채구이', '야채찜'],
        components: [{ name: '다진 마늘' }, { name: '간장' }, { name: '설탕' }],
      },
    ],
    shoppingLists: [{ id: 'l1', name: '장보기', budgetWon: 80000, items: [] }],
    settings: { activeListId: 'l1' },
    proposalsMeta: { applied: {}, dismissed: {} },
    suggestionsMeta: { dismissed: {} },
  };
}

test('sauce component low/out adds shopping.add; unknown does not', () => {
  const state = baseState([
    { id: 'i1', name: '닭고기', status: 'enough' },
    { id: 'i2', name: '간장', status: 'out', quantity: null, unit: null, category: 'food' },
    { id: 'i3', name: '마늘', status: 'unknown' },
  ]);
  const list = listDinnerCandidates(state);
  const withSauce = list.find((c) => c.sauceId === 's1' && c.protein === '닭고기');
  assert.ok(withSauce);
  assert.ok(withSauce.shoppingNeeds.some((n) => n.name === '간장'));
  assert.equal(
    withSauce.shoppingNeeds.some((n) => /마늘/.test(n.name)),
    false,
    'unknown garlic must not invent shopping',
  );
  assert.ok(withSauce.unknowns.some((u) => /마늘|모름/.test(u)));

  const offer = buildDinnerHomeOffer(state);
  assert.equal(offer.status, 'offer');
  const shopOps = offer.offer.proposal.ops.filter((o) => o.op === 'shopping.add');
  assert.ok(shopOps.some((o) => o.payload.name === '간장'));
  assert.equal(
    shopOps.some((o) => /마늘/.test(o.payload.name)),
    false,
  );
});

test('mealsTodayViewModel mirrors home confirm and offer', () => {
  const state = baseState([{ id: 'i1', name: '고등어', status: 'enough' }]);
  const offerHome = buildDinnerHomeOffer(state);
  const vmOffer = mealsTodayViewModel(offerHome);
  assert.equal(vmOffer.status, 'offer');
  assert.equal(vmOffer.title, offerHome.offer.title);
  assert.equal(vmOffer.protein, offerHome.offer.protein);

  const applied = applyProposal(state, offerHome.offer.proposal);
  assert.equal(applied.ok, true);
  const confirmed = buildDinnerHomeOffer(state);
  assert.equal(confirmed.status, 'confirmed');
  const vm = mealsTodayViewModel(confirmed);
  assert.equal(vm.status, 'confirmed');
  assert.equal(vm.title, state.todayDinner.title);
  assert.equal(vm.protein, state.todayDinner.protein);
});

test('weekDinnerShortages links confirmed low sauce/protein to shopping proposal', () => {
  const state = baseState([
    { id: 'p', name: '닭고기', status: 'out', category: 'food' },
    { id: 'g', name: '간장', status: 'low', quantity: 1, unit: '병', category: 'food' },
  ]);
  state.mealPlan = draftWeek(state);
  // Force first dinner onto our sauce + chicken
  const dinner = state.mealPlan.days[0].slots.find((s) => s.mealType === 'dinner');
  dinner.protein = '닭고기';
  dinner.sauceId = 's1';

  const needs = weekDinnerShortages(state);
  assert.ok(needs.some((n) => n.name === '닭고기'));
  assert.ok(needs.some((n) => n.name === '간장'));

  const proposal = buildWeekShoppingProposal(state);
  assert.ok(proposal);
  assert.ok(proposal.ops.every((o) => o.op === 'shopping.add'));
  const preview = previewProposal(state, proposal);
  assert.equal(preview.ok, true);
  assert.equal(ensureActiveList(state).items.length, 0);

  const applied = applyProposal(state, proposal);
  assert.equal(applied.ok, true);
  const names = ensureActiveList(state).items.map((i) => i.name);
  assert.ok(names.includes('닭고기'));
  assert.ok(names.includes('간장'));

  // Second proposal skips items already on list
  assert.equal(buildWeekShoppingProposal(state), null);
});

test('untracked week protein does not invent shopping qty', () => {
  const state = baseState([]);
  state.mealPlan = draftWeek(state);
  const dinner = state.mealPlan.days[0].slots.find((s) => s.mealType === 'dinner');
  dinner.protein = '존재하지않는고기';
  dinner.sauceId = null;
  assert.deepEqual(weekDinnerShortages(state), []);
  assert.equal(buildWeekShoppingProposal(state), null);
});
