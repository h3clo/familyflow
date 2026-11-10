/**
 * Cloud bootstrap helpers — decide auto push/pull vs preview approval.
 * Pure where possible so household switch / footprint rules are unit-tested.
 */

import { createEmptyState, migrateState } from '../domain/state.js';
import { seedState } from '../domain/seed.js';
import { ensureActiveList } from '../domain/shopping.js';

const DEFAULT_MEMBER_NAMES = new Set(['나', '관리자']);
const SEED_PATTERN_NAMES = ['간단 아침', '야채구이', '야채찜'];
const SEED_SAUCE_NAMES = [
  '마늘간장 소스',
  '부추장',
  '스리라차',
  '양꼬치 시즈닝',
  '닭 양념 (마늘간장설탕)',
  '토마토소스',
].sort();

/**
 * Footprint of sync-relevant household data (and local kitchen catalog).
 * Cooking patterns / sauces are device catalog today (no cloud table) but still
 * counted so bootstrap never ignores them when deciding risk.
 */
export function buildSyncableFootprint(state) {
  const list = state?.shoppingLists?.[0] || { items: [] };
  const shopping = (list.items || []).length;
  const inventory = (state?.inventory || []).length;
  const mealPlan = state?.mealPlan ? 1 : 0;
  const todayDinner = state?.todayDinner ? 1 : 0;
  const familyProfiles = countMeaningfulMembers(state?.members);
  const cookingPatterns = (state?.cookingPatterns || []).length;
  const sauces = (state?.sauces || []).length;
  const catalogCustomized = isKitchenCatalogCustomized(state);

  const transactional =
    shopping + inventory + mealPlan + todayDinner + familyProfiles;
  const catalog = cookingPatterns + sauces;

  return {
    shopping,
    inventory,
    mealPlan,
    todayDinner,
    familyProfiles,
    cookingPatterns,
    sauces,
    catalogCustomized,
    transactional,
    catalog,
    total: transactional + (catalogCustomized ? catalog : 0),
  };
}

export function footprintHasTransactional(fp) {
  return (Number(fp?.transactional) || 0) > 0;
}

export function footprintIsEmpty(fp) {
  return !footprintHasTransactional(fp) && !fp?.catalogCustomized;
}

/**
 * Decide bootstrap action from footprints + optional migration plan.
 * Never auto-push/pull when both sides already hold divergent records.
 *
 * @returns {'push'|'pull'|'empty'|'needs-preview'}
 */
export function chooseCloudBootstrapAction({ local, cloud, plan = null } = {}) {
  const localFp = normalizeFp(local);
  const cloudFp = normalizeFp(cloud);
  const localEmpty = footprintIsEmpty(localFp);
  const cloudEmpty = footprintIsEmpty(cloudFp);

  if (cloudEmpty && localEmpty) return 'empty';
  if (cloudEmpty) return 'push';
  if (localEmpty) return 'pull';

  // Both sides have sync-relevant content — only auto when records match.
  if (plan ? syncSidesDiffer(plan, localFp, cloudFp) : true) {
    return 'needs-preview';
  }
  return 'pull';
}

/**
 * True when local and cloud already disagree (including local-only / cloud-only rows).
 */
export function syncSidesDiffer(plan, localFp, cloudFp) {
  if (!plan) return true;
  const s = plan.summary || {};
  const meals = plan.meals || {};
  if (plan.needsAttention) return true;
  if ((s.shoppingLocalOnly || 0) + (s.shoppingCloudOnly || 0) > 0) return true;
  if ((s.inventoryLocalOnly || 0) + (s.inventoryCloudOnly || 0) > 0) return true;
  if ((s.familyLocalOnly || 0) + (s.familyCloudOnly || 0) > 0) return true;
  if (meals.localHasMealPlan !== meals.cloudHasMealPlan) return true;
  if (meals.localHasDinner !== meals.cloudHasDinner) return true;
  if (meals.mealPlanConflict || meals.todayDinnerConflict) return true;
  if (localFp?.catalogCustomized && footprintHasTransactional(cloudFp)) return true;
  return false;
}

/**
 * Isolate active state when switching households while logged in.
 * Saves previous scoped cache; loads next cache or a fresh seeded shell.
 * Never carries previous household inventory/shopping into the next home.
 */
export function prepareHouseholdSwitch({
  prevState,
  nextHouseholdId,
  userId,
  loadScoped,
  saveScoped,
} = {}) {
  if (!nextHouseholdId) {
    throw new Error('household_id가 필요해요.');
  }
  const prevHid = prevState?.cloud?.householdId || null;

  if (
    userId &&
    prevHid &&
    prevHid !== nextHouseholdId &&
    typeof saveScoped === 'function' &&
    prevState?.cloud?.mode === 'cloud-primary'
  ) {
    saveScoped(userId, prevHid, prevState);
  }

  let next = null;
  if (userId && typeof loadScoped === 'function') {
    next = loadScoped(userId, nextHouseholdId);
  }
  if (next) {
    const migrated = migrateState(structuredClone(next)) || structuredClone(next);
    migrated.cloud = {
      ...(migrated.cloud || {}),
      userId: userId || migrated.cloud?.userId || null,
      householdId: nextHouseholdId,
      mode: migrated.cloud?.mode === 'cloud-primary' ? 'cloud-primary' : 'local',
    };
    ensureActiveList(migrated);
    return {
      state: migrated,
      fromCache: true,
      previousHouseholdId: prevHid,
    };
  }

  const shell = seedState(createEmptyState());
  shell.cloud = {
    ...(shell.cloud || {}),
    userId: userId || null,
    householdId: nextHouseholdId,
    mode: 'local',
    migratedAt: null,
    lastPushedAt: null,
    lastPulledAt: null,
  };
  ensureActiveList(shell);
  return {
    state: shell,
    fromCache: false,
    previousHouseholdId: prevHid,
  };
}

/** Map a thrown/network error into a stable bootstrap failure result (no mode flip). */
export function bootstrapNetworkFailure(err) {
  const message =
    err?.message ||
    (typeof err === 'string' ? err : '') ||
    '클라우드 연결에 실패했어요. 네트워크를 확인한 뒤 다시 시도해 주세요.';
  return {
    ok: false,
    action: 'error',
    error: err,
    message,
    keepMode: 'local',
  };
}

function countMeaningfulMembers(members) {
  return (members || []).filter((m) => {
    const name = String(m.displayName || m.name || '').trim();
    const role = String(m.roleLabel || m.role || '').trim();
    const note = String(m.note || '').trim();
    const isDefaultOwner =
      DEFAULT_MEMBER_NAMES.has(name) &&
      (role === '관리자' || role === 'owner' || role === '') &&
      !note;
    return !isDefaultOwner;
  }).length;
}

function isKitchenCatalogCustomized(state) {
  const patternNames = (state?.cookingPatterns || [])
    .map((p) => String(p.name || '').trim())
    .filter(Boolean)
    .sort();
  const sauceNames = (state?.sauces || [])
    .map((s) => String(s.name || '').trim())
    .filter(Boolean)
    .sort();
  if (!patternNames.length && !sauceNames.length) return false;
  const seedPatterns = SEED_PATTERN_NAMES.slice().sort();
  const samePatterns =
    patternNames.length === seedPatterns.length &&
    patternNames.every((n, i) => n === seedPatterns[i]);
  const sameSauces =
    sauceNames.length === SEED_SAUCE_NAMES.length &&
    sauceNames.every((n, i) => n === SEED_SAUCE_NAMES[i]);
  // Empty catalog is not customized; exact seed match is not customized.
  if (!patternNames.length && !sauceNames.length) return false;
  if (samePatterns && sameSauces) return false;
  // Partial seed (tests with 1–2 patterns) counts as customized vs full seed,
  // but transactional-empty + non-full-seed should still allow pull.
  // Only treat as customized when user clearly added/renamed beyond seed set,
  // or removed all seed names while adding others.
  const seedPatternSet = new Set(SEED_PATTERN_NAMES);
  const seedSauceSet = new Set(SEED_SAUCE_NAMES);
  const extraPattern = patternNames.some((n) => !seedPatternSet.has(n));
  const extraSauce = sauceNames.some((n) => !seedSauceSet.has(n));
  return extraPattern || extraSauce;
}

function normalizeFp(fp) {
  if (!fp) {
    return {
      shopping: 0,
      inventory: 0,
      mealPlan: 0,
      todayDinner: 0,
      familyProfiles: 0,
      cookingPatterns: 0,
      sauces: 0,
      catalogCustomized: false,
      transactional: 0,
      catalog: 0,
      total: 0,
    };
  }
  if (typeof fp.transactional === 'number') return fp;
  // Back-compat with older count-only callers
  const shopping = Number(fp.localShopping ?? fp.shopping ?? fp.cloudShopping ?? 0) || 0;
  const inventory = Number(fp.localInventory ?? fp.inventory ?? fp.cloudInventory ?? 0) || 0;
  const mealPlan = Number(fp.mealPlan ?? 0) || 0;
  const todayDinner = Number(fp.todayDinner ?? 0) || 0;
  const familyProfiles = Number(fp.familyProfiles ?? 0) || 0;
  const cookingPatterns = Number(fp.cookingPatterns ?? 0) || 0;
  const sauces = Number(fp.sauces ?? 0) || 0;
  const catalogCustomized = !!fp.catalogCustomized;
  const transactional = shopping + inventory + mealPlan + todayDinner + familyProfiles;
  const catalog = cookingPatterns + sauces;
  return {
    shopping,
    inventory,
    mealPlan,
    todayDinner,
    familyProfiles,
    cookingPatterns,
    sauces,
    catalogCustomized,
    transactional,
    catalog,
    total: transactional + (catalogCustomized ? catalog : 0),
  };
}
