/**
 * Deterministic Korean colloquial patterns — offline fallback / safety net.
 * Never mutates state; returns turn intents only.
 */

import { ensureActiveList } from '../domain/shopping.js';
import { buildProteinSwapWithShoppingProposal } from '../domain/proposals.js';
import { formatShoppingListReply } from './householdContext.js';

/**
 * @returns {null | object} intent draft (same shape as AI JSON before finalize)
 */
export function matchLocalIntent(state, userText) {
  const text = String(userText || '').trim();
  if (!text) return null;
  const compact = text.replace(/\s+/g, '');

  // Show shopping list — chat only
  if (/장보기/.test(text) && /(목록|리스트|뭐\s*사|보여|알려)/.test(text)) {
    return {
      kind: 'chat',
      message: formatShoppingListReply(state),
      source: 'local',
    };
  }

  // Tissue out → shopping.add
  if (/휴지/.test(text) && /(떨어|없|다\s*썼|사야|장보)/.test(text)) {
    return {
      kind: 'proposal',
      title: '휴지 장보기 추가',
      reason: '휴지가 떨어졌다고 하셨어요. 다음 장보기에 넣을까요?',
      message: '휴지를 장보기 목록에 넣는 변경안을 만들었어요. 미리보기에서 확인해 주세요.',
      ops: [
        {
          op: 'shopping.add',
          payload: {
            name: '휴지',
            quantity: 30,
            unit: '롤',
            priority: 'must',
            category: 'household',
          },
        },
      ],
      source: 'local',
    };
  }

  // Chicken → mackerel compound (바꿔/바꿀 등 활용 포함)
  if (/닭/.test(text) && /고등어/.test(text) && /(바꾸|바꿔|바꿀|교체|대신)/.test(text)) {
    if (!state.mealPlan?.days) {
      return {
        kind: 'clarify',
        message: '주간 식단이 아직 없어요. 먼저 식단 탭에서 초안을 만들까요, 아니면 오늘 저녁만 바꿀까요?',
        source: 'local',
      };
    }
    const proposal = buildProteinSwapWithShoppingProposal(state, { from: '닭고기', to: '고등어' });
    return {
      kind: 'proposal',
      title: proposal.title,
      reason: proposal.reason,
      message: '닭고기→고등어 변경안을 준비했어요. 승인 전에는 저장되지 않아요.',
      ops: proposal.ops,
      key: proposal.key,
      source: 'local',
    };
  }

  // Fridge dinner idea
  if (/냉장고|재료/.test(text) && /(저녁|뭐\s*해|메뉴|먹을)/.test(text)) {
    const enough = (state.inventory || []).filter(
      (i) => (i.status === 'enough' || i.status === 'low') && /닭|돼지|소고기|두부|고기|고등어|계란|달걀/.test(i.name),
    );
    if (!enough.length) {
      return {
        kind: 'clarify',
        message:
          '냉장고에 등록된 단백질·주요 재료가 없어요. 재고 탭에 있는 재료를 알려주시거나, 재고를 먼저 등록해 주실 수 있나요?',
        source: 'local',
      };
    }
    const pick = enough[0];
    const pattern =
      state.cookingPatterns?.find((p) => p.method === 'steam') ||
      state.cookingPatterns?.find((p) => p.method === 'roast') ||
      state.cookingPatterns?.find((p) => p.effort === 'medium') ||
      state.cookingPatterns?.[0];
    const title = `${pattern?.name || '저녁'} · ${pick.name}`;
    return {
      kind: 'proposal',
      title: `오늘 저녁 제안: ${title}`,
      reason: `재고 ‘${pick.name}’(상태 ${pick.status})을(를) 활용하는 저녁이에요.`,
      message: `재고 기준으로 ‘${title}’을(를) 추천해요. 확정하려면 미리보기에서 승인해 주세요.`,
      ops: [
        {
          op: 'meals.confirm_dinner',
          payload: {
            title,
            protein: pick.name,
            patternId: pattern?.id || null,
            patternName: pattern?.name || '',
            inventoryId: pick.id,
          },
        },
      ],
      source: 'local',
    };
  }

  // Don't buy eggs this week
  if (/(계란|달걀)/.test(text) && /(안\s*사|사지\s*마|충분|많|여유)/.test(text)) {
    const list = ensureActiveList(state);
    const onList = (list.items || []).filter((i) => !i.checked && /(계란|달걀)/.test(i.name));
    const inv = (state.inventory || []).find((i) => /(계란|달걀)/.test(i.name));
    if (onList.length) {
      return {
        kind: 'proposal',
        title: '계란 장보기 제외',
        reason: '계란이 충분하다고 하셔서 장보기에서 뺄게요.',
        message: '장보기에 있는 계란을 빼는 변경안이에요.',
        ops: onList.map((i) => ({
          op: 'shopping.remove_unchecked',
          payload: { name: i.name },
        })),
        source: 'local',
      };
    }
    if (inv && inv.status !== 'enough') {
      return {
        kind: 'proposal',
        title: '계란 재고 충분함',
        reason: '계란이 많다고 하셔서 재고 상태를 충분함으로 맞춰둘까요?',
        message: '재고 상태만 바꾸는 제안이에요.',
        ops: [{ op: 'inventory.set_status', payload: { id: inv.id, status: 'enough' } }],
        source: 'local',
      };
    }
    return {
      kind: 'chat',
      message: '알겠어요. 계란은 이번 장보기에서 사지 않는 걸로 기억할게요. 목록에도 계란이 없어서 바꿀 항목은 없어요.',
      source: 'local',
    };
  }

  // Simple dinner tomorrow / today
  if (/(내일|오늘)?\s*저녁/.test(text) && /(간단|대충|쉽게|피곤|귀찮)/.test(text)) {
    if (/내일/.test(text) && !/오늘/.test(text)) {
      return {
        kind: 'clarify',
        message:
          '내일 저녁을 지금 확정할까요, 아니면 오늘 저녁을 간단하게 잡을까요? (지금은 날짜별 식단 슬롯이 하루 단위라서 확인이 필요해요.)',
        source: 'local',
      };
    }
    const easy =
      state.cookingPatterns?.find((p) => p.effort === 'low') ||
      state.cookingPatterns?.find((p) => p.method === 'steam') ||
      state.cookingPatterns?.[0];
    const title = easy?.name ? `${easy.name} · 간단` : '간단 저녁';
    return {
      kind: 'proposal',
      title: `오늘 저녁: ${title}`,
      reason: '간단하게 먹고 싶다고 하셔서 저노력 패턴으로 잡았어요.',
      message: '오늘 저녁을 간단 메뉴로 확정하는 변경안이에요.',
      ops: [
        {
          op: 'meals.confirm_dinner',
          payload: {
            title,
            protein: null,
            patternId: easy?.id || null,
            patternName: easy?.name || '',
          },
        },
      ],
      source: 'local',
    };
  }

  // Explicit greeting / thanks — chat
  if (/^(안녕|고마워|감사|헬로|hi|hello)[\s!.]*$/i.test(compact)) {
    return {
      kind: 'chat',
      message: '안녕하세요. 장보기·재고·식단 이야기를 말씀해 주세요. 변경은 미리보기 승인 후에만 저장돼요.',
      source: 'local',
    };
  }

  return null;
}
