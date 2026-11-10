/**
 * Reusable QA env gate for live Supabase tests.
 * Never put passwords in the repo — load from process.env / Actions secrets.
 */

const REQUIRED = [
  'SUPABASE_QA_URL',
  'SUPABASE_QA_PUBLISHABLE_KEY',
  'SUPABASE_QA_USER_A_EMAIL',
  'SUPABASE_QA_USER_A_PASSWORD',
];

const OPTIONAL = [
  'SUPABASE_QA_USER_B_EMAIL',
  'SUPABASE_QA_USER_B_PASSWORD',
];

export function readQaEnv(env = process.env) {
  const get = (k) => String(env?.[k] || '').trim();
  const values = Object.fromEntries([...REQUIRED, ...OPTIONAL].map((k) => [k, get(k)]));
  const missing = REQUIRED.filter((k) => !values[k]);
  const hasUserB = Boolean(values.SUPABASE_QA_USER_B_EMAIL && values.SUPABASE_QA_USER_B_PASSWORD);
  const rejectedSecret =
    /service_role/i.test(values.SUPABASE_QA_PUBLISHABLE_KEY) ||
    values.SUPABASE_QA_PUBLISHABLE_KEY.includes('service_role');

  return {
    ...values,
    missing,
    hasUserB,
    rejectedSecret,
    configured: missing.length === 0 && !rejectedSecret,
    skipReason: rejectedSecret
      ? 'SUPABASE_QA_PUBLISHABLE_KEY looks like service_role (forbidden in QA client tests)'
      : missing.length
        ? `실제 서버 미검증 — missing ${missing.join(', ')}`
        : null,
  };
}

export function assertQaSafeKey(key) {
  if (/service_role/i.test(String(key || ''))) {
    throw new Error('QA tests must use publishable/anon key only — never service_role.');
  }
}
