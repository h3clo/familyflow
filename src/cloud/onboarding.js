/**
 * First-visit / signup helpers for Family Flow cloud onboarding.
 * Keep household naming separate from Auth profile display_name.
 */

export { chooseCloudBootstrapAction, buildSyncableFootprint } from './bootstrap.js';

export function needsCloudAuthGate({ configured, user, deferAuth }) {
  return !!(configured && !user && !deferAuth);
}

/** Signup: household name is optional (defaults to 우리 집). Profile display stays 관리자. */
export function parseSignupHouseholdName(raw) {
  const name = String(raw || '').trim() || '우리 집';
  if (name.length > 80) {
    return { ok: false, error: '집 이름은 80자 이내로 적어 주세요.' };
  }
  return { ok: true, householdName: name, profileDisplayName: '관리자' };
}
