/**
 * ActionProposal pipeline — shared by rule engine and future AI (Ollama/NIM).
 *
 * Flow: create proposal → validate/preview (no mutate) → approve → apply (atomic) → mark applied
 *
 * AI providers must only emit JSON matching `assertProposalShape` / `SUPPORTED_OPS`.
 * Never mutate domain state directly from model output.
 */

import { uid } from '../lib/id.js';
import { ensureActiveList, addShoppingItem, removeShoppingItem } from './shopping.js';
import { setInventoryStatus, upsertInventory } from './inventory.js';
import { draftWeek } from './meals.js';
import { normalizeCategory } from './categories.js';

export const PROPOSAL_SCHEMA_VERSION = 1;

/** Whitelist for rules + future Ollama structured output. */
export const SUPPORTED_OPS = Object.freeze([
  'shopping.add',
  'shopping.remove_unchecked',
  'inventory.set_status',
  'inventory.upsert',
  'meals.confirm_dinner',
  'meals.draft_week',
  'meals.confirm_week',
  'meals.replace_protein',
]);

export function openShoppingNames(list) {
  return new Set(
    (list?.items || [])
      .filter((i) => !i.checked)
      .map((i) => normalizeName(i.name)),
  );
}

function normalizeName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

export function proposalFingerprint(proposal) {
  const opsKey = (proposal.ops || [])
    .map((o) => `${o.op}:${o.payload?.name || o.payload?.to || o.payload?.planId || ''}`)
    .join(';');
  return [proposal.source || '', proposal.key || proposal.id || '', opsKey].join('|');
}

export function createProposal({
  source = 'rules',
  title,
  reason,
  actionLabel = '변경 미리보기',
  ops,
  key,
  priority = 50,
  sensitivity = 'household',
  id,
} = {}) {
  const proposal = {
    schemaVersion: PROPOSAL_SCHEMA_VERSION,
    // Stable id when key is set so re-generated rule cards stay idempotent.
    id: id || (key ? `${source}:${key}` : uid()),
    source,
    key: key || null,
    priority,
    title: String(title || '').trim() || '제안',
    reason: String(reason || '').trim(),
    actionLabel,
    sensitivity,
    ops: Array.isArray(ops) ? ops.map(normalizeOp) : [],
    createdAt: new Date().toISOString(),
  };
  assertProposalShape(proposal);
  return proposal;
}

function normalizeOp(op) {
  if (!op || typeof op !== 'object') throw new ProposalError('작업 형식이 올바르지 않아요.');
  return {
    op: String(op.op || ''),
    payload: op.payload && typeof op.payload === 'object' ? { ...op.payload } : {},
  };
}

export class ProposalError extends Error {
  constructor(message, { code = 'invalid' } = {}) {
    super(message);
    this.name = 'ProposalError';
    this.code = code;
  }
}

export function assertProposalShape(proposal) {
  if (!proposal || typeof proposal !== 'object') {
    throw new ProposalError('제안 객체가 없어요.', { code: 'missing' });
  }
  if (proposal.schemaVersion !== PROPOSAL_SCHEMA_VERSION) {
    throw new ProposalError(`지원하지 않는 제안 스키마예요 (v${proposal.schemaVersion}).`, {
      code: 'schema',
    });
  }
  if (!proposal.id || typeof proposal.id !== 'string') {
    throw new ProposalError('제안 id가 필요해요.', { code: 'missing_id' });
  }
  if (!['rules', 'ai', 'test'].includes(proposal.source)) {
    throw new ProposalError('제안 출처(source)가 올바르지 않아요.', { code: 'source' });
  }
  if (proposal.sensitivity === 'personal_health') {
    throw new ProposalError('건강 관련 변경은 이 파이프라인에서 기본 차단돼요.', {
      code: 'sensitivity',
    });
  }
  if (!Array.isArray(proposal.ops) || proposal.ops.length === 0) {
    throw new ProposalError('실행할 작업(ops)이 없어요.', { code: 'empty_ops' });
  }
  if (proposal.ops.length > 20) {
    throw new ProposalError('한 제안에 작업은 20개까지예요.', { code: 'too_many_ops' });
  }
  for (const op of proposal.ops) {
    if (!SUPPORTED_OPS.includes(op.op)) {
      throw new ProposalError(`지원하지 않는 작업이에요: ${op.op}`, { code: 'unsupported_op' });
    }
  }
  return true;
}

export function isProposalApplied(state, proposalId) {
  return !!state.proposalsMeta?.applied?.[proposalId];
}

export function markProposalApplied(state, proposal) {
  if (!state.proposalsMeta) state.proposalsMeta = { applied: {}, dismissed: {} };
  if (!state.proposalsMeta.applied) state.proposalsMeta.applied = {};
  state.proposalsMeta.applied[proposal.id] = {
    at: new Date().toISOString(),
    title: proposal.title,
    source: proposal.source,
  };
}

/**
 * Validate against current state without mutating.
 * Returns preview lines for UI.
 */
export function previewProposal(state, proposal) {
  assertProposalShape(proposal);
  if (isProposalApplied(state, proposal.id)) {
    return {
      ok: true,
      idempotent: true,
      errors: [],
      changes: [{ kind: 'info', text: '이미 승인·반영된 제안이에요. 다시 저장하지 않아요.' }],
    };
  }

  const errors = [];
  const changes = [];
  const draft = structuredClone(state);
  ensureActiveList(draft);

  for (let i = 0; i < proposal.ops.length; i++) {
    try {
      const line = describeAndApplyOp(draft, proposal.ops[i]);
      changes.push({ kind: 'change', index: i, text: line, op: proposal.ops[i].op });
    } catch (err) {
      errors.push({ index: i, op: proposal.ops[i].op, message: err.message, code: err.code || 'op_failed' });
    }
  }

  return {
    ok: errors.length === 0,
    idempotent: false,
    errors,
    changes,
    proposal,
  };
}

/**
 * Atomic apply: all ops on a clone, then copy domain slices back.
 * Re-applying the same proposal id is a no-op success.
 */
export function applyProposal(state, proposal) {
  assertProposalShape(proposal);

  if (isProposalApplied(state, proposal.id)) {
    return {
      ok: true,
      idempotent: true,
      message: '이미 반영된 제안이에요.',
      navigate: 'home',
      changes: [],
    };
  }

  const preview = previewProposal(state, proposal);
  if (!preview.ok) {
    const first = preview.errors[0];
    throw new ProposalError(first?.message || '제안을 적용할 수 없어요.', {
      code: first?.code || 'preview_failed',
    });
  }

  const before = snapshotDomain(state);
  const draft = structuredClone(state);
  ensureActiveList(draft);

  try {
    for (const op of proposal.ops) {
      describeAndApplyOp(draft, op);
    }
  } catch (err) {
    // draft discarded — original state untouched
    throw new ProposalError(err.message || '적용 중 오류가 났어요.', { code: err.code || 'apply_failed' });
  }

  writeDomain(state, draft);
  markProposalApplied(state, proposal);

  // Integrity: if something went wrong copying, we'd still have before — verify shopping list length monotonic for adds
  void before;

  const navigate = inferNavigate(proposal.ops);
  return {
    ok: true,
    idempotent: false,
    message: summarizeApply(proposal),
    navigate,
    changes: preview.changes,
  };
}

function snapshotDomain(state) {
  return {
    shoppingLists: structuredClone(state.shoppingLists),
    inventory: structuredClone(state.inventory),
    mealPlan: structuredClone(state.mealPlan),
    todayDinner: structuredClone(state.todayDinner),
  };
}

function writeDomain(state, draft) {
  state.shoppingLists = draft.shoppingLists;
  state.inventory = draft.inventory;
  state.mealPlan = draft.mealPlan;
  state.todayDinner = draft.todayDinner;
  state.settings.activeListId = draft.settings.activeListId;
}

function inferNavigate(ops) {
  if (ops.some((o) => o.op.startsWith('shopping.'))) return 'shopping';
  if (ops.some((o) => o.op.startsWith('meals.'))) return 'meals';
  if (ops.some((o) => o.op.startsWith('inventory.'))) return 'inventory';
  return 'home';
}

function summarizeApply(proposal) {
  const n = proposal.ops.length;
  if (n === 1) {
    const op = proposal.ops[0].op;
    if (op === 'shopping.add') return `‘${proposal.ops[0].payload.name}’을(를) 장보기에 담았어요.`;
    if (op === 'meals.confirm_dinner') return '오늘 저녁을 확정했어요.';
    if (op === 'meals.draft_week') return '주간 식단 초안을 만들었어요.';
    if (op === 'meals.confirm_week') return '이번 주 식단을 확정했어요.';
    if (op === 'meals.replace_protein') return '메뉴 단백질을 바꿨어요.';
  }
  return `${n}개 변경을 반영했어요.`;
}

/**
 * Always mutates `draft` (caller must pass a clone for preview).
 * Returns a human-readable change line for the approval UI.
 */
function describeAndApplyOp(draft, { op, payload }) {
  const list = ensureActiveList(draft);

  if (op === 'shopping.add') {
    const name = String(payload.name || '').trim();
    if (!name) throw new ProposalError('장보기 품목 이름이 필요해요.');
    // null/omitted/'' → 수량 미확인 (do not invent 1). Positive number required when set.
    let quantity = null;
    if (payload.quantity != null && payload.quantity !== '') {
      quantity = Number(payload.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new ProposalError('장보기 수량을 확인해주세요.');
      }
    }
    const unit =
      payload.unit != null && String(payload.unit).trim()
        ? String(payload.unit).trim()
        : quantity == null
          ? ''
          : '개';
    const priority = payload.priority === 'nice' ? 'nice' : 'must';
    const category = normalizeCategory(payload.category);

    if (openShoppingNames(list).has(normalizeName(name))) {
      if (payload.skipIfExists) {
        return `장보기 ‘${name}’ — 이미 있어서 건너뜀`;
      }
      throw new ProposalError(`이미 장보기 목록에 ‘${name}’이(가) 있어요.`, { code: 'duplicate' });
    }

    addShoppingItem(list, {
      name,
      quantity,
      unit,
      priority,
      category,
      inventoryId: payload.inventoryId || null,
      estimatedPrice: payload.estimatedPrice ?? null,
    });
    const qtyLabel =
      quantity == null ? '수량 미확인' : `${quantity}${unit || ''}`.trim();
    return `장보기 추가: ${name} · ${qtyLabel} (${priority === 'must' ? '필수' : '선택'})`;
  }

  if (op === 'shopping.remove_unchecked') {
    const name = String(payload.name || '').trim();
    if (!name) throw new ProposalError('뺄 장보기 품목 이름이 필요해요.');
    const matches = (list.items || []).filter(
      (i) => !i.checked && normalizeName(i.name) === normalizeName(name),
    );
    if (!matches.length) {
      throw new ProposalError(`장보기 목록에 미구매 ‘${name}’이(가) 없어요.`, { code: 'not_found' });
    }
    for (const item of matches) {
      removeShoppingItem(list, item.id);
    }
    return `장보기에서 제거: ${name} (${matches.length}개)`;
  }

  if (op === 'inventory.set_status') {
    const id = payload.id;
    if (!id) throw new ProposalError('재고 id가 필요해요.');
    const item = draft.inventory.find((x) => x.id === id);
    if (!item) throw new ProposalError('재고 항목을 찾을 수 없어요.');
    const status = payload.status;
    if (!['enough', 'low', 'out', 'unknown'].includes(status)) {
      throw new ProposalError('재고 상태가 올바르지 않아요.');
    }
    setInventoryStatus(draft, id, status);
    return `재고 상태: ${item.name} → ${status}`;
  }

  if (op === 'inventory.upsert') {
    const name = String(payload.name || '').trim();
    if (!name) throw new ProposalError('재고 이름이 필요해요.');
    upsertInventory(draft, payload);
    return `재고 등록/갱신: ${name}`;
  }

  if (op === 'meals.confirm_dinner') {
    const title = String(payload.title || '저녁').trim();
    draft.todayDinner = {
      date: new Date().toISOString().slice(0, 10),
      title,
      protein: payload.protein || null,
      patternId: payload.patternId || null,
      patternName: payload.patternName || '',
      sauceId: payload.sauceId || null,
      sauceName: payload.sauceName || '',
      inventoryId: payload.inventoryId || null,
      confirmedAt: new Date().toISOString(),
    };
    return `오늘 저녁 확정: ${title}${payload.protein ? ` · ${payload.protein}` : ''}`;
  }

  if (op === 'meals.draft_week') {
    draft.mealPlan = draftWeek(draft);
    return '이번 주 식단 초안 생성';
  }

  if (op === 'meals.confirm_week') {
    if (!draft.mealPlan) throw new ProposalError('확정할 주간 식단이 없어요.');
    draft.mealPlan.status = 'confirmed';
    return '이번 주 식단 확정';
  }

  if (op === 'meals.replace_protein') {
    const from = String(payload.from || '').trim();
    const to = String(payload.to || '').trim();
    if (!from || !to) throw new ProposalError('바꿀 단백질(from/to)이 필요해요.');
    const scope = payload.scope === 'today' ? 'today' : 'week';
    const re = proteinMatchRegex(from);
    let count = 0;

    if (scope === 'week' || scope === 'today') {
      const hay = String(draft.todayDinner?.protein || draft.todayDinner?.title || '');
      re.lastIndex = 0;
      if (draft.todayDinner && re.test(hay)) {
        count += 1;
        re.lastIndex = 0;
        draft.todayDinner = {
          ...draft.todayDinner,
          protein: to,
          title: String(draft.todayDinner.title || '').replace(re, to),
        };
      }
      re.lastIndex = 0;
    }

    if (scope === 'week') {
      if (!draft.mealPlan?.days) {
        throw new ProposalError('주간 식단이 없어 단백질을 바꿀 수 없어요. 먼저 초안을 만들어주세요.');
      }
      for (const day of draft.mealPlan.days) {
        for (const slot of day.slots || []) {
          const hay = String(slot.protein || slot.title || '');
          re.lastIndex = 0;
          if (re.test(hay)) {
            count += 1;
            re.lastIndex = 0;
            slot.protein = to;
            slot.title = String(slot.title || '').replace(re, to);
          }
        }
      }
    }

    if (count === 0) {
      throw new ProposalError(`‘${from}’이(가) 들어간 메뉴를 찾지 못했어요.`, { code: 'no_match' });
    }
    return `메뉴 단백질 변경: ${from} → ${to} (${count}곳)`;
  }

  throw new ProposalError(`지원하지 않는 작업이에요: ${op}`, { code: 'unsupported_op' });
}

function proteinMatchRegex(from) {
  const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Also treat 닭고기 / 닭 as related when from is 닭*
  if (/^닭/.test(from)) return /닭(고기|다리살|다리)?/g;
  return new RegExp(escaped, 'g');
}

/**
 * Build the compound proposal used in S2 tests / future AI:
 * "이번 주 닭고기 메뉴를 고등어로 바꾸고, 고등어가 부족하면 장보기 목록에 추가"
 */
export function buildProteinSwapWithShoppingProposal(state, { from = '닭고기', to = '고등어' } = {}) {
  const ops = [
    {
      op: 'meals.replace_protein',
      payload: { from, to, scope: 'week' },
    },
  ];

  const inv = (state.inventory || []).find((i) => normalizeName(i.name) === normalizeName(to));
  const needShop = !inv || inv.status === 'out' || inv.status === 'low' || inv.status === 'unknown';
  if (needShop) {
    ops.push({
      op: 'shopping.add',
      payload: {
        name: to,
        quantity: 1,
        unit: '마리',
        priority: 'must',
        category: 'food',
        skipIfExists: false,
        inventoryId: inv?.id || null,
      },
    });
  }

  const reasonParts = [
    `이번 주 메뉴의 ‘${from}’을(를) ‘${to}’(으)로 바꿉니다.`,
    needShop
      ? inv
        ? `재고 ‘${to}’ 상태가 ${inv.status}이라서 장보기에도 넣습니다.`
        : `재고에 ‘${to}’가 없어 장보기에 추가합니다.`
      : `재고에 ‘${to}’가 충분해서 장보기는 건너뜁니다.`,
  ];

  return createProposal({
    source: 'test',
    key: `protein-swap-${normalizeName(from)}-${normalizeName(to)}`,
    title: `${from} → ${to} 메뉴 변경`,
    reason: reasonParts.join(' '),
    actionLabel: '변경 미리보기',
    priority: 15,
    ops,
  });
}
