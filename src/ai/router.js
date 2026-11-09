/**
 * AI route: Ollama (local) → Groq Edge proxy (free) → rules/offline.
 * Never auto-upgrades to paid plans.
 */

/**
 * @param {object} opts
 * @param {import('./provider.js').AiProvider} opts.ollama
 * @param {object} opts.groq
 * @param {() => object} [opts.getState]
 * @param {(info: object) => void} [opts.onRoute]
 */
export function createAiRouter(opts = {}) {
  const { ollama, groq, getState, onRoute } = opts;
  /** @type {{ provider: string, model: string, status: string, message: string }} */
  let last = {
    provider: 'none',
    model: '',
    status: 'idle',
    message: '아직 확인하지 않았어요.',
  };

  function publish(next) {
    last = { ...last, ...next };
    onRoute?.(last);
    return last;
  }

  return {
    id: 'auto',
    label: '자동 (Ollama → Groq → 규칙)',

    getRoute() {
      return { ...last };
    },

    async probe() {
      const o = await ollama.probe();
      if (o.status === 'ready') {
        return publish({
          provider: 'ollama',
          model: o.detail?.activeModel || '',
          status: 'ready',
          message: o.message,
        });
      }
      const g = await groq.probe();
      if (g.status === 'ready') {
        return publish({
          provider: 'groq',
          model: g.detail?.activeModel || groq.preferredModel || '',
          status: 'ready',
          message: `Ollama 불가 → ${g.message}`,
        });
      }
      return publish({
        provider: 'rules',
        model: '',
        status: 'offline',
        message: 'AI 연결 없음 · 규칙 비서만 사용',
      });
    },

    /**
     * Conversation path: try Ollama JSON completion, else Groq with safe context.
     */
    async completeConversation({ userText, state, ollamaCompleteArgs } = {}) {
      const st = state || getState?.() || {};
      const oProbe = await ollama.probe();
      if (oProbe.status === 'ready') {
        try {
          const completion = await ollama.complete(ollamaCompleteArgs || { prompt: userText });
          publish({
            provider: 'ollama',
            model: completion.model || oProbe.detail?.activeModel || '',
            status: 'ready',
            message: `Ollama · ${completion.model || oProbe.detail?.activeModel || ''}`,
          });
          return {
            ...completion,
            route: 'ollama',
            provider: 'ollama',
          };
        } catch (err) {
          // fall through to groq
          publish({
            provider: 'ollama',
            model: '',
            status: 'error',
            message: `Ollama 실패 → Groq 시도 (${err.message || '오류'})`,
          });
        }
      }

      const gProbe = await groq.probe();
      if (gProbe.status !== 'ready') {
        publish({
          provider: 'rules',
          model: '',
          status: 'offline',
          message: 'Ollama·Groq 모두 불가 · 규칙 모드',
        });
        const err = new Error(gProbe.message || 'cloud_offline');
        err.code = 'no_ai';
        throw err;
      }

      try {
        const completion = await groq.complete({ userText, state: st });
        publish({
          provider: 'groq',
          model: completion.model || '',
          status: 'ready',
          message: `Groq · ${completion.model || ''}`,
        });
        return {
          ...completion,
          route: 'groq',
          provider: 'groq',
        };
      } catch (err) {
        const limitKind = err.limitKind || null;
        publish({
          provider: 'rules',
          model: '',
          status: limitKind ? 'error' : 'offline',
          message: err.message || 'Groq 실패 · 규칙 모드',
        });
        throw err;
      }
    },

    /** Smoke / settings: prefer Ollama complete, else short Groq ping via conversation shape */
    async complete(args = {}) {
      return this.completeConversation({
        userText: args.userText || args.prompt || 'ping',
        state: getState?.(),
        ollamaCompleteArgs: args,
      });
    },
  };
}

export function formatRouteBadge(route) {
  if (!route) return 'AI: 미확인';
  if (route.provider === 'ollama') return `AI: Ollama · ${route.model || '로컬'}`;
  if (route.provider === 'groq') return `AI: Groq · ${route.model || 'gpt-oss-20b'}`;
  if (route.provider === 'rules') return 'AI: 규칙 모드';
  return `AI: ${route.provider || '없음'}`;
}
