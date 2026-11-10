import { createProposal } from './proposals.js';
import { normalizeCategory } from './categories.js';

/** Build ActionProposal for shopping-tab inventory chips. */
export function proposalFromInventoryChip(suggestion) {
  const name = String(suggestion?.name || '').trim();
  if (!name) throw new Error('품목 이름이 없어요.');
  const quantity = Number(suggestion.quantity);
  const qty = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
  const unit = String(suggestion.unit || '개').trim() || '개';
  const priority = suggestion.priority === 'nice' ? 'nice' : 'must';
  const category = normalizeCategory(suggestion.category);
  const inventoryId = suggestion.inventoryId || null;

  return createProposal({
    source: 'rules',
    key: inventoryId ? `shop-chip-${inventoryId}` : `shop-chip-name-${name}`,
    priority: priority === 'must' ? 12 : 22,
    title: `${name} 장보기 추가`,
    reason: '재고 상태를 보고 장보기 목록에 넣을지 미리보기합니다. 승인 전에는 저장되지 않아요.',
    actionLabel: '변경 미리보기',
    ops: [
      {
        op: 'shopping.add',
        payload: {
          name,
          quantity: qty,
          unit,
          priority,
          category,
          inventoryId,
        },
      },
    ],
  });
}
