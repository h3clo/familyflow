/**
 * S4 conversation → ActionProposal bridge.
 * Model output is never trusted: JSON parse → whitelist ops → createProposal → previewProposal.
 * Nothing is persisted here; UI must call applyProposal after user approval.
 *
 * Provider order (when using createAiRouter): Ollama → Groq Edge → rules/local.
 */

import { createProposal, previewProposal, ProposalError, SUPPORTED_OPS } from '../domain/proposals.js';
import { parseQuickAdd } from '../domain/quick-add.js';
import { buildHouseholdContext } from './householdContext.js';
import { matchLocalIntent } from './localIntent.js';
import { extractFinalText } from './ollama.js';

export function buildSystemPrompt(context) {
  return `당신은 Family Flow 가정 생활 비서입니다. 한국어로 짧고 솔직하게 답합니다.
절대 규칙:
1) 데이터/DB/파일을 직접 수정하지 마세요. 변경이 필요하면 JSON proposal만 제안합니다.
2) 허용된 op만 사용: ${SUPPORTED_OPS.join(', ')}.
3) 정보가 부족하면 kind=clarify 로 질문만 하세요. 임의로 만들지 마세요.
4) 대화만 원하면 kind=chat (ops 없음).
5) 출력은 JSON 하나만. 설명 문장·마크다운 금지.

JSON 형식:
{"kind":"chat"|"clarify"|"proposal","message":"사용자에게 보여줄 한국어","title":"proposal일 때 제목","reason":"proposal일 때 이유","ops":[{"op":"...","payload":{}}]}

현재 가정 데이터(요약):
${JSON.stringify(context)}`;
}

export function extractJsonObject(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    /* fall through */
  }
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Normalize model/local draft into a safe turn. Never mutates state.
 */
export function finalizeTurn(state, draft, { engine = 'ai' } = {}) {
  if (!draft || typeof draft !== 'object') {
    return {
      kind: 'clarify',
      message: '요청을 이해하지 못했어요. 장보기·식단·재고 중 무엇을 도와드릴까요?',
      engine,
      proposal: null,
      preview: null,
    };
  }

  const kind =
    draft.kind === 'proposal' || draft.kind === 'clarify' || draft.kind === 'chat' ? draft.kind : null;
  if (!kind) {
    return {
      kind: 'clarify',
      message: '응답 형식이 올바르지 않아요. 다시 짧게 말씀해 주시겠어요?',
      engine,
      proposal: null,
      preview: null,
    };
  }

  const message = String(draft.message || '').trim() || defaultMessage(kind);

  if (kind === 'chat' || kind === 'clarify') {
    return { kind, message, engine, proposal: null, preview: null };
  }

  let ops = Array.isArray(draft.ops) ? draft.ops : [];
  ops = ops
    .filter((o) => o && SUPPORTED_OPS.includes(o.op))
    .map((o) => normalizeAiOp(o));
  if (!ops.length) {
    return {
      kind: 'clarify',
      message: '변경할 작업을 정하지 못했어요. 예: “휴지 장보기에 넣어줘”, “닭고기를 고등어로 바꿔줘”.',
      engine,
      proposal: null,
      preview: null,
    };
  }

  try {
    const proposal = createProposal({
      source: 'ai',
      key: draft.key || `chat-${Date.now()}`,
      title: String(draft.title || 'AI 제안').trim() || 'AI 제안',
      reason: String(draft.reason || message).trim() || message,
      actionLabel: '변경 미리보기',
      ops,
    });
    const preview = previewProposal(state, proposal);
    if (!preview.ok) {
      return {
        kind: 'clarify',
        message: `이 변경은 바로 적용할 수 없어요: ${preview.errors.map((e) => e.message).join(' ')} 조건을 알려주시면 다시 맞춰볼게요.`,
        engine,
        proposal: null,
        preview: null,
        rejectedErrors: preview.errors,
      };
    }
    return {
      kind: 'proposal',
      message: message || '변경 미리보기를 확인해 주세요. 승인 전에는 저장되지 않아요.',
      engine,
      proposal,
      preview,
    };
  } catch (err) {
    return {
      kind: 'clarify',
      message:
        err instanceof ProposalError
          ? `제안을 검증하지 못했어요: ${err.message}`
          : '제안 검증 중 문제가 났어요. 다른 말로 다시 부탁해요.',
      engine,
      proposal: null,
      preview: null,
    };
  }
}

function defaultMessage(kind) {
  if (kind === 'clarify') return '조금 더 구체적으로 말씀해 주실 수 있나요?';
  if (kind === 'proposal') return '변경안을 준비했어요. 미리보기에서 승인해 주세요.';
  return '알겠어요.';
}

/** Fill safe defaults for cloud/local model ops before schema validation. */
function normalizeAiOp(op) {
  const payload = { ...(op.payload || {}) };
  if (op.op === 'shopping.add') {
    // Groq often emits name:"휴지 1롤" and omits quantity/unit — reuse quick-add parse.
    const parsed = parseQuickAdd(String(payload.name || payload.item || payload.title || '').trim());
    if (parsed?.name) {
      payload.name = parsed.name;
      const qty = Number(payload.quantity);
      if (!Number.isFinite(qty) || qty <= 0) payload.quantity = parsed.quantity;
      if (!payload.unit) payload.unit = parsed.unit;
      if (!payload.category && parsed.category) payload.category = parsed.category;
    }
    const qty = Number(payload.quantity);
    if (!Number.isFinite(qty) || qty <= 0) payload.quantity = 1;
    if (!payload.unit) payload.unit = '개';
    if (payload.priority !== 'nice') payload.priority = 'must';
  }
  return { op: op.op, payload };
}

/**
 * High-confidence local patterns first, then router (Ollama → Groq), else rules clarify.
 * AI never writes domain state.
 *
 * @param {object} state
 * @param {string} userText
 * @param {object} provider — Ollama provider or createAiRouter()
 * @param {{ forceAi?: boolean }} [opts]
 */
export async function runConversationTurn(state, userText, provider, opts = {}) {
  const text = String(userText || '').trim();
  if (!text) {
    return finalizeTurn(
      state,
      {
        kind: 'clarify',
        message: '무엇을 도와드릴까요? 예: “휴지 사야 해”, “장보기 목록 보여줘”.',
      },
      { engine: 'none' },
    );
  }

  const local = matchLocalIntent(state, text);

  if (!opts.forceAi && local) {
    const finalized = finalizeTurn(state, local, { engine: 'local' });
    if (finalized.kind === 'chat' || finalized.kind === 'clarify' || finalized.kind === 'proposal') {
      return { ...finalized, route: provider?.getRoute?.() || null };
    }
  }

  const context = buildHouseholdContext(state);
  const system = buildSystemPrompt(context);
  const ollamaPrompt = `${system}\n\n사용자: ${text}\n\nJSON:`;

  try {
    let completion;
    if (typeof provider.completeConversation === 'function') {
      completion = await provider.completeConversation({
        userText: text,
        state,
        ollamaCompleteArgs: {
          prompt: ollamaPrompt,
          format: 'json',
          numPredict: 768,
          temperature: 0.1,
        },
      });
    } else {
      const probe = await provider.probe();
      if (probe.status !== 'ready') {
        if (local) return { ...finalizeTurn(state, local, { engine: 'local-offline' }), route: null };
        return {
          ...finalizeTurn(
            state,
            {
              kind: 'clarify',
              message:
                'AI에 연결되지 않았어요. 규칙 제안·장보기·재고·식단은 그대로 쓸 수 있어요. “휴지 사야 해”처럼 짧게 말씀해 주세요.',
            },
            { engine: 'offline' },
          ),
          route: null,
        };
      }
      completion = await provider.complete({
        prompt: ollamaPrompt,
        format: 'json',
        numPredict: 768,
        temperature: 0.1,
      });
    }

    const engine =
      completion.provider === 'groq' ? 'groq' : completion.provider === 'ollama' ? 'ollama' : 'ai';
    const parsed =
      extractJsonObject(completion.text) || extractJsonObject(extractFinalText(completion.raw || {}));
    if (!parsed) {
      if (local) {
        return {
          ...finalizeTurn(state, local, { engine: 'local-after-parse-fail' }),
          route: provider?.getRoute?.() || null,
        };
      }
      return {
        ...finalizeTurn(
          state,
          {
            kind: 'clarify',
            message:
              'AI 응답을 해석하지 못했어요. 장보기·식단·재고 중 원하는 동작을 한 문장으로 다시 말씀해 주세요.',
          },
          { engine: `${engine}-parse-fail` },
        ),
        route: provider?.getRoute?.() || null,
      };
    }
    return {
      ...finalizeTurn(state, parsed, { engine }),
      route: provider?.getRoute?.() || {
        provider: completion.provider,
        model: completion.model,
      },
    };
  } catch (err) {
    if (local) {
      return {
        ...finalizeTurn(state, local, { engine: 'local-after-ai-error' }),
        route: provider?.getRoute?.() || null,
      };
    }
    const limitKind = err.limitKind;
    const msg =
      limitKind === 'rpd'
        ? '오늘 클라우드 AI 무료 한도에 도달했어요. 규칙 비서·장보기·재고는 그대로 쓸 수 있어요. (유료 전환 없음)'
        : limitKind === 'rpm'
          ? '클라우드 AI 분당 한도예요. 잠시 후 다시 시도하거나, “휴지 사야 해”처럼 짧게 말해 주세요.'
          : err.code === 'unauthorized' || err.status === 401
            ? '클라우드 AI는 로그인 후 사용할 수 있어요. 규칙 비서는 계속 동작합니다.'
            : err.code === 'forbidden' || err.status === 403
              ? '이 집 AI 권한이 없어요. 공용 관리자 계정으로 로그인해 주세요.'
              : err.code === 'groq_not_configured' || err.status === 503
                ? 'Groq 시크릿이 아직 없어요. 규칙 비서로 동작합니다.'
                : `AI 요청에 실패했어요 (${err.message || '오류'}). 규칙 홈 제안과 장보기·재고는 계속 사용할 수 있어요.`;
    return {
      ...finalizeTurn(state, { kind: 'clarify', message: msg }, { engine: 'ai-error' }),
      route: provider?.getRoute?.() || { provider: 'rules', model: '', status: 'error', message: msg },
    };
  }
}
