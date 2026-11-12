import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDinnerHomeOffer,
  formatDinnerOfferTitle,
  listDinnerCandidates,
  uniqueByPatternSauce,
  uniqueDinnerSwapList,
  diversifySwapOrder,
  STARTER_PROTEINS,
} from '../src/domain/dinnerHome.js';
import { resolveDinnerVisual } from '../src/domain/dinnerVisual.js';
import { previewProposal, applyProposal } from '../src/domain/proposals.js';
import { createEmptyState } from '../src/domain/state.js';
import { seedState } from '../src/domain/seed.js';

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
    sauces: [{ id: 's1', name: '간장마늘 양념', forPatterns: ['야채구이'] }],
    shoppingLists: [{ id: 'l1', name: '장보기', budgetWon: 80000, items: [] }],
    settings: { activeListId: 'l1' },
    proposalsMeta: { applied: {}, dismissed: {} },
    suggestionsMeta: { dismissed: {} },
  };
}

test('offers starter dinners when inventory is empty', () => {
  const offer = buildDinnerHomeOffer(baseState([]));
  assert.equal(offer.status, 'offer');
  assert.equal(offer.offer.stockStatus, 'untracked');
  assert.equal(offer.offer.inventoryId, null);
  assert.ok(offer.offer.reasons.some((r) => /재고 미확인/.test(r)));
  assert.equal(offer.offer.stockLabel, '재고 미확인 · 가정 제안');
  assert.equal(offer.offer.proposal.ops[0].op, 'meals.confirm_dinner');
  assert.equal(offer.offer.proposal.ops.some((o) => o.op.startsWith('inventory.')), false);
});

test('unknown-only inventory still gets starter dinners (does not treat unknown as stock)', () => {
  const offer = buildDinnerHomeOffer(
    baseState([{ id: 'i1', name: '고등어', status: 'unknown' }]),
  );
  assert.equal(offer.status, 'offer');
  assert.equal(offer.offer.stockStatus, 'untracked');
  assert.ok(!offer.offer.reasons.some((r) => /재고: 고등어/.test(r)));
});

test('still offers protein-only starters when patterns are missing', () => {
  const state = baseState([]);
  state.cookingPatterns = [];
  const offer = buildDinnerHomeOffer(state);
  assert.equal(offer.status, 'offer');
  assert.equal(offer.offer.stockStatus, 'untracked');
  assert.ok(offer.offer.protein);
});

test('offers dinner from enough protein with 이대로 proposal', () => {
  const state = baseState([
    { id: 'i1', name: '고등어', status: 'enough' },
    { id: 'i2', name: '닭고기', status: 'enough' },
  ]);
  const offer = buildDinnerHomeOffer(state, { altIndex: 0 });
  assert.equal(offer.status, 'offer');
  assert.ok(offer.offer.protein === '고등어' || offer.offer.protein === '닭고기');
  // Title is pattern×sauce (matches hero photo); protein stays a pairing field.
  assert.ok(!offer.offer.title.includes(offer.offer.protein));
  assert.ok(offer.offer.sauceName);
  assert.ok(offer.offer.title.includes('야채'));
  assert.ok(offer.offer.reasons.some((r) => /재고/.test(r)));
  assert.equal(offer.offer.proposal.ops[0].op, 'meals.confirm_dinner');
  const preview = previewProposal(state, offer.offer.proposal);
  assert.equal(preview.ok, true);
  assert.equal(state.todayDinner, null);
});

test('formatDinnerOfferTitle is pattern only (sauce/protein live in chips)', () => {
  assert.equal(
    formatDinnerOfferTitle({
      patternName: '야채구이',
      sauceName: '간장마늘 양념',
      protein: '고등어',
    }),
    '야채구이',
  );
  assert.equal(
    formatDinnerOfferTitle({ patternName: '야채찜', sauceName: '부추장', protein: '닭고기' }),
    '야채찜',
  );
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
  assert.notEqual(a.offer.key, b.offer.key);
});

test('roast/steam catalogs expose garlic sauces for chicken stock', () => {
  const state = baseState([{ id: 'i1', name: '닭고기', status: 'enough' }]);
  state.sauces = [
    { id: 's1', name: '토마토 양파 소스', forPatterns: ['야채구이'] },
    { id: 's2', name: '간장마늘 양념', forPatterns: ['야채구이'] },
    { id: 's3', name: '마늘 간장 소스', forPatterns: ['야채찜'] },
  ];
  const list = listDinnerCandidates(state);
  assert.ok(list.some((c) => c.patternName === '야채구이' && c.sauceName === '간장마늘 양념'));
  assert.ok(list.some((c) => c.patternName === '야채찜' && c.sauceName === '마늘 간장 소스'));
});

test('starter swap list is unique pattern×sauce photos including shabu', () => {
  const state = seedState(createEmptyState());
  const swap = uniqueDinnerSwapList(state, listDinnerCandidates(state));
  const files = swap.map(
    (c) => (resolveDinnerVisual(state, c).imageSrc || '').replace(/\?.*$/, '').split('/').pop(),
  );
  assert.equal(files.length, new Set(files).size, `duplicate hero files in swap: ${files}`);
  assert.ok(files.length >= 10, `expected many prebakes in rotation, got ${files}`);
  assert.ok(files.some((f) => f.startsWith('shabu')));
  assert.ok(swap.some((c) => c.patternName === '샤브샤브'));
  assert.ok(swap.every((c) => c.title === c.patternName));
  // Consecutive taps should usually change pattern (avoid five 구이 in a row).
  let samePat = 0;
  for (let i = 1; i < swap.length; i++) {
    if (swap[i].patternName === swap[i - 1].patternName) samePat += 1;
  }
  assert.ok(samePat <= 3, `swap still clumps patterns (${samePat} adjacent same): ${swap.map((c) => c.patternName)}`);
  assert.deepEqual(
    STARTER_PROTEINS,
    ['닭다리살', '연어', '고등어', '우삼겹', '대패삼겹살', '목살'],
  );
});

test('diversifySwapOrder prefers alternating patterns', () => {
  const rows = [
    { patternName: '야채구이', sauceName: 'a', score: { total: 1 } },
    { patternName: '야채구이', sauceName: 'b', score: { total: 0.9 } },
    { patternName: '야채구이', sauceName: 'c', score: { total: 0.8 } },
    { patternName: '야채찜', sauceName: 'd', score: { total: 0.7 } },
    { patternName: '샤브샤브', sauceName: 'e', score: { total: 0.95 } },
  ];
  const out = diversifySwapOrder(rows);
  assert.equal(out[0].patternName, '야채구이');
  assert.notEqual(out[1].patternName, '야채구이');
});

test('swap does not collapse unrelated patterns onto sauces[0]', () => {
  const state = baseState([{ id: 'i1', name: '목살', status: 'enough' }]);
  // Mimic broken catalog: sauces exist but forPatterns empty → old code used sauces[0].
  state.sauces = [
    { id: 's-bad', name: '부추장', forPatterns: [], visualKey: 'buchujang' },
    { id: 's-ok', name: '간장마늘 양념', forPatterns: ['야채구이'], visualKey: 'garlic-soy' },
  ];
  state.cookingPatterns = [
    { id: 'p-roast', name: '야채구이', method: 'roast', effort: 'medium' },
    { id: 'p-steam', name: '야채찜', method: 'steam', effort: 'medium' },
  ];
  const list = listDinnerCandidates(state);
  assert.ok(list.some((c) => c.patternName === '야채구이' && c.sauceName === '간장마늘 양념'));
  assert.ok(list.some((c) => c.patternName === '야채찜' && !c.sauceName));
  assert.equal(
    list.some((c) => c.patternName === '야채구이' && c.sauceName === '부추장'),
    false,
  );
});

test('single tracked protein does not lock every swap 곁들임', () => {
  const state = seedState(createEmptyState());
  state.inventory = [{ id: 'i1', name: '고등어', status: 'enough', location: 'fridge', category: 'food' }];
  const swap = uniqueDinnerSwapList(state, listDinnerCandidates(state));
  const proteins = [...new Set(swap.map((c) => c.protein))];
  assert.ok(proteins.includes('고등어'));
  assert.ok(proteins.length >= 3, `expected varied 곁들임, got ${proteins.join(',')}`);
});

test('out-of-stock protein includes shopping.add in proposal', () => {
  const state = baseState([{ id: 'i1', name: '고등어', status: 'out' }]);
  const withFish = listDinnerCandidates(state).find((c) => c.protein === '고등어');
  assert.ok(withFish);
  assert.ok(withFish.shoppingNeeds?.some((n) => n.name === '고등어'));
  // Swap may start on a starter 곁들임; find the 고등어 slot via altIndex.
  const swap = uniqueDinnerSwapList(state, listDinnerCandidates(state));
  const idx = swap.findIndex((c) => c.protein === '고등어');
  assert.ok(idx >= 0);
  const offer = buildDinnerHomeOffer(state, { altIndex: idx });
  assert.equal(offer.status, 'offer');
  assert.ok(offer.offer.proposal.ops.some((op) => op.op === 'shopping.add' && op.payload.name === '고등어'));
});

test('이대로 apply confirms dinner after preview', () => {
  const state = baseState([{ id: 'i1', name: '계란', status: 'enough' }]);
  const offer = buildDinnerHomeOffer(state);
  const applied = applyProposal(state, offer.offer.proposal);
  assert.equal(applied.ok, true);
  assert.ok(state.todayDinner);
  assert.equal(buildDinnerHomeOffer(state).status, 'confirmed');
});

test('listDinnerCandidates still prefers enough over out when effort/recent match', () => {
  const list = listDinnerCandidates(
    baseState([
      { id: 'a', name: '닭고기', status: 'out' },
      { id: 'b', name: '고등어', status: 'enough' },
    ]),
  );
  const topFish = list.find((c) => c.protein === '고등어');
  const topChicken = list.find((c) => c.protein === '닭고기');
  assert.ok(topFish.score.total > topChicken.score.total);
});
