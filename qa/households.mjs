/**
 * Ensure a dedicated QA household exists for a signed-in user.
 */

export async function ensureNamedHousehold(client, name) {
  const label = String(name || '').trim();
  if (!label) throw new Error('household name required');

  const { data: memberships, error } = await client
    .from('household_members')
    .select('household_id, households(id, name)')
    .limit(50);
  if (error) throw error;

  const hit = (memberships || []).find((m) => m.households?.name === label);
  if (hit?.household_id) return hit.household_id;

  const { data: hid, error: cErr } = await client.rpc('create_household', {
    p_name: label,
    p_budget_won: null,
  });
  if (cErr) throw cErr;
  return hid;
}
