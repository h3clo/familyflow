/**
 * Home dinner recommendation.
 * Prefer confirmed protein stock; if none yet, fall back to starter pattern×protein
 * suggestions (does not invent inventory rows). Changes go through ActionProposal only.
 */
import { createProposal } from './proposals.js';

const PROTEIN_RE = /닭|돼지|소고기|두부|고기|고등어|삼치|연어|계란|달걀/;

/** Early-home defaults when the household has not registered protein stock yet. */
export const STARTER_PROTEINS = ['닭고기', '고등어', '돼지고기', '두부'];

/**
 * @param {object} state
 * @param {{ altIndex?: number }} [opts]
 */
export function buildDinnerHomeOffer(state, opts = {}) {
  if (state.todayDinner) {
    return {
      status: 'confirmed',
      dinner: state.todayDinner,
      offer: null,
      emptyReason: null,
    };
  }

  const candidates = listDinnerCandidates(state);
  if (!candidates.length) {
    return {
      status: 'empty',
      dinner: null,
      offer: null,
      emptyReason:
        '추천할 저녁이 부족해요. 식단 패턴이 준비되면 홈에서 바로 제안해요.',
    };
  }

  const altIndex = Math.abs(Number(opts.altIndex) || 0) % candidates.length;
  const pick = candidates[altIndex];
  const nextIndex = (altIndex + 1) % candidates.length;
  const hasAlt = candidates.length > 1;

  const ops = [
    {
      op: 'meals.confirm_dinner',
      payload: {
        mealType: 'dinner',
        title: pick.title,
        protein: pick.protein,
        patternId: pick.patternId,
        patternName: pick.patternName,
        sauceId: pick.sauceId,
        sauceName: pick.sauceName,
        inventoryId: pick.inventoryId,
      },
    },
  ];

  if (pick.shopping) {
    ops.push({
      op: 'shopping.add',
      payload: {
        name: pick.shopping.name,
        quantity: pick.shopping.quantity,
        unit: pick.shopping.unit,
        priority: 'must',
        category: 'food',
        inventoryId: pick.shopping.inventoryId || null,
        skipIfExists: true,
      },
    });
  }

  const proposal = createProposal({
    source: 'rules',
    key: `home-dinner-${pick.key}`,
    priority: 10,
    title: `오늘 저녁: ${pick.title}`,
    reason: pick.reasons.join(' · '),
    actionLabel: '이대로 미리보기',
    ops,
  });

  return {
    status: 'offer',
    dinner: null,
    offer: {
      ...pick,
      altIndex,
      nextAltIndex: hasAlt ? nextIndex : altIndex,
      hasAlt,
      proposal,
    },
    emptyReason: null,
  };
}

/** Deterministic candidates from confirmed proteins, else starter proteins. */
export function listDinnerCandidates(state) {
  const inventory = state.inventory || [];
  const patterns = state.cookingPatterns || [];
  const sauces = state.sauces || [];
  const recentProteins = recentProteinHints(state);

  const dinnerPatterns = patterns.filter((p) => p.method === 'steam' || p.method === 'roast');
  const usePatterns = dinnerPatterns.length
    ? dinnerPatterns
    : patterns[0]
      ? [patterns[0]]
      : [null];

  const confirmed = inventory
    .filter((i) => PROTEIN_RE.test(i.name))
    .filter((i) => i.status === 'enough' || i.status === 'low' || i.status === 'out')
    .slice()
    .sort((a, b) => statusRank(a.status) - statusRank(b.status) || a.name.localeCompare(b.name, 'ko'));

  const proteinSources = confirmed.length
    ? confirmed.map((item) => ({
        keyId: item.id,
        name: item.name,
        inventoryId: item.id,
        stockStatus: item.status,
        tracked: true,
      }))
    : STARTER_PROTEINS.map((name) => ({
        keyId: `starter-${normalize(name)}`,
        name,
        inventoryId: null,
        stockStatus: 'untracked',
        tracked: false,
      }));

  const candidates = [];

  for (const source of proteinSources) {
    for (const pattern of usePatterns) {
      const saucePool = pattern
        ? sauces.filter((s) => (s.forPatterns || []).includes(pattern.name))
        : [];
      const sauce =
        pickPreferredSauce(saucePool, source.name) || (!saucePool.length ? sauces[0] : null) || null;

      const reasons = [];
      const unknowns = [];
      if (source.stockStatus === 'enough') reasons.push(`재고: ${source.name} 충분`);
      if (source.stockStatus === 'low') reasons.push(`재고: ${source.name} 부족(확인됨)`);
      if (source.stockStatus === 'out') reasons.push(`재고: ${source.name} 없음(확인됨)`);
      if (source.stockStatus === 'untracked') {
        reasons.push('재고 등록 전 · 자주 쓰는 패턴으로 먼저 제안');
        unknowns.push(`${source.name} 재고는 아직 확인하지 않음`);
      }

      const effort = pattern?.effort === 'low' ? '낮음' : pattern?.effort === 'medium' ? '보통' : null;
      if (effort) reasons.push(`조리 부담: ${effort}(${pattern.name})`);

      if (recentProteins.has(normalize(source.name))) {
        reasons.push('최근 같은 재료를 썼어요 · 다른 후보도 볼 수 있어요');
      } else if (recentProteins.size && source.tracked) {
        reasons.push('최근 식단에 이 재료는 안 보임(확인된 범위)');
      }

      let shopping = null;
      if (source.stockStatus === 'out' || source.stockStatus === 'low') {
        shopping = {
          name: source.name,
          quantity: 1,
          unit: guessUnit(source.name),
          inventoryId: source.inventoryId,
        };
        reasons.push(
          source.stockStatus === 'out'
            ? `장보기 제안: ${source.name} (재고 없음)`
            : `장보기 제안: ${source.name} (재고 부족)`,
        );
      }

      // Sauce components are not inventory-tracked — do not invent gaps.
      if (sauce) {
        unknowns.push(`소스(${sauce.name}) 재료 재고는 확인하지 않음`);
      }

      const title = pattern ? `${pattern.name} · ${source.name}` : source.name;
      candidates.push({
        key: `${source.keyId}-${pattern?.id || 'none'}-${sauce?.id || 'none'}`,
        title,
        protein: source.name,
        inventoryId: source.inventoryId,
        patternId: pattern?.id || null,
        patternName: pattern?.name || '',
        sauceId: sauce?.id || null,
        sauceName: sauce?.name || '',
        reasons,
        unknowns,
        shopping,
        stockStatus: source.stockStatus,
      });
    }
  }

  // Prefer in-stock first, then not-recent
  candidates.sort((a, b) => {
    const sr = statusRank(a.stockStatus) - statusRank(b.stockStatus);
    if (sr) return sr;
    const ar = recentProteins.has(normalize(a.protein)) ? 1 : 0;
    const br = recentProteins.has(normalize(b.protein)) ? 1 : 0;
    if (ar !== br) return ar - br;
    return a.title.localeCompare(b.title, 'ko');
  });

  return candidates;
}

function recentProteinHints(state) {
  const set = new Set();
  if (state.todayDinner?.protein) set.add(normalize(state.todayDinner.protein));
  const days = state.mealPlan?.days || [];
  for (const day of days) {
    for (const slot of day.slots || []) {
      if (slot.mealType === 'dinner' && slot.protein) set.add(normalize(slot.protein));
    }
  }
  return set;
}

function statusRank(status) {
  if (status === 'enough') return 0;
  if (status === 'low') return 1;
  if (status === 'out') return 2;
  if (status === 'untracked') return 3;
  return 9;
}

function normalize(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

function guessUnit(name) {
  if (/고등어|삼치|연어/.test(name)) return '마리';
  if (/계란|달걀/.test(name)) return '개';
  if (/두부/.test(name)) return '모';
  return '개';
}

/** Prefer household default sauces from seed (닭 양념 / 마늘간장 등). */
function pickPreferredSauce(pool, protein) {
  if (!pool?.length) return null;
  if (/닭/.test(protein || '')) {
    const chicken = pool.find((s) => /닭/.test(s.name));
    if (chicken) return chicken;
  }
  const garlic = pool.find((s) => /마늘간장/.test(s.name));
  if (garlic) return garlic;
  return pool[0];
}
