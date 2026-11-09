import { ensureActiveList } from '../domain/shopping.js';

/** Compact, non-sensitive snapshot for local Ollama — no health/finance secrets. */
export function buildHouseholdContext(state) {
  const list = ensureActiveList(state);
  const open = (list.items || []).filter((i) => !i.checked);
  const inventory = (state.inventory || []).map((i) => ({
    id: i.id,
    name: i.name,
    status: i.status,
    location: i.location,
    category: i.category,
    unit: i.unit,
  }));
  const proteins = [];
  if (state.mealPlan?.days) {
    for (const day of state.mealPlan.days) {
      for (const slot of day.slots || []) {
        if (slot.mealType === 'dinner' && slot.protein) {
          proteins.push({ date: day.date, protein: slot.protein, title: slot.title });
        }
      }
    }
  }
  const patterns = (state.cookingPatterns || []).map((p) => ({
    id: p.id,
    name: p.name,
    method: p.method,
    effort: p.effort,
  }));

  return {
    household: state.household?.name || '우리 집',
    shoppingOpen: open.map((i) => ({
      name: i.name,
      quantity: i.quantity,
      unit: i.unit,
      priority: i.priority,
    })),
    inventory,
    todayDinner: state.todayDinner
      ? { title: state.todayDinner.title, protein: state.todayDinner.protein }
      : null,
    weekDinnerProteins: proteins,
    mealPlanStatus: state.mealPlan?.status || null,
    patterns,
  };
}

/**
 * Cloud-safe context for Groq Edge Function.
 * No ids, no member notes, no health/finance, capped list sizes.
 */
export function buildCloudSafeContext(state) {
  const full = buildHouseholdContext(state);
  return {
    household: full.household,
    shoppingOpen: (full.shoppingOpen || []).slice(0, 40).map((i) => ({
      name: i.name,
      quantity: i.quantity,
      unit: i.unit,
      priority: i.priority,
    })),
    inventory: (full.inventory || []).slice(0, 60).map((i) => ({
      name: i.name,
      status: i.status,
      location: i.location,
      category: i.category,
    })),
    todayDinner: full.todayDinner,
    weekDinnerProteins: (full.weekDinnerProteins || []).slice(0, 14),
    mealPlanStatus: full.mealPlanStatus,
    patterns: (full.patterns || []).slice(0, 12).map((p) => ({
      name: p.name,
      method: p.method,
      effort: p.effort,
    })),
  };
}

export function formatShoppingListReply(state) {
  const list = ensureActiveList(state);
  const open = (list.items || []).filter((i) => !i.checked);
  if (!open.length) return '이번 주 장보기 목록에 아직 살 것이 없어요.';
  const lines = open.map(
    (i) => `· ${i.name} ${i.quantity}${i.unit} (${i.priority === 'must' ? '필수' : '선택'})`,
  );
  return `이번 장보기 목록이에요:\n${lines.join('\n')}`;
}
