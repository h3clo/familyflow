import { uid } from '../lib/id.js';
import { parseQuickAdd } from './quick-add.js';
import { normalizeCategory } from './categories.js';

export function createShoppingList({ title, budgetWon } = {}) {
  const now = new Date();
  const label =
    title ||
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} 장보기`;
  return {
    id: uid(),
    title: label,
    status: 'open',
    budgetWon: Number.isFinite(budgetWon) ? budgetWon : null,
    items: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

export function ensureActiveList(state) {
  let list = state.shoppingLists.find((l) => l.id === state.settings.activeListId);
  if (!list) {
    list = createShoppingList({ budgetWon: state.household.budgetWon });
    state.shoppingLists.unshift(list);
    state.settings.activeListId = list.id;
  }
  if (list.budgetWon == null) list.budgetWon = state.household.budgetWon;
  return list;
}

export function addShoppingItem(list, partial) {
  const item = normalizeItem(partial);
  list.items.push(item);
  list.updatedAt = new Date().toISOString();
  return item;
}

export function addFromQuickText(list, text) {
  const parsed = parseQuickAdd(text);
  if (!parsed) throw new Error('무엇을 살지 이름이나 ‘휴지 30롤’처럼 적어주세요.');
  return addShoppingItem(list, {
    ...parsed,
    checked: false,
  });
}

export function updateShoppingItem(list, id, patch) {
  const item = list.items.find((x) => x.id === id);
  if (!item) throw new Error('항목을 찾을 수 없어요.');
  Object.assign(item, normalizePatch(patch));
  list.updatedAt = new Date().toISOString();
  return item;
}

export function removeShoppingItem(list, id) {
  const before = list.items.length;
  list.items = list.items.filter((x) => x.id !== id);
  if (list.items.length === before) throw new Error('항목을 찾을 수 없어요.');
  list.updatedAt = new Date().toISOString();
}

export function toggleShoppingItem(list, id, checked) {
  const item = list.items.find((x) => x.id === id);
  if (!item) throw new Error('항목을 찾을 수 없어요.');
  item.checked = typeof checked === 'boolean' ? checked : !item.checked;
  item.checkedAt = item.checked ? new Date().toISOString() : null;
  list.updatedAt = new Date().toISOString();
  return item;
}

export function shoppingTotals(list) {
  const open = list.items.filter((i) => !i.checked);
  const checked = list.items.filter((i) => i.checked);
  const sum = (rows) =>
    rows.reduce((n, i) => n + (Number.isFinite(i.estimatedPrice) ? i.estimatedPrice : 0), 0);
  const known = (rows) => rows.filter((i) => Number.isFinite(i.estimatedPrice)).length;
  return {
    count: list.items.length,
    openCount: open.length,
    checkedCount: checked.length,
    mustOpen: open.filter((i) => i.priority === 'must').length,
    estimatedOpen: sum(open),
    estimatedChecked: sum(checked),
    estimatedAll: sum(list.items),
    pricedOpen: known(open),
    budgetWon: list.budgetWon,
    overBudget: list.budgetWon != null && sum(open) > list.budgetWon,
  };
}

export function sortShoppingItems(items) {
  const rank = { must: 0, nice: 1 };
  return [...items].sort((a, b) => {
    if (a.checked !== b.checked) return a.checked ? 1 : -1;
    if (rank[a.priority] !== rank[b.priority]) return rank[a.priority] - rank[b.priority];
    return a.name.localeCompare(b.name, 'ko');
  });
}

function normalizeItem(partial) {
  const name = String(partial.name || '').trim();
  if (!name) throw new Error('품목 이름이 필요해요.');
  const quantity = Number(partial.quantity);
  return {
    id: uid(),
    name,
    quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    unit: String(partial.unit || '개').trim() || '개',
    priority: partial.priority === 'nice' ? 'nice' : 'must',
    category: normalizeCategory(partial.category),
    estimatedPrice:
      partial.estimatedPrice == null || partial.estimatedPrice === ''
        ? null
        : Math.max(0, Math.round(Number(partial.estimatedPrice)) || null),
    note: String(partial.note || '').slice(0, 200),
    checked: !!partial.checked,
    checkedAt: partial.checked ? new Date().toISOString() : null,
    inventoryId: partial.inventoryId || null,
    sourceText: partial.sourceText || '',
    createdAt: new Date().toISOString(),
  };
}

function normalizePatch(patch) {
  const out = { ...patch };
  if (out.name != null) out.name = String(out.name).trim();
  if (out.quantity != null) {
    const q = Number(out.quantity);
    out.quantity = Number.isFinite(q) && q > 0 ? q : 1;
  }
  if (out.priority != null) out.priority = out.priority === 'nice' ? 'nice' : 'must';
  if (out.estimatedPrice === '' || out.estimatedPrice == null) out.estimatedPrice = null;
  else if (out.estimatedPrice != null) out.estimatedPrice = Math.max(0, Math.round(Number(out.estimatedPrice)) || 0);
  if (out.note != null) out.note = String(out.note).slice(0, 200);
  delete out.id;
  delete out.createdAt;
  return out;
}

/** After checkout: propose inventory updates for checked items. */
export function inventoryProposalsFromChecked(list, inventory) {
  return list.items
    .filter((i) => i.checked)
    .map((i) => {
      const existing = inventory.find(
        (x) => x.name === i.name || (i.inventoryId && x.id === i.inventoryId),
      );
      return {
        shoppingItemId: i.id,
        name: i.name,
        quantity: i.quantity,
        unit: i.unit,
        category: i.category,
        existingId: existing?.id || null,
        suggestedStatus: 'enough',
        location: existing?.location || guessLocation(i.category),
      };
    });
}

function guessLocation(category) {
  if (category === 'household' || category === 'snack') return 'pantry';
  return 'fridge';
}
