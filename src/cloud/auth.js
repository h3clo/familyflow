import { getSupabaseClient } from './client.js';

export async function getAuthSession(client = getSupabaseClient()) {
  if (!client) return { session: null, user: null, error: null, cloudDisabled: true };
  const { data, error } = await client.auth.getSession();
  return {
    session: data?.session || null,
    user: data?.session?.user || null,
    error,
    cloudDisabled: false,
  };
}

export async function signUpWithEmail(email, password, { displayName } = {}, client = getSupabaseClient()) {
  if (!client) throw new Error('클라우드가 설정되지 않았어요. .env.local을 확인하세요.');
  const { data, error } = await client.auth.signUp({
    email: String(email || '').trim(),
    password: String(password || ''),
    options: {
      data: { display_name: String(displayName || '').trim() || '나' },
    },
  });
  if (error) throw error;
  if (data.user) {
    await client.from('profiles').upsert({
      user_id: data.user.id,
      display_name: String(displayName || '').trim() || '나',
      updated_at: new Date().toISOString(),
    });
  }
  return data;
}

export async function signInWithEmail(email, password, client = getSupabaseClient()) {
  if (!client) throw new Error('클라우드가 설정되지 않았어요.');
  const { data, error } = await client.auth.signInWithPassword({
    email: String(email || '').trim(),
    password: String(password || ''),
  });
  if (error) throw error;
  return data;
}

export async function signOut(client = getSupabaseClient()) {
  if (!client) return { error: null };
  return client.auth.signOut();
}
