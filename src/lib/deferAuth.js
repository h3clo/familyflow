/**
 * Remember 「잠깐 둘러보기」 across refresh so local dinner/stock work
 * is not interrupted by the auth gate. Cleared on successful login.
 * Not a cloud credential — device preference only.
 */

import { scopedStorageKey } from './storageScope.js';

const DEFER_BASE = 'familyflow-defer-auth';

function deferKey() {
  return scopedStorageKey(DEFER_BASE);
}

export function readDeferAuth() {
  try {
    return localStorage.getItem(deferKey()) === '1';
  } catch {
    return false;
  }
}

export function writeDeferAuth(on) {
  try {
    if (on) localStorage.setItem(deferKey(), '1');
    else localStorage.removeItem(deferKey());
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
