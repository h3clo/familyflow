/**
 * Shared shopping / inventory category vocabulary.
 * Keep in sync with supabase check constraints (see migrations).
 */

export const CATEGORIES = [
  { id: 'food', label: '식재료' },
  { id: 'snack', label: '간식' },
  { id: 'household', label: '생활용품' },
  { id: 'other', label: '기타' },
];

const IDS = new Set(CATEGORIES.map((c) => c.id));

export function normalizeCategory(raw, fallback = 'other') {
  const id = String(raw || '').trim();
  return IDS.has(id) ? id : fallback;
}

export function categoryLabel(id) {
  return CATEGORIES.find((c) => c.id === id)?.label || '기타';
}

export function categoryOptionsHtml(selected = 'food') {
  const sel = normalizeCategory(selected, 'food');
  return CATEGORIES.map(
    (c) => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${c.label}</option>`,
  ).join('');
}
