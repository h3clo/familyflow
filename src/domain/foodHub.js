/**
 * Food hub helpers — reduce “where do I tap?” friction.
 * Suggest one next action from confirmed state only.
 */

import { ensureActiveList } from './shopping.js';
import { buildDinnerHomeOffer } from './dinnerHome.js';

/**
 * @param {object} state
 * @returns {{ segment: 'shopping'|'inventory'|'meals', title: string, hint: string, cta: string }}
 */
export function nextFoodAction(state) {
  const list = ensureActiveList(state);
  const open = (list.items || []).filter((i) => !i.checked);
  const low = (state.inventory || []).filter((i) => i.status === 'out' || i.status === 'low');
  const dinner = buildDinnerHomeOffer(state);

  if (open.length) {
    const must = open.filter((i) => i.priority === 'must').length;
    return {
      segment: 'shopping',
      title: must ? `필수 ${must}개 사야 해요` : `살 것 ${open.length}개 남았어요`,
      hint: '체크만 하면 돼요. 가격·수량은 나중에 고쳐도 됩니다.',
      cta: '장보기 열기',
    };
  }

  if (low.length) {
    return {
      segment: 'inventory',
      title: `재고 주의 ${low.length}개`,
      hint: '상태만 고쳐도 장보기 제안이 따라와요. 정확한 무게는 필요 없어요.',
      cta: '재고 확인',
    };
  }

  if (dinner.status === 'offer') {
    return {
      segment: 'meals',
      title: '오늘 저녁 후보가 있어요',
      hint: '홈에서 이대로/바꾸기로 고르면 됩니다. 여기선 주간·소스만 정리해요.',
      cta: '식단 보기',
    };
  }

  if (dinner.status === 'empty') {
    return {
      segment: 'inventory',
      title: '저녁 추천에 재료가 부족해요',
      hint: '단백질·재료를 상태만 등록하면, 홈이 먼저 저녁을 제안해요.',
      cta: '재고 등록',
    };
  }

  if (!state.mealPlan) {
    return {
      segment: 'meals',
      title: '이번 주 식단 초안이 없어요',
      hint: '초안만 만들어 두면 평일 고민이 줄어요. 확정은 미리보기 후예요.',
      cta: '식단 초안',
    };
  }

  return {
    segment: 'shopping',
    title: '식생활은 여기 한곳에 모았어요',
    hint: '장보기·재고·식단을 왔다 갔다 찾지 않아도 됩니다.',
    cta: '장보기',
  };
}

/** Normalize legacy tab ids into food hub + segment. */
export function normalizeFoodNav(view, foodSegment) {
  if (view === 'shopping' || view === 'inventory' || view === 'meals') {
    return { view: 'food', foodSegment: view };
  }
  if (view === 'food') {
    const seg = ['shopping', 'inventory', 'meals'].includes(foodSegment) ? foodSegment : 'shopping';
    return { view: 'food', foodSegment: seg };
  }
  return { view, foodSegment: foodSegment || 'shopping' };
}
