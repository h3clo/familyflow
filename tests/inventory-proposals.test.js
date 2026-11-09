import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState } from '../src/domain/state.js';
import { seedState } from '../src/domain/seed.js';
import { createInventoryItem } from '../src/domain/inventory.js';
import { ensureActiveList } from '../src/domain/shopping.js';
import { proposalFromInventoryChip } from '../src/domain/inventoryProposals.js';
import { previewProposal, applyProposal } from '../src/domain/proposals.js';

test('inventory chip goes through preview without mutate then apply', () => {
  const state = seedState(createEmptyState());
  const item = createInventoryItem({ name: '휴지', status: 'out', location: 'storage', category: 'household', unit: '롤', quantity: 30 });
  state.inventory.push(item);
  const proposal = proposalFromInventoryChip({
    name: item.name,
    quantity: 30,
    unit: '롤',
    priority: 'must',
    category: 'household',
    inventoryId: item.id,
  });
  assert.equal(proposal.ops[0].op, 'shopping.add');
  const preview = previewProposal(state, proposal);
  assert.equal(preview.ok, true);
  assert.equal(ensureActiveList(state).items.length, 0);
  applyProposal(state, proposal);
  assert.ok(ensureActiveList(state).items.some((i) => i.name === '휴지'));
});
