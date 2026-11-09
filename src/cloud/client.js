import { createClient } from '@supabase/supabase-js';
import { readCloudConfig } from './config.js';

let cached = null;
let cachedKey = '';

/** @returns {import('@supabase/supabase-js').SupabaseClient | null} */
export function getSupabaseClient(env) {
  const cfg = readCloudConfig(env);
  if (!cfg.configured) return null;
  const key = `${cfg.url}|${cfg.publishableKey}`;
  if (cached && cachedKey === key) return cached;
  cached = createClient(cfg.url, cfg.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'familyflow-auth',
    },
  });
  cachedKey = key;
  return cached;
}

export function resetSupabaseClientForTests() {
  cached = null;
  cachedKey = '';
}
