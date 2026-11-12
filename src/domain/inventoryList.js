/**
 * UI-only inventory list helpers. Does not mutate item records except via
 * explicit repair helpers that only upgrade auto-`other` categories.
 */
import { LOCATIONS, STATUSES } from './inventory.js';
import { inferCategory } from './quick-add.js';
import { normalizeCategory } from './categories.js';

export const INV_STATUS_SHORT = {
  enough: '충분',
  low: '부족',
  out: '없음',
  unknown: '모름',
};

export const INV_LOC_SHORT = {
  fridge: '냉장',
  freezer: '냉동',
  pantry: '실온',
  storage: '창고',
};

/**
 * @param {Array<{ name?: string, location?: string, status?: string }>} items
 * @param {{ query?: string }} opts
 */
export function filterInventory(items, opts = {}) {
  const query = String(opts.query || '')
    .trim()
    .toLowerCase();
  let list = Array.isArray(items) ? items.slice() : [];
  if (query) {
    list = list.filter((i) => String(i.name || '').toLowerCase().includes(query));
  }
  list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ko'));
  return list;
}

/** @deprecated use filterInventory */
export function filterSortInventory(items, opts = {}) {
  return filterInventory(items, opts);
}

/**
 * Group by location; groups with fewer items come first.
 * Empty locations are omitted.
 * @param {Array<{ location?: string }>} items
 */
export function groupInventoryByLocation(items) {
  const buckets = new Map(LOCATIONS.map((l) => [l.id, []]));
  for (const item of items || []) {
    const loc = LOCATIONS.some((l) => l.id === item.location) ? item.location : 'fridge';
    if (!buckets.has(loc)) buckets.set(loc, []);
    buckets.get(loc).push(item);
  }
  return LOCATIONS.map((l) => ({
    id: l.id,
    label: l.label,
    shortLabel: INV_LOC_SHORT[l.id] || l.label,
    items: (buckets.get(l.id) || []).slice().sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), 'ko'),
    ),
  }))
    .filter((g) => g.items.length > 0)
    .sort((a, b) => a.items.length - b.items.length || a.label.localeCompare(b.label, 'ko'));
}

export function statusLabel(statusId) {
  return INV_STATUS_SHORT[statusId] || STATUSES.find((s) => s.id === statusId)?.label || '모름';
}

export function locationLabel(locationId, { short = true } = {}) {
  if (short) return INV_LOC_SHORT[locationId] || locationId || '';
  return LOCATIONS.find((l) => l.id === locationId)?.label || locationId || '';
}

/** Name with qty when known — never invent a quantity. */
export function formatInventoryNameQty(item) {
  const name = String(item?.name || '').trim();
  if (!name) return '';
  if (item.quantity == null || item.quantity === '') return name;
  const q = Number(item.quantity);
  if (!Number.isFinite(q)) return name;
  const unit = String(item.unit || '').trim();
  return unit ? `${name} ${q}${unit}` : `${name} ${q}`;
}

/**
 * Upgrade only auto-`other` rows when the name now maps to a real category.
 * Leaves snack/household/food (and explicit choices) untouched.
 * @returns {number} count changed
 */
export function repairOtherCategories(inventory) {
  let changed = 0;
  for (const item of inventory || []) {
    if (normalizeCategory(item.category) !== 'other') continue;
    const inferred = inferCategory(item.name);
    if (inferred === 'other') continue;
    item.category = inferred;
    item.updatedAt = new Date().toISOString();
    changed += 1;
  }
  return changed;
}
