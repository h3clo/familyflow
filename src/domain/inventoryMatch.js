/**
 * Loose inventory name matching for sauce components and week shortages.
 * Never invents stock: missing/unknown → disclose only; shop only for confirmed low/out.
 * Never invents buy quantity: low/out is a signal only; remaining stock qty ≠ purchase need.
 */

export function normalizeItemName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

/** Drop optional markers and parenthetical notes from a component label. */
export function stripComponentDecorators(name) {
  return String(name || '')
    .replace(/\(선택\)/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Common prep prefixes in seed sauce components → also try bare pantry name. */
const PREP_PREFIX_RE = /^(다진|갈아낸|생|채썬|썬)\s+/;

/**
 * Expand "꿀 또는 올리고당" / prep prefixes into exact-match candidates.
 * No substring containment — avoids 간장↔국간장, 참기름↔들기름 false hits.
 */
export function componentNameCandidates(rawName) {
  const base = stripComponentDecorators(rawName);
  if (!base) return [];
  const parts = base
    .split(/\s*또는\s*|\s*[/／]\s*|\s*[·・]\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  const out = [];
  const push = (p) => {
    if (p && !out.includes(p)) out.push(p);
  };
  push(base);
  for (const p of parts) {
    push(p);
    const stripped = p.replace(PREP_PREFIX_RE, '').trim();
    push(stripped);
  }
  return out;
}

export function isOptionalComponent(rawName) {
  return /\(선택\)/.test(String(rawName || ''));
}

/**
 * Find inventory row by exact normalized name (including prep-stripped / 또는 candidates).
 * Does not use partial substring matching.
 * @returns {object|null}
 */
export function findInventoryByName(state, queryName) {
  const inventory = state?.inventory || [];
  if (!inventory.length) return null;
  const candidates = componentNameCandidates(queryName);
  for (const cand of candidates) {
    const key = normalizeItemName(cand);
    if (!key) continue;
    const exact = inventory.find((i) => normalizeItemName(i.name) === key);
    if (exact) return exact;
  }
  return null;
}

/**
 * Resolve one sauce's components against inventory.
 * status: enough | low | out | unknown | missing
 * optional components never become shopping needs when missing.
 */
export function resolveSauceComponentStatuses(state, sauce) {
  const components = sauce?.components || [];
  return components.map((c) => {
    const name = String(c?.name || '').trim();
    const optional = isOptionalComponent(name) || isOptionalComponent(c?.prep);
    if (!name) {
      return { name: '', status: 'missing', inventoryId: null, optional: true, item: null };
    }
    const item = findInventoryByName(state, name);
    if (!item) {
      return { name, status: 'missing', inventoryId: null, optional, item: null };
    }
    const status = ['enough', 'low', 'out', 'unknown'].includes(item.status)
      ? item.status
      : 'unknown';
    return {
      name,
      status,
      inventoryId: item.id,
      optional,
      item,
      matchedName: item.name,
    };
  });
}

/**
 * Build shopping need rows from protein + sauce component statuses.
 * Only confirmed low/out. Quantity is always null here:
 * remaining inventory qty is not a purchase need, and we do not invent 1.
 * Unit may come from the inventory row when present (label only).
 */
export function shoppingNeedsFromStatuses(rows, { guessUnit } = {}) {
  const needs = [];
  const seen = new Set();
  for (const row of rows || []) {
    if (!row || (row.status !== 'low' && row.status !== 'out')) continue;
    if (row.optional) continue;
    const name = String(row.matchedName || row.name || '').trim();
    if (!name) continue;
    const key = normalizeItemName(name);
    if (seen.has(key)) continue;
    seen.add(key);
    const unit =
      (row.item?.unit && String(row.item.unit).trim()) ||
      (typeof guessUnit === 'function' ? guessUnit(name) : null) ||
      null;
    needs.push({
      name,
      quantity: null,
      unit,
      inventoryId: row.inventoryId || null,
      status: row.status,
      priority: row.status === 'out' ? 'must' : 'nice',
      category: row.item?.category || 'food',
    });
  }
  return needs;
}

/**
 * Protein-shaped status row for shoppingNeedsFromStatuses.
 */
export function proteinStatusRow(source) {
  if (!source) return null;
  return {
    name: source.name,
    matchedName: source.name,
    status: source.stockStatus,
    inventoryId: source.inventoryId,
    optional: false,
    item:
      source.stockStatus === 'low' || source.stockStatus === 'out'
        ? { quantity: null, unit: null, category: 'food' }
        : null,
  };
}
