/**
 * First-visit / signup helpers for Family Flow cloud onboarding.
 * Keep household naming separate from Auth profile display_name.
 */

export { chooseCloudBootstrapAction, buildSyncableFootprint } from './bootstrap.js';

export function needsCloudAuthGate({ configured, user, deferAuth }) {
  return !!(configured && !user && !deferAuth);
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
