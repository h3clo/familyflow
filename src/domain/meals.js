import { uid } from '../lib/id.js';
import { createProposal, openShoppingNames } from './proposals.js';
import { ensureActiveList } from './shopping.js';
import { inferCategory } from './quick-add.js';
import {
  normalizeItemName,
  findInventoryByName,
  resolveSauceComponentStatuses,
  shoppingNeedsFromStatuses,
} from './inventoryMatch.js';

/** Kept for week schema / future breakfast·lunch recommendations. */
const MEAL_TYPES = [
  { id: 'breakfast', label: '아침', effortCap: 'low' },
  { id: 'lunch', label: '점심', effortCap: 'low' },
  { id: 'dinner', label: '저녁', effortCap: 'medium' },
];

/**
 * Rule-based today suggestion — dinner only for now.
 * Breakfast/lunch stay empty until we add real recommendations later.
 */
export function suggestToday(state, { noShop = false, lazy = false, avoidProtein } = {}) {
  const sauces = state.sauces || [];
  const patterns = state.cookingPatterns || [];
  const steam = patterns.find((p) => p.method === 'steam') || patterns[0];
  const roast = patterns.find((p) => p.method === 'roast') || patterns[1];
  const easy = patterns.find((p) => p.effort === 'low' && p.method !== 'assemble') || patterns.find((p) => p.method === 'steam');

  const inventoryNames = new Set(
    (state.inventory || [])
      .filter((i) => i.status === 'enough' || i.status === 'low')
      .map((i) => i.name),
  );

  const pickSauce = (patternName, index) => {
    const pool = sauces.filter((s) => (s.forPatterns || []).includes(patternName));
    if (!pool.length) return null;
    return pool[index % pool.length];
  };

  const protein = avoidProtein === '닭' ? '돼지고기' : avoidProtein === '돼지' ? '소고기' : '닭고기';

  const dinnerPattern = lazy ? easy || steam : Math.random() < 0.5 ? steam : roast;
  const dinnerSauce = pickSauce(dinnerPattern?.name, new Date().getDate());

  const dinner = {
    mealType: 'dinner',
    pattern: dinnerPattern,
    title: dinnerPattern?.name || '저녁',
    protein: lazy ? null : protein,
    sauce: dinnerSauce,
    effort: lazy ? 'low' : 'medium',
    note: dinnerSauce ? `소스: ${dinnerSauce.name}` : '소스만 바꿔도 OK',
  };

  if (noShop) {
    dinner.note =
      inventoryNames.size === 0
        ? `${dinner.note} · 재고 비어 있음 — 최소 장보기 필요할 수 있어요`
        : `${dinner.note} · 재고 위주`;
  }

  return { date: todayKey(), slots: [dinner], mealTypes: MEAL_TYPES };
}

export function emptyWeekPlan(weekStart = mondayKey()) {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStart, i);
    days.push({
      date: d,
      slots: MEAL_TYPES.map((m) => ({
        id: uid(),
        mealType: m.id,
        patternId: null,
        sauceId: null,
        protein: null,
        title: '',
        status: 'empty',
      })),
    });
  }
  return {
    id: uid(),
    weekStart,
    status: 'draft',
    days,
  };
}

/** Draft week: dinner only. Breakfast/lunch left empty on purpose. */
export function draftWeek(state) {
  const plan = emptyWeekPlan();
  const steam = state.cookingPatterns.find((p) => p.method === 'steam');
  const roast = state.cookingPatterns.find((p) => p.method === 'roast');
  const steamSauces = state.sauces.filter((s) => (s.forPatterns || []).includes('야채찜'));
  const roastSauces = state.sauces.filter((s) => (s.forPatterns || []).includes('야채구이'));
  const proteins = ['닭고기', '돼지고기', '소고기', '두부'];

  plan.days.forEach((day, i) => {
    const dinnerPattern = i % 2 === 0 ? steam : roast;
    const saucePool = dinnerPattern === steam ? steamSauces : roastSauces;
    const sauce = saucePool[i % Math.max(saucePool.length, 1)];
    day.slots = day.slots.map((slot) => {
      if (slot.mealType !== 'dinner') {
        return {
          ...slot,
          patternId: null,
          sauceId: null,
          protein: null,
          title: '',
          status: 'empty',
        };
      }
      return {
        ...slot,
        patternId: dinnerPattern?.id,
        sauceId: sauce?.id,
        protein: proteins[i % proteins.length],
        title: `${dinnerPattern?.name || '저녁'}${sauce ? ` · ${sauce.name}` : ''}`,
        status: 'suggested',
      };
    });
  });
  return plan;
}

/**
 * Collect confirmed low/out needs from this week's dinner slots
 * (protein + sauce components). Skips unknown/missing — no qty inventing.
 */
export function weekDinnerShortages(state) {
  const plan = state?.mealPlan;
  if (!plan?.days?.length) return [];

  const rows = [];
  const seenProtein = new Set();

  for (const day of plan.days) {
    for (const slot of day.slots || []) {
      if (slot.mealType !== 'dinner') continue;
      if (!slot.protein && !slot.sauceId) continue;

      if (slot.protein) {
        const key = normalizeItemName(slot.protein);
        if (!seenProtein.has(key)) {
          seenProtein.add(key);
          const item = findInventoryByName(state, slot.protein);
          if (item) {
            rows.push({
              name: slot.protein,
              matchedName: item.name,
              status: item.status,
              inventoryId: item.id,
              optional: false,
              item,
            });
          } else {
            // Untracked protein: do not invent shopping — same as home untracked.
            rows.push({
              name: slot.protein,
              matchedName: slot.protein,
              status: 'missing',
              inventoryId: null,
              optional: false,
              item: null,
            });
          }
        }
      }

      if (slot.sauceId) {
        const sauce = (state.sauces || []).find((s) => s.id === slot.sauceId);
        if (sauce) {
          for (const row of resolveSauceComponentStatuses(state, sauce)) {
            rows.push(row);
          }
        }
      }
    }
  }

  const list = ensureActiveList(state);
  const onList = openShoppingNames(list);
  return shoppingNeedsFromStatuses(rows).filter(
    (need) => !onList.has(normalizeItemName(need.name)),
  );
}

/**
 * App-proposed shopping top-up for week dinner shortages (ActionProposal).
 * Returns null when nothing to add.
 */
export function buildWeekShoppingProposal(state) {
  const needs = weekDinnerShortages(state);
  if (!needs.length) return null;

  const ops = needs.map((need) => ({
    op: 'shopping.add',
    payload: {
      name: need.name,
      quantity: need.quantity,
      unit: need.unit,
      priority: need.priority || 'must',
      category: need.category || inferCategory(need.name),
      inventoryId: need.inventoryId || null,
      skipIfExists: true,
    },
  }));

  const names = needs.map((n) => n.name).slice(0, 4).join(' · ');
  const more = needs.length > 4 ? ` 외 ${needs.length - 4}` : '';

  return createProposal({
    source: 'rules',
    key: `week-shop-${state.mealPlan?.id || 'none'}-${needs.map((n) => normalizeItemName(n.name)).sort().join('-')}`,
    priority: 25,
    title: `주간 식단 부족한 재료 ${needs.length}개`,
    reason: `이번 주 저녁에 확인된 부족/없음: ${names}${more}. 이미 목록에 있는 품목은 건너뛰어요.`,
    actionLabel: '장보기 미리보기',
    ops,
  });
}

/**
 * View model for Meals › 오늘 — same source of truth as Home (`buildDinnerHomeOffer`).
 * Confirm CTA stays on Home; Meals is read-aligned.
 */
export function mealsTodayViewModel(dinnerHome) {
  if (!dinnerHome) {
    return { status: 'empty', title: '', protein: null, sauceName: '', hint: '', stockLabel: null };
  }
  if (dinnerHome.status === 'confirmed') {
    const d = dinnerHome.dinner || {};
    return {
      status: 'confirmed',
      title: d.title || '오늘 저녁',
      protein: d.protein || null,
      sauceName: d.sauceName || '',
      hint: '홈에서 확정한 오늘 저녁이에요.',
      stockLabel: null,
    };
  }
  if (dinnerHome.status === 'offer') {
    const o = dinnerHome.offer || {};
    return {
      status: 'offer',
      title: o.title || '오늘 저녁',
      protein: o.protein || null,
      sauceName: o.sauceName || '',
      hint: '확정은 홈에서 「이대로」로 해요. 여기는 같은 후보를 보여 줘요.',
      stockLabel: o.stockLabel || null,
    };
  }
  return {
    status: 'empty',
    title: '추천할 저녁이 부족해요',
    protein: null,
    sauceName: '',
    hint: dinnerHome.emptyReason || '',
    stockLabel: null,
  };
}

function todayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function mondayKey(d = new Date()) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return todayKey(x);
}

function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return todayKey(d);
}
