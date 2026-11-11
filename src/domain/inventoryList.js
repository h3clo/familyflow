/**
 * UI-only inventory list helpers (filter / sort). Does not mutate items.
 */
import { LOCATIONS, STATUSES } from './inventory.js';

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

const STATUS_ORDER = Object.fromEntries(STATUSES.map((s, i) => [s.id, i]));
const LOC_ORDER = Object.fromEntries(LOCATIONS.map((l, i) => [l.id, i]));

/**
 * @param {Array<{ name?: string, location?: string, status?: string, updatedAt?: string }>} items
 * @param {{ query?: string, location?: string, status?: string, sort?: string }} opts
 */
export function filterSortInventory(items, opts = {}) {
  const query = String(opts.query || '')
    .trim()
    .toLowerCase();
  const location = opts.location && opts.location !== 'all' ? opts.location : '';
  const status = opts.status && opts.status !== 'all' ? opts.status : '';
  const sort = opts.sort || 'name';

  let list = Array.isArray(items) ? items.slice() : [];
  if (query) {
    list = list.filter((i) => String(i.name || '').toLowerCase().includes(query));
  }
  if (location) list = list.filter((i) => i.location === location);
  if (status) list = list.filter((i) => i.status === status);

  list.sort((a, b) => {
    if (sort === 'status') {
      const d = (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99);
      if (d) return d;
    } else if (sort === 'location') {
      const d = (LOC_ORDER[a.location] ?? 99) - (LOC_ORDER[b.location] ?? 99);
      if (d) return d;
    } else if (sort === 'updated') {
      const d = String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
      if (d) return d;
    }
    return String(a.name || '').localeCompare(String(b.name || ''), 'ko');
  });
  return list;
}

export function statusLabel(statusId) {
  return INV_STATUS_SHORT[statusId] || STATUSES.find((s) => s.id === statusId)?.label || '모름';
}

export function locationLabel(locationId, { short = true } = {}) {
  if (short) return INV_LOC_SHORT[locationId] || locationId || '';
  return LOCATIONS.find((l) => l.id === locationId)?.label || locationId || '';
}
