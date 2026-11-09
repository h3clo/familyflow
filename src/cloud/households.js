import { getSupabaseClient } from './client.js';

export async function listMyHouseholds(client = getSupabaseClient()) {
  if (!client) return [];
  const { data: memberships, error } = await client
    .from('household_members')
    .select('household_id, role, display_name, households(id, name, budget_won)');
  if (error) throw error;
  return (memberships || []).map((m) => ({
    householdId: m.household_id,
    role: m.role,
    displayName: m.display_name,
    name: m.households?.name || '',
    budgetWon: m.households?.budget_won ?? null,
  }));
}

export async function createHousehold(name, budgetWon = null, client = getSupabaseClient()) {
  if (!client) throw new Error('클라우드가 설정되지 않았어요.');
  const { data, error } = await client.rpc('create_household', {
    p_name: String(name || '').trim(),
    p_budget_won: budgetWon == null || budgetWon === '' ? null : Number(budgetWon),
  });
  if (error) throw error;
  return data;
}

export async function createInvite(householdId, { role = 'editor', days = 14 } = {}, client = getSupabaseClient()) {
  if (!client) throw new Error('클라우드가 설정되지 않았어요.');
  const { data, error } = await client.rpc('create_household_invite', {
    p_household_id: householdId,
    p_role: role,
    p_days: days,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    inviteId: row?.invite_id || row?.id,
    code: row?.code,
    expiresAt: row?.expires_at,
  };
}

export async function acceptInvite(code, displayName, client = getSupabaseClient()) {
  if (!client) throw new Error('클라우드가 설정되지 않았어요.');
  const { data, error } = await client.rpc('accept_household_invite', {
    p_code: String(code || '').trim(),
    p_display_name: String(displayName || '').trim() || null,
  });
  if (error) throw error;
  return data;
}

export async function listMembers(householdId, client = getSupabaseClient()) {
  if (!client) return [];
  const { data, error } = await client
    .from('household_members')
    .select('user_id, display_name, role, created_at')
    .eq('household_id', householdId);
  if (error) throw error;
  return data || [];
}
