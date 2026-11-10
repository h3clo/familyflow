/**
 * Ephemeral Supabase JS client for QA (in-memory auth storage).
 * Reusable across projects — pass url + publishable key only.
 */

import { createClient } from '@supabase/supabase-js';
import { assertQaSafeKey } from './env.mjs';

export function createMemoryAuthStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

/**
 * @param {{ url: string, publishableKey: string, storageKey?: string }} opts
 */
export function createQaClient({ url, publishableKey, storageKey = 'qa-auth' }) {
  assertQaSafeKey(publishableKey);
  return createClient(String(url).trim(), String(publishableKey).trim(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage: createMemoryAuthStorage(),
      storageKey,
    },
  });
}

export async function signInQaUser(client, email, password) {
  const { data, error } = await client.auth.signInWithPassword({
    email: String(email).trim(),
    password: String(password),
  });
  if (error) throw error;
  if (!data?.session?.user) throw new Error('QA sign-in returned no session');
  return data;
}

export async function signOutQa(client) {
  const { error } = await client.auth.signOut();
  if (error) throw error;
}
