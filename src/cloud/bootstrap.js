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
  '부추장',
  '마늘 간장 소스',
  '스리라차 소스',
  '참깨 간장 소스',
  '겨자 간장 소스',
  '토마토 양파 소스',
  '간장마늘 양념',
  '양꼬치 양념',
  '허니머스터드 소스',
  '넛맥 올리브유 시즈닝',
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

/**
 * Promote to cloud-primary only after a successful pull payload exists.
 * On failure, return the untouched local state (mode stays local unless already primary).
 *
 * Cooking patterns / sauces are device-local: always keep the pre-pull catalog when
 * the pulled snapshot omits them (current cloud schema has no pattern/sauce tables).
 *
 * @param {{ pullOk: boolean, localState: object, pulledState?: object|null, userId?: string|null, now?: string, error?: unknown }} args
 */
export function finalizeBootstrapPull({
  pullOk,
  localState,
  pulledState = null,
  userId = null,
  now = new Date().toISOString(),
  error = null,
} = {}) {
  if (!pullOk || !pulledState) {
    const kept = structuredClone(localState);
    if (kept.cloud && kept.cloud.mode !== 'cloud-primary') {
      kept.cloud.mode = 'local';
    }
    return {
      ok: false,
      action: 'error',
      state: kept,
      preservedLocal: true,
      mode: kept.cloud?.mode || 'local',
      message: bootstrapNetworkFailure(error).message,
      error,
    };
  }

  const next = structuredClone(pulledState);
  // Device-local kitchen catalog — never drop local patterns/sauces on pull.
  next.cookingPatterns = localState?.cookingPatterns || next.cookingPatterns || [];
  next.sauces = localState?.sauces || next.sauces || [];

  next.cloud = {
    ...(next.cloud || {}),
    ...(localState?.cloud || {}),
    householdId: localState?.cloud?.householdId || next.cloud?.householdId || null,
    userId: userId || localState?.cloud?.userId || null,
    mode: 'cloud-primary',
    migratedAt: localState?.cloud?.migratedAt || now,
    lastPushedAt: localState?.cloud?.lastPushedAt || null,
    lastPulledAt: now,
  };

  return {
    ok: true,
    action: 'pull',
    state: next,
    preservedLocal: false,
    mode: 'cloud-primary',
    message: '클라우드 집 데이터를 불러왔고, 이제 클라우드가 기본 저장소예요.',
    error: null,
  };
}

/**
 * Interpret a quiet-pull result so callers never treat swallowed errors as success.
 * @param {{ ok?: boolean, skipped?: boolean, offline?: boolean }|null|undefined} result
 */
export function isQuietPullSuccess(result) {
  return !!(result && result.ok === true && !result.skipped && !result.offline);
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
