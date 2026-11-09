/**
 * Ollama adapter.
 *
 * Browser always calls same-origin `/api/ollama/*` (Vite proxy → loopback Ollama).
 * That keeps the Ollama port off the public internet; other devices later talk to a
 * local/LAN bridge, not a public WAN exposure of :11434.
 */

import { DEFAULT_MODEL } from './provider.js';

export const OLLAMA_PROXY_PREFIX = '/api/ollama';
export const OLLAMA_LOOPBACK = 'http://127.0.0.1:11434';

/**
 * @param {object} [options]
 * @param {string} [options.baseUrl] same-origin proxy prefix or absolute URL (dev/tests)
 * @param {string} [options.preferredModel]
 * @param {typeof fetch} [options.fetchImpl]
 */
export function createOllamaProvider(options = {}) {
  const baseUrl = String(options.baseUrl || OLLAMA_PROXY_PREFIX).replace(/\/$/, '');
  const preferredModel = options.preferredModel || DEFAULT_MODEL;
  const fetchImpl = options.fetchImpl || globalThis.fetch.bind(globalThis);

  async function request(path, init = {}) {
    const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    const res = await fetchImpl(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers || {}),
      },
    });
    return res;
  }

  return {
    id: 'ollama',
    label: 'Ollama (로컬)',

    async probe() {
      try {
        const res = await request('/api/tags', { method: 'GET' });
        if (!res.ok) {
          return {
            status: 'error',
            message: `Ollama가 응답했지만 오류예요 (HTTP ${res.status}).`,
            detail: { httpStatus: res.status },
          };
        }
        const data = await res.json();
        const models = (data.models || [])
          .map((m) => m.name || m.model)
          .filter(Boolean);
        const matched = models.find((m) => modelSatisfies(m, preferredModel));

        if (!models.length) {
          return {
            status: 'missing_model',
            message: 'Ollama는 실행 중이지만 설치된 모델이 없어요.',
            models,
            detail: { preferredModel, installHint: installHint(preferredModel) },
          };
        }

        if (!matched) {
          return {
            status: 'missing_model',
            message: `기본 모델 ‘${preferredModel}’이(가) 없어요. 다른 모델 ${models.length}개는 있습니다.`,
            models,
            detail: { preferredModel, installHint: installHint(preferredModel) },
          };
        }

        return {
          status: 'ready',
          message: `Ollama 연결됨 · 모델 ${matched}`,
          models,
          detail: { preferredModel, activeModel: matched },
        };
      } catch (err) {
        return {
          status: 'offline',
          message: 'Ollama에 연결할 수 없어요. 앱은 규칙 엔진으로 계속 동작해요.',
          models: [],
          detail: {
            error: String(err?.message || err),
            installHint: installHint(preferredModel),
            startHint:
              'Mac에서 Ollama 앱을 실행한 뒤, 터미널에서 `ollama serve` 또는 앱 실행 상태를 확인하세요.',
          },
        };
      }
    },

    async complete({ prompt, model, signal, format, numPredict, temperature } = {}) {
      const useModel = model || preferredModel;
      const body = {
        model: useModel,
        prompt: String(prompt || ''),
        stream: false,
        // qwen3 family may still emit brief reasoning; strip below.
        think: false,
        options: {
          temperature: typeof temperature === 'number' ? temperature : 0.1,
          num_predict: Number.isFinite(numPredict) ? numPredict : 256,
        },
      };
      if (format) body.format = format;
      const res = await request('/api/generate', {
        method: 'POST',
        signal,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const bodyText = await res.text().catch(() => '');
        throw new Error(`Ollama 생성 실패 (HTTP ${res.status}) ${bodyText.slice(0, 120)}`);
      }
      const data = await res.json();
      const text = extractFinalText(data);
      if (!text) {
        throw new Error('Ollama가 빈 응답을 돌려줬어요. 모델이 아직 로딩 중이거나 think 모드일 수 있어요.');
      }
      return { text, model: useModel, raw: data };
    },
  };
}

/** Prefer post-</think> answer; fall back to raw response / thinking snippet. */
export function extractFinalText(data) {
  let text = String(data?.response || data?.message?.content || '').trim();
  const marker = text.lastIndexOf('</think>');
  if (marker >= 0) text = text.slice(marker + '</think>'.length).trim();
  if (text) return text;
  const thinking = String(data?.thinking || '').trim();
  return thinking ? thinking.slice(0, 240) : '';
}

export function installHint(model = DEFAULT_MODEL) {
  return [
    '1) Mac에서 Ollama 앱이 실행 중인지 확인합니다.',
    `2) 터미널에서: ollama pull ${model}`,
    '3) Family Flow → 더보기 → AI 연결 테스트로 다시 확인합니다.',
    '브라우저·다른 기기는 Ollama 포트(11434)를 인터넷에 직접 열지 마세요. 같은 기기 Vite 프록시(`/api/ollama`) 또는 이후 LAN 전용 브리지를 사용합니다.',
  ].join('\n');
}

/** Exact tag or quantized suffix (qwen3:4b, qwen3:4b-q4_0). */
export function modelSatisfies(listed, preferred) {
  if (!listed || !preferred) return false;
  if (listed === preferred) return true;
  return listed.startsWith(`${preferred}-`);
}
