import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseFamilyPreferenceNotes,
  scoreDinnerCandidate,
  compareDinnerScores,
  resolvePreferenceMatch,
  DINNER_RANK_WEIGHTS,
} from '../src/domain/dinnerRank.js';
import {
  listDinnerCandidates,
  UNTRACKED_STOCK_LABEL,
  buildDinnerHomeOffer,
  createStockRegisterProposalFromUserInput,
} from '../src/domain/dinnerHome.js';
import { previewProposal, applyProposal } from '../src/domain/proposals.js';

function baseState(partial = {}) {
  return {
    household: { name: '우리집', budgetWon: 80000 },
    todayDinner: null,
    mealPlan: null,
    members: [],
    inventory: [],
    cookingPatterns: [
      { id: 'p-steam', name: '야채찜', method: 'steam', effort: 'medium' },
      { id: 'p-roast', name: '야채구이', method: 'roast', effort: 'medium' },
      { id: 'p-easy', name: '간단구이', method: 'roast', effort: 'low' },
    ],
    sauces: [
      { id: 's1', name: '마늘간장 소스', forPatterns: ['야채찜', '야채구이', '간단구이'] },
    ],
    shoppingLists: [{ id: 'l1', name: '장보기', budgetWon: 80000, items: [] }],
    settings: { activeListId: 'l1' },
    proposalsMeta: { applied: {}, dismissed: {} },
    suggestionsMeta: { dismissed: {} },
    ...partial,
  };
}

test('weights are balanced (no absolute stock > effort hierarchy)', () => {
  const values = Object.values(DINNER_RANK_WEIGHTS);
  assert.equal(values.length, 4);
  const max = Math.max(...values);
  const min = Math.min(...values);
  assert.ok(max - min < 0.15, 'weights should stay near-equal so one signal cannot dominate by fiat');
  assert.equal(DINNER_RANK_WEIGHTS.stock, DINNER_RANK_WEIGHTS.effort);
  assert.equal(DINNER_RANK_WEIGHTS.stock, DINNER_RANK_WEIGHTS.recent);
});

test('low-effort menu ranks above medium-effort when stock/recent match', () => {
  const prefs = { likes: [], dislikes: [] };
  const low = scoreDinnerCandidate(
    { stockStatus: 'enough', effort: 'low', protein: '닭고기', patternName: '간단구이', recent: false },
    prefs,
  );
  const mid = scoreDinnerCandidate(
    { stockStatus: 'enough', effort: 'medium', protein: '닭고기', patternName: '야채구이', recent: false },
    prefs,
  );
  assert.ok(low.total > mid.total, `expected low ${low.total} > mid ${mid.total}`);
});

test('not-recent menu ranks above recently eaten when stock/effort match', () => {
  const prefs = { likes: [], dislikes: [] };
  const fresh = scoreDinnerCandidate(
    { stockStatus: 'enough', effort: 'medium', protein: '두부', patternName: '야채찜', recent: false },
    prefs,
  );
  const recent = scoreDinnerCandidate(
    { stockStatus: 'enough', effort: 'medium', protein: '닭고기', patternName: '야채찜', recent: true },
    prefs,
  );
  assert.ok(fresh.total > recent.total, `expected fresh ${fresh.total} > recent ${recent.total}`);
});

test('listDinnerCandidates surfaces low-effort and not-recent above opposite poles', () => {
  const state = baseState({
    inventory: [
      { id: 'i1', name: '닭고기', status: 'enough', location: 'freezer' },
      { id: 'i2', name: '두부', status: 'enough', location: 'fridge' },
    ],
    mealPlan: {
      days: [
        {
          date: '2026-11-09',
          slots: [{ mealType: 'dinner', protein: '닭고기', title: '어제 닭' }],
        },
      ],
    },
  });

  const list = listDinnerCandidates(state);
  assert.ok(list.length >= 2);

  // Low-effort 간단구이·두부 (not recent) should beat medium 야채구이·닭고기 (recent)
  // even though both are enough stock — proves no absolute stock-only order.
  const easyTofu = list.find((c) => c.protein === '두부' && c.patternName === '간단구이');
  const recentChicken = list.find((c) => c.protein === '닭고기' && c.patternName === '야채구이');
  assert.ok(easyTofu, 'low-effort tofu candidate missing');
  assert.ok(recentChicken, 'recent chicken candidate missing');
  assert.ok(
    easyTofu.score.total > recentChicken.score.total,
    `easy tofu ${easyTofu.score.total} should beat recent chicken ${recentChicken.score.total}`,
  );
  assert.ok(
    list.indexOf(easyTofu) < list.indexOf(recentChicken),
    'low-effort + not-recent should appear higher in the list',
  );
});

test('enough still can beat out when other signals are equal (soft stock signal)', () => {
  const a = { title: 'a', score: scoreDinnerCandidate({ stockStatus: 'enough', effort: 'medium', recent: false }, {}) };
  const b = { title: 'b', score: scoreDinnerCandidate({ stockStatus: 'out', effort: 'medium', recent: false }, {}) };
  assert.ok(compareDinnerScores(a, b) < 0 || a.score.total > b.score.total);
  assert.ok(a.score.total > b.score.total);
});

test('parseFamilyPreferenceNotes reads explicit tags only', () => {
  const prefs = parseFamilyPreferenceNotes([
    { note: '장보기 담당' },
    { note: '좋아함:닭,야채찜 / 싫어함:고등어' },
  ]);
  assert.deepEqual(prefs.likes.sort(), ['닭', '야채찜'].sort());
  assert.deepEqual(prefs.dislikes, ['고등어']);
});

test('untracked offer labels clearly and does not prebuild enough/qty=1 proposal', () => {
  const offer = buildDinnerHomeOffer(baseState({ inventory: [] }));
  assert.equal(offer.status, 'offer');
  assert.equal(offer.offer.stockLabel, UNTRACKED_STOCK_LABEL);
  assert.ok(offer.offer.reasons.includes(UNTRACKED_STOCK_LABEL));
  assert.equal(offer.offer.canRegisterStock, true);
  assert.equal(offer.offer.stockRegisterProposal, undefined);
  assert.equal(offer.offer.proposal.ops.some((o) => o.op === 'inventory.upsert'), false);
});

test('stock register rejects missing status/location (no estimated defaults)', () => {
  const missing = createStockRegisterProposalFromUserInput({
    name: '닭고기',
    status: '',
    location: 'fridge',
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.proposal, null);

  const noLoc = createStockRegisterProposalFromUserInput({
    name: '닭고기',
    status: 'enough',
    location: '',
  });
  assert.equal(noLoc.ok, false);

  // Forbidden: blank input must never become enough + quantity 1
  const blankish = createStockRegisterProposalFromUserInput({ name: '닭고기' });
  assert.equal(blankish.ok, false);
  assert.equal(blankish.proposal, null);

  const ok = createStockRegisterProposalFromUserInput({
    name: '닭고기',
    status: 'low',
    location: 'freezer',
    quantity: '',
    unit: '',
  });
  assert.equal(ok.ok, true);
  const payload = ok.proposal.ops[0].payload;
  assert.equal(payload.status, 'low');
  assert.equal(payload.location, 'freezer');
  assert.equal('quantity' in payload, false);
  assert.equal('unit' in payload, false);
  assert.notEqual(payload.status, 'enough');
  assert.notEqual(payload.quantity, 1);
});

test('cancel path: without applyProposal inventory stays unchanged', () => {
  const state = baseState({ inventory: [] });
  const before = structuredClone(state.inventory);
  const built = createStockRegisterProposalFromUserInput({
    name: '고등어',
    status: 'enough',
    location: 'fridge',
    quantity: 2,
    unit: '마리',
  });
  assert.equal(built.ok, true);
  const preview = previewProposal(state, built.proposal);
  assert.equal(preview.ok, true);
  // User cancels — never call applyProposal
  assert.deepEqual(state.inventory, before);
  assert.equal(state.inventory.length, 0);
});

test('preference dislike lowers score without schema columns', () => {
  const liked = scoreDinnerCandidate(
    { stockStatus: 'enough', effort: 'medium', protein: '닭고기', patternName: '야채찜', recent: false },
    { likes: ['닭'], dislikes: [] },
  );
  const hated = scoreDinnerCandidate(
    { stockStatus: 'enough', effort: 'medium', protein: '고등어', patternName: '야채찜', recent: false },
    { likes: [], dislikes: ['고등어'] },
  );
  assert.ok(liked.total > hated.total);
});

test('member like vs dislike conflict does not auto-pick either side', () => {
  const prefs = parseFamilyPreferenceNotes([
    { note: '좋아함:닭' },
    { note: '싫어함:닭고기' },
  ]);
  // '닭' is substring match on 닭고기; conflict tokens may differ — score via resolve
  const match = resolvePreferenceMatch(
    { protein: '닭고기', patternName: '야채찜' },
    { likes: ['닭'], dislikes: ['닭'] },
  );
  assert.equal(match.kind, 'conflict');
  assert.ok(match.signal > 0.05 && match.signal < 1);

  const scored = scoreDinnerCandidate(
    { stockStatus: 'enough', effort: 'medium', protein: '닭고기', patternName: '야채찜', recent: false },
    { likes: ['닭'], dislikes: ['닭'] },
  );
  assert.equal(scored.preferenceKind, 'conflict');

  const list = listDinnerCandidates(
    baseState({
      inventory: [{ id: 'i1', name: '닭고기', status: 'enough', location: 'freezer' }],
      members: [{ note: '좋아함:닭' }, { note: '싫어함:닭' }],
    }),
  );
  assert.ok(list.some((c) => c.reasons.some((r) => /선호 충돌/.test(r))));
});

test('recent duplication signal is protein-only (pattern repeat alone does not mark recent)', () => {
  const state = baseState({
    inventory: [
      { id: 'i1', name: '닭고기', status: 'enough', location: 'freezer' },
      { id: 'i2', name: '두부', status: 'enough', location: 'fridge' },
    ],
    mealPlan: {
      days: [
        {
          date: '2026-11-09',
          slots: [{ mealType: 'dinner', protein: '닭고기', patternName: '야채찜', title: '어제' }],
        },
      ],
    },
  });
  const list = listDinnerCandidates(state);
  const chickenSteam = list.find((c) => c.protein === '닭고기' && c.patternName === '야채찜');
  const tofuSteam = list.find((c) => c.protein === '두부' && c.patternName === '야채찜');
  assert.equal(chickenSteam.recent, true);
  assert.equal(tofuSteam.recent, false);
});
