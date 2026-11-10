/**
 * First-visit / signup helpers for Family Flow cloud onboarding.
 * Keep household naming separate from Auth profile display_name.
 */

export function needsCloudAuthGate({ configured, user, deferAuth }) {
  return !!(configured && !user && !deferAuth);
}

/**
 * Decide how to bind a household so Supabase becomes the real store.
 * Never auto-push an empty local over a populated cloud (that would wipe rows).
 *
 * @param {{ localInventory?: number, localShopping?: number, cloudInventory?: number, cloudShopping?: number }} counts
 * @returns {'push'|'pull'|'empty'|'needs-preview'}
 */
export function chooseCloudBootstrapAction(counts = {}) {
  const localN = (Number(counts.localInventory) || 0) + (Number(counts.localShopping) || 0);
  const cloudN = (Number(counts.cloudInventory) || 0) + (Number(counts.cloudShopping) || 0);
  if (cloudN === 0 && localN === 0) return 'empty';
  if (cloudN === 0) return 'push';
  if (localN === 0) return 'pull';
  return 'needs-preview';
}

/** Signup form: household name is required; profile display defaults to 관리자. */
export function parseSignupHouseholdName(raw) {
  const name = String(raw || '').trim();
  if (!name) {
    return { ok: false, error: '집 이름을 입력해 주세요. 예: 우리집' };
  }
  if (name.length > 80) {
    return { ok: false, error: '집 이름은 80자 이내로 적어 주세요.' };
  }
  return { ok: true, householdName: name, profileDisplayName: '관리자' };
}
