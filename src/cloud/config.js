/**
 * Cloud config — publishable/anon key only. Never put service_role / secret keys here.
 */

function defaultEnv() {
  const meta = typeof import.meta !== 'undefined' ? import.meta.env : {};
  const proc = typeof process !== 'undefined' ? process.env : {};
  // Vite injects import.meta.env in the browser; Node scripts/tests can use process.env.
  return { ...proc, ...meta };
}

export function readCloudConfig(env = defaultEnv()) {
  const url = String(env?.VITE_SUPABASE_URL || '').trim();
  const publishableKey = String(
    env?.VITE_SUPABASE_PUBLISHABLE_KEY || env?.VITE_SUPABASE_ANON_KEY || '',
  ).trim();

  const placeholder = !url || !publishableKey || url.includes('YOUR_PROJECT') || publishableKey.includes('YOUR_');
  const rejectedSecretKey = /service_role/i.test(publishableKey) || looksLikeServiceRoleJwt(publishableKey);

  return {
    url,
    publishableKey,
    configured: !placeholder && !rejectedSecretKey,
    rejectedSecretKey,
    missing: placeholder,
  };
}

function looksLikeServiceRoleJwt(token) {
  if (!token || !token.includes('.')) return false;
  try {
    const payload = token.split('.')[1];
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json =
      typeof atob === 'function'
        ? atob(b64)
        : Buffer.from(b64, 'base64').toString('utf8');
    return /"role"\s*:\s*"service_role"/.test(json);
  } catch {
    return false;
  }
}

export function cloudSetupSteps() {
  return [
    '1) Supabase에서 Haze Flow와 무관한 **새 프로젝트**를 만듭니다.',
    '2) SQL Editor에서 순서대로 적용합니다:',
    '   - supabase/migrations/202611090001_familyflow_core.sql',
    '   - supabase/migrations/202611090002_familyflow_s5a_auth_household.sql',
    '3) Authentication → Providers에서 Email을 켭니다.',
    '4) Project Settings → API에서 Project URL과 publishable/anon key만 복사합니다. (service_role 금지)',
    '5) familyflow/.env.local 에 VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY 를 넣고 dev 서버를 재시작합니다.',
    '6) 로컬 데이터는 「클라우드로 복사」로만 올리고, 자동 삭제하지 않습니다.',
  ].join('\n');
}
