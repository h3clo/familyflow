import { uid } from '../lib/id.js';

const MEAL_TYPES = [
  { id: 'breakfast', label: '아침', effortCap: 'low' },
  { id: 'lunch', label: '점심', effortCap: 'low' },
  { id: 'dinner', label: '저녁', effortCap: 'medium' },
];

/** Simple rule-based today suggestion — no AI. */
export function suggestToday(state, { noShop = false, lazy = false, avoidProtein } = {}) {
  const sauces = state.sauces || [];
  const patterns = state.cookingPatterns || [];
  const steam = patterns.find((p) => p.method === 'steam') || patterns[0];
  const roast = patterns.find((p) => p.method === 'roast') || patterns[1];
  const easy = patterns.find((p) => p.effort === 'low') || patterns[2];

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

  const dinnerPattern = lazy ? easy : Math.random() < 0.5 ? steam : roast;
  const dinnerSauce = pickSauce(dinnerPattern?.name, new Date().getDate());

  const slots = [
    {
      mealType: 'breakfast',
      pattern: easy,
      title: lazy || true ? '구운란 · 찐빵' : easy?.name,
      protein: null,
      sauce: null,
      effort: 'low',
      note: '조리 최소',
    },
    {
      mealType: 'lunch',
      pattern: easy,
      title: '남은 야채 간단 조립',
      protein: null,
      sauce: pickSauce('야채찜', 1),
      effort: 'low',
      note: '간단',
    },
    {
      mealType: 'dinner',
      pattern: dinnerPattern,
      title: dinnerPattern?.name || '저녁',
      protein: lazy ? null : protein,
      sauce: dinnerSauce,
      effort: lazy ? 'low' : 'medium',
      note: dinnerSauce ? `소스: ${dinnerSauce.name}` : '소스만 바꿔도 OK',
    },
  ];

  if (noShop) {
    for (const slot of slots) {
      if (inventoryNames.size === 0) {
        slot.note = `${slot.note} · 재고 비어 있음 — 최소 장보기 필요할 수 있어요`;
      } else {
        slot.note = `${slot.note} · 재고 위주`;
      }
    }
  }

  return { date: todayKey(), slots, mealTypes: MEAL_TYPES };
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

/** Draft week: rotate steam/roast + sauces, easy breakfasts. */
export function draftWeek(state) {
  const plan = emptyWeekPlan();
  const steam = state.cookingPatterns.find((p) => p.method === 'steam');
  const roast = state.cookingPatterns.find((p) => p.method === 'roast');
  const easy = state.cookingPatterns.find((p) => p.effort === 'low');
  const steamSauces = state.sauces.filter((s) => (s.forPatterns || []).includes('야채찜'));
  const roastSauces = state.sauces.filter((s) => (s.forPatterns || []).includes('야채구이'));
  const proteins = ['닭고기', '돼지고기', '소고기', '두부'];

  plan.days.forEach((day, i) => {
    const dinnerPattern = i % 2 === 0 ? steam : roast;
    const saucePool = dinnerPattern === steam ? steamSauces : roastSauces;
    const sauce = saucePool[i % Math.max(saucePool.length, 1)];
    day.slots = day.slots.map((slot) => {
      if (slot.mealType === 'breakfast') {
        return {
          ...slot,
          patternId: easy?.id,
          title: '간단 아침',
          status: 'suggested',
        };
      }
      if (slot.mealType === 'lunch') {
        return {
          ...slot,
          patternId: easy?.id,
          title: '간단 점심',
          status: 'suggested',
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
