/**
 * Local ↔ cloud sync helpers.
 * Push copies local shopping/inventory/meals into the active household.
 * Never deletes localStorage automatically.
 */

import { ensureActiveList } from '../domain/shopping.js';
import { getSupabaseClient } from './client.js';

export function assertHouseholdScope(householdId, rowHouseholdId) {
  if (!householdId || !rowHouseholdId || householdId !== rowHouseholdId) {
    throw new Error('다른 가구 데이터에는 접근할 수 없어요.');
  }
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

  return { shoppingList, shoppingItems, inventory, mealPlan, todayDinner };
}

/**
 * Upload local snapshot to cloud. Does not clear or rewrite localStorage.
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

  if (rows.inventory.length) {
    const { error } = await client.from('inventory_items').upsert(rows.inventory);
    if (error) throw error;
  }

  if (rows.mealPlan) {
    const { error } = await client.from('meal_plans').upsert(rows.mealPlan);
    if (error) throw error;
  }

  if (rows.todayDinner) {
    const { error } = await client.from('today_dinners').upsert(rows.todayDinner);
    if (error) throw error;
  }

  return {
    ok: true,
    householdId,
    counts: {
      shoppingItems: rows.shoppingItems.length,
      inventory: rows.inventory.length,
      mealPlan: rows.mealPlan ? 1 : 0,
      todayDinner: rows.todayDinner ? 1 : 0,
    },
    localPreserved: true,
  };
}

/**
 * Pull remote household data into a new state object (caller decides whether to persist).
 * Does not delete the previous local backup — returns merged state for explicit save.
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

  // Defense in depth: drop any row that somehow has another household_id
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

  next.cloud = {
    ...(next.cloud || {}),
    householdId,
    lastPulledAt: new Date().toISOString(),
  };

  return next;
}
