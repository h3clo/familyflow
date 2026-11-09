/**
 * Local ↔ cloud sync helpers (S5-B).
 * Push copies local shopping/inventory/meals/family profiles into the active household.
 * Never deletes localStorage automatically. Reconciles remote deletes to prevent zombies.
 */

import { ensureActiveList } from '../domain/shopping.js';
import { getSupabaseClient } from './client.js';

export function assertHouseholdScope(householdId, rowHouseholdId) {
  if (!householdId || !rowHouseholdId || householdId !== rowHouseholdId) {
    throw new Error('다른 가구 데이터에는 접근할 수 없어요.');
  }
}

const ROLE_LABELS = new Set(['관리자', '엄마', '아빠', '자녀', '구성원']);

export function mapMemberToProfile(member, householdId, index = 0) {
  const role = String(member.roleLabel || member.role || '구성원');
  let roleLabel = '구성원';
  if (ROLE_LABELS.has(role)) roleLabel = role;
  else if (role === 'owner') roleLabel = '관리자';
  return {
    id: member.id,
    household_id: householdId,
    display_name: String(member.displayName || member.name || '구성원').trim() || '구성원',
    role_label: roleLabel,
    sort_order: Number.isFinite(member.sortOrder) ? member.sortOrder : index,
    note: String(member.note || '').slice(0, 120),
    updated_at: member.updatedAt || new Date().toISOString(),
  };
}

/**
 * Build cloud rows from local state. Pure — no I/O.
 */
export function localStateToCloudRows(state, householdId) {
  if (!householdId) throw new Error('household_id가 필요해요.');
  const list = ensureActiveList(structuredClone(state));
  const listId = list.id;

  const shoppingList = {
    id: listId,
    household_id: householdId,
    title: list.title || '장보기',
    status: list.status || 'open',
    budget_won: list.budgetWon ?? state.household?.budgetWon ?? null,
    updated_at: new Date().toISOString(),
  };

  const shoppingItems = (list.items || []).map((i) => ({
    id: i.id,
    list_id: listId,
    household_id: householdId,
    name: i.name,
    quantity: i.quantity,
    unit: i.unit || '개',
    priority: i.priority === 'nice' ? 'nice' : 'must',
    category: ['food', 'household', 'other'].includes(i.category) ? i.category : 'other',
    estimated_price: i.estimatedPrice ?? null,
    note: i.note || '',
    checked: !!i.checked,
    checked_at: i.checkedAt || null,
    inventory_id: i.inventoryId || null,
    source_text: i.sourceText || '',
  }));

  const inventory = (state.inventory || []).map((i) => ({
    id: i.id,
    household_id: householdId,
    name: i.name,
    location: i.location,
    status: i.status,
    quantity: i.quantity ?? null,
    unit: i.unit || null,
    category: i.category || 'other',
    note: i.note || '',
    updated_at: i.updatedAt || new Date().toISOString(),
  }));

  const mealPlan = state.mealPlan
    ? {
        id: state.mealPlan.id,
        household_id: householdId,
        week_start: state.mealPlan.weekStart,
        status: state.mealPlan.status === 'confirmed' ? 'confirmed' : 'draft',
        payload: state.mealPlan,
        updated_at: new Date().toISOString(),
      }
    : null;

  const todayDinner = state.todayDinner
    ? {
        household_id: householdId,
        dinner_date: state.todayDinner.date || new Date().toISOString().slice(0, 10),
        title: state.todayDinner.title || '',
        protein: state.todayDinner.protein || null,
        payload: state.todayDinner,
        updated_at: new Date().toISOString(),
      }
    : null;

  const familyProfiles = (state.members || []).map((m, idx) => mapMemberToProfile(m, householdId, idx));

  return { shoppingList, shoppingItems, inventory, mealPlan, todayDinner, familyProfiles };
}

/**
 * Ids present locally that should remain on the cloud for a household scope.
 */
export function reconcileDeleteIds(remoteIds, localIds) {
  const keep = new Set(localIds);
  return (remoteIds || []).filter((id) => id && !keep.has(id));
}

async function deleteByIds(client, table, ids) {
  if (!ids?.length) return { deleted: 0 };
  const chunk = 200;
  let deleted = 0;
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk);
    const { error } = await client.from(table).delete().in('id', slice);
    if (error) throw error;
    deleted += slice.length;
  }
  return { deleted };
}

/**
 * Upload local snapshot to cloud and remove remote rows missing locally (same household).
 * Does not clear or rewrite localStorage.
 */
export async function pushLocalToCloud(state, householdId, client = getSupabaseClient()) {
  if (!client) throw new Error('클라우드가 설정되지 않았어요.');
  if (!householdId) throw new Error('가구를 먼저 선택하거나 만들어 주세요.');

  const rows = localStateToCloudRows(state, householdId);

  const { error: hErr } = await client
    .from('households')
    .update({
      name: state.household?.name || '우리 집',
      budget_won: state.household?.budgetWon ?? null,
    })
    .eq('id', householdId);
  if (hErr) throw hErr;

  const { error: lErr } = await client.from('shopping_lists').upsert(rows.shoppingList);
  if (lErr) throw lErr;

  if (rows.shoppingItems.length) {
    const { error } = await client.from('shopping_items').upsert(rows.shoppingItems);
    if (error) throw error;
  }

  const { data: remoteItems, error: riErr } = await client
    .from('shopping_items')
    .select('id')
    .eq('household_id', householdId)
    .eq('list_id', rows.shoppingList.id);
  if (riErr) throw riErr;
  const shoppingDeletes = reconcileDeleteIds(
    (remoteItems || []).map((r) => r.id),
    rows.shoppingItems.map((i) => i.id),
  );
  await deleteByIds(client, 'shopping_items', shoppingDeletes);

  if (rows.inventory.length) {
    const { error } = await client.from('inventory_items').upsert(rows.inventory);
    if (error) throw error;
  }
  const { data: remoteInv, error: invListErr } = await client
    .from('inventory_items')
    .select('id')
    .eq('household_id', householdId);
  if (invListErr) throw invListErr;
  const invDeletes = reconcileDeleteIds(
    (remoteInv || []).map((r) => r.id),
    rows.inventory.map((i) => i.id),
  );
  await deleteByIds(client, 'inventory_items', invDeletes);

  if (rows.mealPlan) {
    const { error } = await client.from('meal_plans').upsert(rows.mealPlan);
    if (error) throw error;
  }

  if (rows.todayDinner) {
    const { error } = await client.from('today_dinners').upsert(rows.todayDinner);
    if (error) throw error;
  }

  if (rows.familyProfiles.length) {
    const { error } = await client.from('family_profiles').upsert(rows.familyProfiles);
    if (error) throw error;
  }
  const { data: remoteProfiles, error: fpErr } = await client
    .from('family_profiles')
    .select('id')
    .eq('household_id', householdId);
  if (fpErr) throw fpErr;
  const profileDeletes = reconcileDeleteIds(
    (remoteProfiles || []).map((r) => r.id),
    rows.familyProfiles.map((p) => p.id),
  );
  await deleteByIds(client, 'family_profiles', profileDeletes);

  return {
    ok: true,
    householdId,
    counts: {
      shoppingItems: rows.shoppingItems.length,
      inventory: rows.inventory.length,
      mealPlan: rows.mealPlan ? 1 : 0,
      todayDinner: rows.todayDinner ? 1 : 0,
      familyProfiles: rows.familyProfiles.length,
      deletedShopping: shoppingDeletes.length,
      deletedInventory: invDeletes.length,
      deletedProfiles: profileDeletes.length,
    },
    localPreserved: true,
  };
}

/**
 * Pull remote household data into a new state object (caller decides whether to persist).
 */
export async function pullCloudToState(baseState, householdId, client = getSupabaseClient()) {
  if (!client) throw new Error('클라우드가 설정되지 않았어요.');
  const next = structuredClone(baseState);

  const { data: household, error: hErr } = await client
    .from('households')
    .select('id, name, budget_won')
    .eq('id', householdId)
    .maybeSingle();
  if (hErr) throw hErr;
  if (!household) throw new Error('가구를 찾을 수 없거나 권한이 없어요.');

  next.household = {
    ...next.household,
    id: household.id,
    name: household.name,
    budgetWon: household.budget_won ?? next.household.budgetWon,
  };

  const { data: lists, error: lErr } = await client
    .from('shopping_lists')
    .select('*')
    .eq('household_id', householdId);
  if (lErr) throw lErr;

  const { data: items, error: iErr } = await client
    .from('shopping_items')
    .select('*')
    .eq('household_id', householdId);
  if (iErr) throw iErr;

  const safeLists = (lists || []).filter((r) => r.household_id === householdId);
  const safeItems = (items || []).filter((r) => r.household_id === householdId);

  next.shoppingLists = safeLists.map((l) => ({
    id: l.id,
    title: l.title,
    status: l.status,
    budgetWon: l.budget_won,
    items: safeItems
      .filter((i) => i.list_id === l.id)
      .map((i) => ({
        id: i.id,
        name: i.name,
        quantity: Number(i.quantity),
        unit: i.unit,
        priority: i.priority,
        category: i.category,
        estimatedPrice: i.estimated_price,
        note: i.note,
        checked: i.checked,
        checkedAt: i.checked_at,
        inventoryId: i.inventory_id,
        sourceText: i.source_text,
      })),
    createdAt: l.created_at,
    updatedAt: l.updated_at,
  }));
  if (next.shoppingLists[0]) next.settings.activeListId = next.shoppingLists[0].id;

  const { data: inv, error: invErr } = await client
    .from('inventory_items')
    .select('*')
    .eq('household_id', householdId);
  if (invErr) throw invErr;
  next.inventory = (inv || [])
    .filter((r) => r.household_id === householdId)
    .map((i) => ({
      id: i.id,
      name: i.name,
      location: i.location,
      status: i.status,
      quantity: i.quantity,
      unit: i.unit,
      category: i.category,
      note: i.note,
      updatedAt: i.updated_at,
    }));

  const { data: plan } = await client
    .from('meal_plans')
    .select('*')
    .eq('household_id', householdId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (plan?.payload && plan.household_id === householdId) {
    next.mealPlan = plan.payload;
  }

  const { data: dinner } = await client
    .from('today_dinners')
    .select('*')
    .eq('household_id', householdId)
    .maybeSingle();
  if (dinner?.payload && dinner.household_id === householdId) {
    next.todayDinner = dinner.payload;
  }

  const { data: profiles, error: pErr } = await client
    .from('family_profiles')
    .select('*')
    .eq('household_id', householdId)
    .order('sort_order', { ascending: true });
  if (pErr) throw pErr;
  if (profiles?.length) {
    next.members = profiles
      .filter((r) => r.household_id === householdId)
      .map((p) => ({
        id: p.id,
        displayName: p.display_name,
        roleLabel: p.role_label,
        role: p.role_label === '관리자' ? 'owner' : 'member',
        note: p.note || '',
        sortOrder: p.sort_order,
        updatedAt: p.updated_at,
      }));
  }

  next.cloud = {
    ...(next.cloud || {}),
    householdId,
    lastPulledAt: new Date().toISOString(),
  };

  return next;
}

/** Fetch cloud snapshot for migration preview without mutating caller state. */
export async function fetchCloudSnapshot(baseState, householdId, client = getSupabaseClient()) {
  return pullCloudToState(
    {
      ...structuredClone(baseState),
      shoppingLists: [],
      inventory: [],
      mealPlan: null,
      todayDinner: null,
      members: [],
    },
    householdId,
    client,
  );
}
