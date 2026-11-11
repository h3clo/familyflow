import { ensureActiveList } from './shopping.js';
import { suggestToday, buildWeekShoppingProposal } from './meals.js';
import { inferCategory } from './quick-add.js';
import {
  createProposal,
  proposalFingerprint,
  openShoppingNames,
  applyProposal,
  previewProposal,
} from './proposals.js';

const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

export function suggestionFingerprint(s) {
  return proposalFingerprint(s);
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
    type: suggestion.ops?.[0]?.op || suggestion.type,
  };
  return fp;
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
 * Rule engine → ActionProposal[]. Never invents inventory or purchase history.
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
          { view: 'food', segment: 'inventory', label: '재고 등록', hint: '휴지·식재료 상태만 충분함/없음으로' },
          { view: 'food', segment: 'shopping', label: '장보기 열기', hint: '이미 살 게 있으면 목록에' },
          { view: 'food', segment: 'meals', label: '식단 보기', hint: '야채찜·구이 패턴은 이미 준비됨' },
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
    raw.push(
      createProposal({
        source: 'rules',
        key: `shop-${item.id}`,
        priority: must ? 10 : 20,
        title: must ? `${name} 사야 해요` : `${name} 여유분 확인`,
        reason:
          item.status === 'out'
            ? `재고가 ‘없음’이에요. 장보기 목록에 아직 없어요.`
            : `재고가 ‘부족함’이에요. 이번 장보기에 넣을까요?`,
        actionLabel: '변경 미리보기',
        ops: [
          {
            op: 'shopping.add',
            payload: {
              name,
              quantity: item.quantity && item.quantity > 0 ? item.quantity : guessDefaultQty(name),
              unit: item.unit || guessDefaultUnit(name),
              priority: must ? 'must' : 'nice',
              category: item.category || inferCategory(name),
              inventoryId: item.id,
            },
          },
        ],
      }),
    );
  }

  const protein = (state.inventory || []).find(
    (i) =>
      (i.status === 'enough' || i.status === 'low') &&
      /닭|돼지|소고기|두부|고기|다리살|닭다리|고등어/.test(i.name),
  );
  if (protein && !state.todayDinner) {
    const pattern =
      state.cookingPatterns.find((p) => p.method === 'steam') ||
      state.cookingPatterns.find((p) => p.method === 'roast') ||
      state.cookingPatterns[0];
    const sauce =
      (state.sauces || []).find((s) => (s.forPatterns || []).includes(pattern?.name)) ||
      (state.sauces || [])[0];
    raw.push(
      createProposal({
        source: 'rules',
        key: `meal-protein-${protein.id}`,
        priority: 30,
        title: `오늘 저녁: ${pattern?.name || '요리'} · ${protein.name}`,
        reason: `냉장고에 ‘${protein.name}’이(가) 있어요. 새로 사지 않고 활용할 수 있어요.`,
        actionLabel: '변경 미리보기',
        ops: [
          {
            op: 'meals.confirm_dinner',
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
          },
        ],
      }),
    );
  }

  if (!state.mealPlan) {
    raw.push(
      createProposal({
        source: 'rules',
        key: 'meal-draft-week',
        priority: 40,
        title: '이번 주 식단 초안 만들기',
        reason: '주간 식단이 아직 없어요. 야채찜·구이 패턴으로 초안만 잡아둘까요?',
        actionLabel: '변경 미리보기',
        ops: [{ op: 'meals.draft_week', payload: {} }],
      }),
    );
  } else if (state.mealPlan.status === 'draft') {
    raw.push(
      createProposal({
        source: 'rules',
        key: `meal-confirm-week-${state.mealPlan.id}`,
        priority: 35,
        title: '이번 주 식단 확정',
        reason: '초안이 있어요. 확정하면 평일에는 고민을 줄일 수 있어요.',
        actionLabel: '변경 미리보기',
        ops: [{ op: 'meals.confirm_week', payload: { planId: state.mealPlan.id } }],
      }),
    );
  }

  const weekShop = buildWeekShoppingProposal(state);
  if (weekShop && state.mealPlan) {
    raw.push(weekShop);
  }

  const listEmpty = !(list.items || []).some((i) => !i.checked);
  const outs = (state.inventory || []).filter((i) => i.status === 'out' || i.status === 'low');
  if (listEmpty && outs.length === 0 && (state.inventory || []).length > 0 && !state.todayDinner) {
    const today = suggestToday(state, {});
    const dinner = today.slots.find((s) => s.mealType === 'dinner');
    if (dinner) {
      raw.push(
        createProposal({
          source: 'rules',
          key: 'meal-today-generic',
          priority: 50,
          title: `오늘 저녁 제안: ${dinner.title}`,
          reason: dinner.sauce
            ? `기본 패턴이에요. 소스(${dinner.sauce.name})만 바꿔도 충분해요.`
            : '기본 조리 패턴으로 결정 피로를 줄여요.',
          actionLabel: '변경 미리보기',
          ops: [
            {
              op: 'meals.confirm_dinner',
              payload: {
                mealType: 'dinner',
                title: dinner.title,
                protein: dinner.protein,
                patternId: dinner.pattern?.id || null,
                patternName: dinner.pattern?.name || dinner.title,
                sauceId: dinner.sauce?.id || null,
                sauceName: dinner.sauce?.name || '',
              },
            },
          ],
        }),
      );
    }
  }

  const suggestions = raw
    .filter((s) => !isDismissed(state, s, now))
    .filter((s) => !state.proposalsMeta?.applied?.[s.id])
    .sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title, 'ko'))
    .slice(0, 6);

  return { mode: 'active', suggestions, setup: null };
}

/** @deprecated use previewProposal + applyProposal — kept as thin wrapper for older tests */
export function applySuggestion(state, suggestion) {
  return applyProposal(state, suggestion);
}

export { previewProposal, applyProposal };

function guessDefaultQty(name) {
  if (/휴지|화장지/.test(name)) return 30;
  return 1;
}

function guessDefaultUnit(name) {
  if (/휴지|화장지/.test(name)) return '롤';
  return '개';
}
