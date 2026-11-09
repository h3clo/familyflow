import { uid } from '../lib/id.js';

export const LOCATIONS = [
  { id: 'fridge', label: '냉장고' },
  { id: 'freezer', label: '냉동실' },
  { id: 'pantry', label: '실온·팬트리' },
  { id: 'storage', label: '창고' },
];

export const STATUSES = [
  { id: 'enough', label: '충분함' },
  { id: 'low', label: '부족함' },
  { id: 'out', label: '없음' },
  { id: 'unknown', label: '모름' },
];

export function createInventoryItem(partial = {}) {
  const name = String(partial.name || '').trim();
  if (!name) throw new Error('재고 이름이 필요해요.');
  const location = LOCATIONS.some((l) => l.id === partial.location) ? partial.location : 'fridge';
  const status = STATUSES.some((s) => s.id === partial.status) ? partial.status : 'unknown';
  const quantity =
    partial.quantity == null || partial.quantity === ''
      ? null
      : Number(partial.quantity);
  return {
    id: uid(),
    name,
    location,
    status,
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : null,
    unit: String(partial.unit || '').trim() || null,
    category: ['food', 'household', 'other'].includes(partial.category)
      ? partial.category
      : 'other',
    note: String(partial.note || '').slice(0, 200),
    updatedAt: new Date().toISOString(),
  };
}

export function upsertInventory(state, partial) {
  const name = String(partial.name || '').trim();
  const existing = state.inventory.find(
    (x) => x.id === partial.id || (name && x.name === name && x.location === (partial.location || x.location)),
  );
  if (existing) {
    Object.assign(existing, {
      ...partial,
      name: name || existing.name,
      updatedAt: new Date().toISOString(),
    });
    return existing;
  }
  const item = createInventoryItem(partial);
  state.inventory.push(item);
  return item;
}

export function setInventoryStatus(state, id, status) {
  const item = state.inventory.find((x) => x.id === id);
  if (!item) throw new Error('재고를 찾을 수 없어요.');
  if (!STATUSES.some((s) => s.id === status)) throw new Error('상태를 확인해주세요.');
  item.status = status;
  item.updatedAt = new Date().toISOString();
  return item;
}

export function removeInventory(state, id) {
  state.inventory = state.inventory.filter((x) => x.id !== id);
}

/** Low/out items that are not already on the open shopping list. */
export function shoppingSuggestionsFromInventory(state, list) {
  const onList = new Set(list.items.filter((i) => !i.checked).map((i) => i.name));
  return state.inventory
    .filter((x) => (x.status === 'low' || x.status === 'out') && !onList.has(x.name))
    .map((x) => ({
      name: x.name,
      quantity: x.quantity || 1,
      unit: x.unit || '개',
      priority: x.status === 'out' ? 'must' : 'nice',
      category: x.category,
      inventoryId: x.id,
    }));
}

export function applyPurchaseToInventory(state, proposal, { accept }) {
  if (!accept) return null;
  return upsertInventory(state, {
    id: proposal.existingId || undefined,
    name: proposal.name,
    location: proposal.location,
    status: proposal.suggestedStatus || 'enough',
    quantity: proposal.quantity,
    unit: proposal.unit,
    category: proposal.category,
  });
}
