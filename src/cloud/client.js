import { createClient } from '@supabase/supabase-js';
import { readCloudConfig } from './config.js';
import { scopedStorageKey } from '../lib/storageScope.js';

let cached = null;
let cachedKey = '';

const AUTH_BASE = 'familyflow-auth';

/** @returns {import('@supabase/supabase-js').SupabaseClient | null} */
export function getSupabaseClient(env) {
  const cfg = readCloudConfig(env);
  if (!cfg.configured) return null;
  const storageKey = scopedStorageKey(AUTH_BASE);
  const key = `${cfg.url}|${cfg.publishableKey}|${storageKey}`;
  if (cached && cachedKey === key) return cached;
  cached = createClient(cfg.url, cfg.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey,
    },
  });
  cachedKey = key;
  return cached;
}

export function resetSupabaseClientForTests() {
  cached = null;
  cachedKey = '';
}
