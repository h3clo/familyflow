/**
 * Groq via Supabase Edge Function `ai-complete`.
 * API key never enters the browser — only user JWT + publishable key.
 */

import { readCloudConfig } from '../cloud/config.js';
import { getSupabaseClient } from '../cloud/client.js';
import { buildCloudSafeContext } from './householdContext.js';

export const GROQ_DEFAULT_MODEL = 'openai/gpt-oss-20b';

export class GroqProxyError extends Error {
  constructor(message, { code = 'error', limitKind = null, status = 0, paidUpgrade = false } = {}) {
    super(message);
    this.name = 'GroqProxyError';
    this.code = code;
    this.limitKind = limitKind;
    this.status = status;
    this.paidUpgrade = paidUpgrade;
  }
}

/**
 * @param {object} [options]
 * @param {() => Promise<string|null>} [options.getAccessToken]
 * @param {() => string|null} [options.getHouseholdId]
 * @param {() => object} [options.getState]
 * @param {typeof fetch} [options.fetchImpl]
 */
export function createGroqProvider(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch.bind(globalThis);
  const preferredModel = options.preferredModel || GROQ_DEFAULT_MODEL;

  async function invoke(userText, state) {
    const cfg = readCloudConfig();
    if (!cfg.configured) {
      throw new GroqProxyError('클라우드가 설정되지 않았어요.', { code: 'not_configured', status: 0 });
    }
    const client = getSupabaseClient();
    const token =
      (options.getAccessToken && (await options.getAccessToken())) ||
      (await client?.auth.getSession())?.data?.session?.access_token ||
      null;
    if (!token) {
      throw new GroqProxyError('로그인이 필요해요.', { code: 'unauthorized', status: 401 });
    }
    const householdId =
      (options.getHouseholdId && options.getHouseholdId()) ||
      state?.cloud?.householdId ||
      null;
    if (!householdId) {
      throw new GroqProxyError('집을 먼저 연결해 주세요.', { code: 'no_household', status: 400 });
    }

    const url = `${cfg.url.replace(/\/$/, '')}/functions/v1/ai-complete`;
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: cfg.publishableKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        householdId,
        userText: String(userText || '').slice(0, 500),
        context: buildCloudSafeContext(state || (options.getState && options.getState()) || {}),
        model: preferredModel,
      }),
    });

    let data = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }

    if (!res.ok) {
      throw new GroqProxyError(data.message || `Groq 프록시 오류 (HTTP ${res.status})`, {
        code: data.error || 'http_error',
        limitKind: data.limitKind || null,
        status: res.status,
        paidUpgrade: false,
      });
    }
    return {
      text: String(data.text || ''),
      model: data.model || preferredModel,
      provider: 'groq',
      raw: data,
    };
  }

  return {
    id: 'groq',
    label: 'Groq (무료 클라우드)',
    preferredModel,

    async probe() {
      const cfg = readCloudConfig();
      if (!cfg.configured) {
        return { status: 'offline', message: 'Supabase 미설정 — Groq 프록시 사용 불가', models: [] };
      }
      const client = getSupabaseClient();
      const session = (await client?.auth.getSession())?.data?.session;
      if (!session?.access_token) {
        return {
          status: 'offline',
          message: '로그인 후 Groq 무료 클라우드를 쓸 수 있어요.',
          models: [preferredModel],
        };
      }
      if (!(options.getHouseholdId?.() || null)) {
        // household checked lazily on complete
        return {
          status: 'ready',
          message: `Groq 준비됨 · ${preferredModel} (호출 시 집 권한·한도 검사)`,
          models: [preferredModel],
          detail: { activeModel: preferredModel },
        };
      }
      return {
        status: 'ready',
        message: `Groq 준비됨 · ${preferredModel}`,
        models: [preferredModel],
        detail: { activeModel: preferredModel },
      };
    },

    async complete({ prompt, userText, state, signal } = {}) {
      // Prefer explicit userText; prompt-only callers (smoke) send a short ping.
      const text = userText || prompt || '';
      void signal;
      return invoke(text, state);
    },
  };
}
