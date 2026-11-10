/**
 * Remember 「잠깐 둘러보기」 across refresh so local dinner/stock work
 * is not interrupted by the auth gate. Cleared on successful login.
 * Not a cloud credential — device preference only.
 */

const KEY = 'familyflow-defer-auth';

export function readDeferAuth() {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function writeDeferAuth(on) {
  try {
    if (on) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore quota / private mode */
  }
}

export function hasLocalHouseholdActivity(state) {
  if (!state) return false;
  if (state.todayDinner) return true;
  if ((state.inventory || []).length) return true;
  const items = (state.shoppingLists || []).flatMap((l) => l.items || []);
  if (items.length) return true;
  if ((state.members || []).length > 1) return true;
  return false;
}
