/**
 * Delete only rows tagged for this QA run. Never wipe whole tables.
 * Household shells may remain (clients cannot DELETE households by design).
 */

import { isQaLabel } from './markers.mjs';

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} householdId
 * @param {string} runId
 */
export async function cleanupTaggedHouseholdData(client, householdId, runId) {
  if (!client || !householdId || !runId) return { deleted: {} };

  const deleted = {
    shoppingItems: 0,
    shoppingLists: 0,
    inventoryItems: 0,
    familyProfiles: 0,
  };

  const { data: items, error: iErr } = await client
    .from('shopping_items')
    .select('id, name')
    .eq('household_id', householdId);
  if (iErr) throw iErr;
  const itemIds = (items || []).filter((r) => isQaLabel(r.name, runId)).map((r) => r.id);
  if (itemIds.length) {
    const { error } = await client.from('shopping_items').delete().in('id', itemIds);
    if (error) throw error;
    deleted.shoppingItems = itemIds.length;
  }

  const { data: lists, error: lErr } = await client
    .from('shopping_lists')
    .select('id, title')
    .eq('household_id', householdId);
  if (lErr) throw lErr;
  const listIds = (lists || []).filter((r) => isQaLabel(r.title, runId)).map((r) => r.id);
  if (listIds.length) {
    // remove remaining items on those lists first
    const { error: liErr } = await client.from('shopping_items').delete().in('list_id', listIds);
    if (liErr) throw liErr;
    const { error } = await client.from('shopping_lists').delete().in('id', listIds);
    if (error) throw error;
    deleted.shoppingLists = listIds.length;
  }

  const { data: inv, error: invErr } = await client
    .from('inventory_items')
    .select('id, name')
    .eq('household_id', householdId);
  if (invErr) throw invErr;
  const invIds = (inv || []).filter((r) => isQaLabel(r.name, runId)).map((r) => r.id);
  if (invIds.length) {
    const { error } = await client.from('inventory_items').delete().in('id', invIds);
    if (error) throw error;
    deleted.inventoryItems = invIds.length;
  }

  const { data: profiles, error: pErr } = await client
    .from('family_profiles')
    .select('id, display_name')
    .eq('household_id', householdId);
  if (pErr) throw pErr;
  const profileIds = (profiles || [])
    .filter((r) => isQaLabel(r.display_name, runId))
    .map((r) => r.id);
  if (profileIds.length) {
    const { error } = await client.from('family_profiles').delete().in('id', profileIds);
    if (error) throw error;
    deleted.familyProfiles = profileIds.length;
  }

  return { deleted };
}
