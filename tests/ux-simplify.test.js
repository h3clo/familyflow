import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState } from '../src/domain/state.js';
import { seedState } from '../src/domain/seed.js';
import { createInventoryItem } from '../src/domain/inventory.js';
import { buildDinnerHomeOffer } from '../src/domain/dinnerHome.js';
import { generateSuggestions } from '../src/domain/suggestions.js';
import { filterSuggestionsAgainstDinnerOffer } from '../src/domain/suggestionFilter.js';
import { applyProposal, createProposal } from '../src/domain/proposals.js';
import { ensureActiveList } from '../src/domain/shopping.js';

function fresh() {
  return seedState(createEmptyState());
}

test('filter drops shopping.add already bundled in dinner offer', () => {
  const state = fresh();
  state.inventory.push(
    createInventoryItem({ name: '간장', status: 'out', location: 'pantry', category: 'food' }),
  );
  const offer = buildDinnerHomeOffer(state);
  assert.equal(offer.status, 'offer');
  assert.ok(offer.offer.proposal.ops.some((o) => o.op === 'shopping.add' && o.payload.name === '간장'));

  const pack = generateSuggestions(state);
  assert.equal(
    pack.suggestions.find((s) => s.ops?.[0]?.payload?.name === '간장'),
    undefined,
    'home cards must not re-ask for sauce already in 이대로',
  );
});

test('after dinner confirm with shopping, navigate stays home (inferNavigate)', () => {
  const state = fresh();
  state.inventory.push(
    createInventoryItem({ name: '간장', status: 'out', location: 'pantry', category: 'food' }),
  );
  const offer = buildDinnerHomeOffer(state);
  const result = applyProposal(state, offer.offer.proposal);
  assert.equal(result.ok, true);
  assert.equal(result.navigate, 'home');
  assert.ok(state.todayDinner);
  assert.ok(ensureActiveList(state).items.some((i) => i.name === '간장'));
});

test('filterSuggestionsAgainstDinnerOffer removes parallel confirm_dinner', () => {
  const state = fresh();
  const fake = [
    createProposal({
      source: 'rules',
      key: 'dup',
      title: 'dup dinner',
      reason: 'x',
      ops: [{ op: 'meals.confirm_dinner', payload: { title: 'x' } }],
    }),
  ];
  assert.equal(filterSuggestionsAgainstDinnerOffer(state, fake).length, 0);
});
