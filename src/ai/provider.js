/**
 * AI Provider interface — swap Ollama / NIM / mocks without touching domain apply.
 * Providers only return text or structured JSON candidates; they never mutate state.
 */

export const DEFAULT_MODEL = 'qwen3:4b';

/** @typedef {'idle'|'checking'|'ready'|'offline'|'missing_model'|'error'} AiStatus */

/**
 * @typedef {object} AiProvider
 * @property {string} id
 * @property {string} label
 * @property {() => Promise<{ status: AiStatus, message: string, models?: string[], detail?: object }>} probe
 * @property {(opts: { prompt: string, model?: string, signal?: AbortSignal }) => Promise<{ text: string, model: string, raw?: unknown }>} complete
 */

/**
 * @param {AiProvider} provider
 * @param {{ model?: string }} [opts]
 */
export async function smokeTest(provider, opts = {}) {
  const probe = await provider.probe();
  if (probe.status !== 'ready') {
    return { ok: false, probe, reply: null };
  }
  const model = opts.model || DEFAULT_MODEL;
  const reply = await provider.complete({
    prompt:
      'Family Flow connection test. Final answer must be exactly the word pong on its own line.',
    model,
  });
  return { ok: true, probe, reply };
}
