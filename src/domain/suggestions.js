import { ensureActiveList, addShoppingItem } from './shopping.js';
import { draftWeek, suggestToday } from './meals.js';
import { inferCategory } from './quick-add.js';

const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000; // 거절 후 3일간 같은 지문 숨김

export function suggestionFingerprint(s) {
  return [s.type, s.key || '', s.payload?.name || '', s.payload?.mealType || ''].join('|');
}

export function isDismissed(state, suggestion, now = Date.now()) {
  const fp = suggestionFingerprint(suggestion);
  const row = state.suggestionsMeta?.dismissed?.[fp];
  if (!row) return false;
  const until = Date.parse(row.until || 0);
  return Number.isFinite(until) && until > now;
}

export function dismissSuggestion(state, suggestion, now = Date.now()) {
  if (!state.suggestionsMeta) state.suggestionsMeta = { dismissed: {} };
  if (!state.suggestionsMeta.dismissed) state.suggestionsMeta.dismissed = {};
  const fp = suggestionFingerprint(suggestion);
  state.suggestionsMeta.dismissed[fp] = {
    until: new Date(now + SNOOZE_MS).toISOString(),
    at: new Date(now).toISOString(),
    type: suggestion.type,
  };
  return fp;
}

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

export function hasDataForSuggestions(state) {
  const list = ensureActiveList(state);
  const hasInv = (state.inventory || []).length > 0;
  const hasShop = (list.items || []).length > 0;
  const hasDinner = !!state.todayDinner;
  const hasPlan = !!state.mealPlan;
  return hasInv || hasShop || hasDinner || hasPlan;
}

/**
 * Rule-based proactive suggestions. Never invents inventory or purchase history.
 */
export function generateSuggestions(state, now = Date.now()) {
  const list = ensureActiveList(state);
  const onList = openShoppingNames(list);
  const raw = [];

  if (!hasDataForSuggestions(state)) {
    return {
      mode: 'setup',
      suggestions: [],
      setup: {
        title: '가족을 챙기려면 조금만 알려주세요',
        steps: [
          { view: 'inventory', label: '재고 등록', hint: '휴지·식재료 상태만 충분함/없음으로' },
          { view: 'shopping', label: '장보기 열기', hint: '이미 살 게 있으면 목록에' },
          { view: 'meals', label: '식단 보기', hint: '야채찜·구이 패턴은 이미 준비됨' },
        ],
      },
    };
  }

  for (const item of state.inventory || []) {
    if (item.status !== 'out' && item.status !== 'low') continue;
    const name = item.name.trim();
    if (!name) continue;
    if (onList.has(normalizeName(name))) continue;

    const must = item.status === 'out';
    raw.push({
      id: `shop-${item.id}`,
      type: 'shopping.add',
      key: item.id,
      priority: must ? 10 : 20,
      title: must ? `${name} 사야 해요` : `${name} 여유분 확인`,
      reason:
        item.status === 'out'
          ? `재고가 ‘없음’이에요. 장보기 목록에 아직 없어요.`
          : `재고가 ‘부족함’이에요. 이번 장보기에 넣을까요?`,
      actionLabel: '장보기에 담기',
      payload: {
        name,
        quantity: item.quantity && item.quantity > 0 ? item.quantity : guessDefaultQty(name),
        unit: item.unit || guessDefaultUnit(name),
        priority: must ? 'must' : 'nice',
        category: item.category || inferCategory(name),
        inventoryId: item.id,
      },
    });
  }

  // Protein on hand → dinner idea (no invented stock)
  const protein = (state.inventory || []).find(
    (i) =>
      (i.status === 'enough' || i.status === 'low') &&
      /닭|돼지|소고기|두부|고기|다리살|닭다리/.test(i.name),
  );
  if (protein && !state.todayDinner) {
    const pattern =
      state.cookingPatterns.find((p) => p.method === 'steam') ||
      state.cookingPatterns.find((p) => p.method === 'roast') ||
      state.cookingPatterns[0];
    const sauce =
      (state.sauces || []).find((s) => (s.forPatterns || []).includes(pattern?.name)) ||
      (state.sauces || [])[0];
    raw.push({
      id: `meal-protein-${protein.id}`,
      type: 'meals.confirm_dinner',
      key: protein.id,
      priority: 30,
      title: `오늘 저녁: ${pattern?.name || '요리'} · ${protein.name}`,
      reason: `냉장고에 ‘${protein.name}’이(가) 있어요. 새로 사지 않고 활용할 수 있어요.`,
      actionLabel: '오늘 저녁으로 확정',
      payload: {
        mealType: 'dinner',
        title: `${pattern?.name || '저녁'} · ${protein.name}`,
        protein: protein.name,
        patternId: pattern?.id || null,
        patternName: pattern?.name || '',
        sauceId: sauce?.id || null,
        sauceName: sauce?.name || '',
        inventoryId: protein.id,
      },
    });
  }

  if (!state.mealPlan) {
    raw.push({
      id: 'meal-draft-week',
      type: 'meals.draft_week',
      key: 'week',
      priority: 40,
      title: '이번 주 식단 초안 만들기',
      reason: '주간 식단이 아직 없어요. 야채찜·구이 패턴으로 초안만 잡아둘까요?',
      actionLabel: '초안 만들기',
      payload: {},
    });
  } else if (state.mealPlan.status === 'draft') {
    raw.push({
      id: 'meal-confirm-week',
      type: 'meals.confirm_week',
      key: state.mealPlan.id,
      priority: 35,
      title: '이번 주 식단 확정',
      reason: '초안이 있어요. 확정하면 평일에는 고민을 줄일 수 있어요.',
      actionLabel: '주간 식단 확정',
      payload: { planId: state.mealPlan.id },
    });
  }

  const listEmpty = !(list.items || []).some((i) => !i.checked);
  const outs = (state.inventory || []).filter((i) => i.status === 'out' || i.status === 'low');
  if (listEmpty && outs.length === 0 && (state.inventory || []).length > 0 && !state.todayDinner) {
    const today = suggestToday(state, {});
    const dinner = today.slots.find((s) => s.mealType === 'dinner');
    if (dinner) {
      raw.push({
        id: 'meal-today-generic',
        type: 'meals.confirm_dinner',
        key: 'today-generic',
        priority: 50,
        title: `오늘 저녁 제안: ${dinner.title}`,
        reason: dinner.sauce
          ? `기본 패턴이에요. 소스(${dinner.sauce.name})만 바꿔도 충분해요.`
          : '기본 조리 패턴으로 결정 피로를 줄여요.',
        actionLabel: '오늘 저녁으로 확정',
        payload: {
          mealType: 'dinner',
          title: dinner.title,
          protein: dinner.protein,
          patternId: dinner.pattern?.id || null,
          patternName: dinner.pattern?.name || dinner.title,
          sauceId: dinner.sauce?.id || null,
          sauceName: dinner.sauce?.name || '',
        },
      });
    }
  }

  const suggestions = raw
    .filter((s) => !isDismissed(state, s, now))
    .sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title, 'ko'))
    .slice(0, 6);

  return { mode: 'active', suggestions, setup: null };
}

export function applySuggestion(state, suggestion) {
  if (!suggestion?.type) throw new Error('제안이 없어요.');
  const list = ensureActiveList(state);

  if (suggestion.type === 'shopping.add') {
    const name = String(suggestion.payload?.name || '').trim();
    if (!name) throw new Error('품목 이름이 없어요.');
    if (openShoppingNames(list).has(normalizeName(name))) {
      throw new Error('이미 장보기 목록에 있어요.');
    }
    addShoppingItem(list, {
      name,
      quantity: suggestion.payload.quantity,
      unit: suggestion.payload.unit,
      priority: suggestion.payload.priority,
      category: suggestion.payload.category,
      inventoryId: suggestion.payload.inventoryId || null,
    });
    return { message: `‘${name}’을(를) 장보기에 담았어요.`, navigate: 'shopping' };
  }

  if (suggestion.type === 'meals.confirm_dinner') {
    const p = suggestion.payload || {};
    state.todayDinner = {
      date: new Date().toISOString().slice(0, 10),
      title: p.title || '저녁',
      protein: p.protein || null,
      patternId: p.patternId || null,
      patternName: p.patternName || '',
      sauceId: p.sauceId || null,
      sauceName: p.sauceName || '',
      inventoryId: p.inventoryId || null,
      confirmedAt: new Date().toISOString(),
    };
    return { message: '오늘 저녁을 확정했어요.', navigate: 'home' };
  }

  if (suggestion.type === 'meals.draft_week') {
    state.mealPlan = draftWeek(state);
    return { message: '주간 식단 초안을 만들었어요.', navigate: 'meals' };
  }

  if (suggestion.type === 'meals.confirm_week') {
    if (!state.mealPlan) throw new Error('확정할 식단이 없어요.');
    state.mealPlan.status = 'confirmed';
    return { message: '이번 주 식단을 확정했어요.', navigate: 'meals' };
  }

  throw new Error('알 수 없는 제안이에요.');
}

function guessDefaultQty(name) {
  if (/휴지|화장지/.test(name)) return 30;
  return 1;
}

function guessDefaultUnit(name) {
  if (/휴지|화장지/.test(name)) return '롤';
  return '개';
}
