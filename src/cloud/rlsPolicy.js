/**
 * Client-side mirror of RLS membership rules for unit tests / defense-in-depth filters.
 * Not a substitute for Postgres RLS — server still enforces.
 */

/**
 * @param {{ householdId: string, userId: string, role: string }[]} memberships
 * @param {string} householdId
 * @param {string} userId
 */
export function canReadHousehold(memberships, householdId, userId) {
  return (memberships || []).some((m) => m.householdId === householdId && m.userId === userId);
}

export function canEditHousehold(memberships, householdId, userId) {
  return (memberships || []).some(
    (m) => m.householdId === householdId && m.userId === userId && (m.role === 'owner' || m.role === 'editor'),
  );
}

/** Simulate filtering a query result as RLS would. */
export function filterRowsByMembership(rows, memberships, userId) {
  const allowed = new Set(
    (memberships || []).filter((m) => m.userId === userId).map((m) => m.householdId),
  );
  return (rows || []).filter((r) => allowed.has(r.household_id || r.householdId));
}

/** Reject forged household_id on write payloads. */
export function assertWriteHouseholdId(activeHouseholdId, payloadHouseholdId) {
  if (!activeHouseholdId) throw new Error('활성 가구가 없어요.');
  if (payloadHouseholdId !== activeHouseholdId) {
    throw new Error('다른 가구 ID로는 저장할 수 없어요.');
  }
  return true;
}
