/**
 * Home dinner recommendation (ranking v2).
 * Prefer confirmed protein stock; if none, starter pattern×protein (untracked).
 * Never invents inventory rows. Changes go through ActionProposal only.
 */
import { createProposal } from './proposals.js';
import {
  parseFamilyPreferenceNotes,
  scoreDinnerCandidate,
  compareDinnerScores,
} from './dinnerRank.js';

const PROTEIN_RE = /닭|돼지|소고기|두부|고기|고등어|삼치|연어|계란|달걀/;

/** Early-home defaults when the household has not registered protein stock yet. */
export const STARTER_PROTEINS = ['닭고기', '고등어', '돼지고기', '두부'];

export const UNTRACKED_STOCK_LABEL = '재고 미확인 · 가정 제안';

/**
 * Hero title matches prebaked pattern×sauce photos.
 * Protein is a pairing suggestion — show separately as 곁들임, not in the title.
 */
export function formatDinnerOfferTitle({ patternName, sauceName, protein } = {}) {
  const pattern = String(patternName || '').trim();
  const sauce = shortenSauceLabel(sauceName);
  if (pattern && sauce) return `${pattern} · ${sauce}`;
  if (pattern) return pattern;
  return String(protein || '').trim() || '오늘 저녁';
}

/** Trim trailing 소스/양념 noise for compact titles. */
export function shortenSauceLabel(name) {
  return String(name || '')
    .trim()
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*(소스|양념|시즈닝)\s*$/g, '')
    .trim();
}

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
      canRegisterStock: pick.stockStatus === 'untracked' && !!pick.protein,
      stockLabel: pick.stockStatus === 'untracked' ? UNTRACKED_STOCK_LABEL : null,
    },
    emptyReason: null,
  };
}

/**
 * Build inventory upsert proposal only from user-confirmed fields.
 * Does not invent status/quantity/location — missing required fields → error.
 *
 * @param {{ name: string, status: string, location: string, quantity?: string|number|null, unit?: string|null }} input
 */
export function createStockRegisterProposalFromUserInput(input = {}) {
  const name = String(input.name || '').trim();
  const status = String(input.status || '').trim();
  const location = String(input.location || '').trim();
  const unitRaw = String(input.unit || '').trim();
  const qtyRaw = input.quantity;

  if (!name) {
    return { ok: false, error: '재료 이름이 필요해요.', proposal: null };
  }
  if (!['enough', 'low', 'out', 'unknown'].includes(status)) {
    return {
      ok: false,
      error: '보유 상태(충분함/부족함/없음/모름)를 선택해 주세요. 추정으로 넣지 않아요.',
      proposal: null,
    };
  }
  if (!['fridge', 'freezer', 'pantry', 'storage'].includes(location)) {
    return {
      ok: false,
      error: '보관 위치를 선택해 주세요. 추정으로 넣지 않아요.',
      proposal: null,
    };
  }

  const payload = {
    name,
    status,
    location,
    category: 'food',
  };

  if (qtyRaw !== '' && qtyRaw != null) {
    const quantity = Number(qtyRaw);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { ok: false, error: '수량은 비우거나 0보다 큰 숫자로 적어 주세요.', proposal: null };
    }
    payload.quantity = quantity;
  }
  // No quantity key → inventory stays quantity:null (user left blank on purpose).

  if (unitRaw) {
    payload.unit = unitRaw.slice(0, 12);
  }

  const statusLabel =
    { enough: '충분함', low: '부족함', out: '없음', unknown: '모름' }[status] || status;

  const proposal = createProposal({
    source: 'rules',
    key: `home-dinner-stock-${name}-${status}-${location}`,
    priority: 40,
    title: `재고로 등록: ${name}`,
    reason: `직접 확인한 값만 넣어요 · 상태 ${statusLabel} · 위치 ${location}${
      payload.quantity != null ? ` · 수량 ${payload.quantity}` : ' · 수량 미입력'
    }. 저녁 확정과는 별개예요.`,
    actionLabel: '재고 등록 미리보기',
    ops: [{ op: 'inventory.upsert', payload }],
  });

  return { ok: true, error: null, proposal };
}

/** Deterministic candidates with blended ranking (not absolute stock-first). */
export function listDinnerCandidates(state) {
  const inventory = state.inventory || [];
  const patterns = state.cookingPatterns || [];
  const sauces = state.sauces || [];
  const recentProteins = recentProteinHints(state);
  const prefs = parseFamilyPreferenceNotes(state.members);

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
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

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
      // One candidate per pattern×sauce so 「바꾸기」 cycles hero photos (not just protein).
      // Soft preference only reorders — it must not collapse every row onto garlic-soy.
      const preferred = pickPreferredSauce(saucePool, source.name);
      const sauceChoices = saucePool.length
        ? preferred
          ? [preferred, ...saucePool.filter((s) => s.id !== preferred.id)]
          : saucePool
        : [sauces[0] || null];

      for (const sauce of sauceChoices) {
        const recent = recentProteins.has(normalize(source.name));
        const effort = pattern?.effort || null;
        const reasons = [];
        const unknowns = [];

        if (source.stockStatus === 'enough') reasons.push(`재고 확인 · ${source.name} 충분`);
        if (source.stockStatus === 'low') reasons.push(`재고 확인 · ${source.name} 부족`);
        if (source.stockStatus === 'out') reasons.push(`재고 확인 · ${source.name} 없음`);
        if (source.stockStatus === 'untracked') {
          reasons.push(UNTRACKED_STOCK_LABEL);
          unknowns.push(`${source.name} 재고는 아직 확인하지 않음`);
        }

        if (effort === 'low') reasons.push('조리 부담 낮음');
        else if (effort === 'medium') reasons.push('조리 부담 보통');
        else if (effort === 'high') reasons.push('조리 부담 높음');

        if (recent) reasons.push('최근 같은 재료 · 다른 후보도 볼 수 있어요');
        else if (recentProteins.size) reasons.push('최근 식단에 안 나온 재료');

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
              ? `장보기 제안 · ${source.name} (없음)`
              : `장보기 제안 · ${source.name} (부족)`,
          );
        }

        if (sauce) {
          unknowns.push(`소스(${sauce.name}) 재료 재고는 확인하지 않음`);
        }

        const title = formatDinnerOfferTitle({
          patternName: pattern?.name || '',
          sauceName: sauce?.name || '',
          protein: source.name,
        });
        const score = scoreDinnerCandidate(
          {
            stockStatus: source.stockStatus,
            effort,
            protein: source.name,
            patternName: pattern?.name || '',
            recent,
          },
          prefs,
        );

        if (score.preferenceKind === 'like') reasons.push('가족 취향 · 맞춤');
        else if (score.preferenceKind === 'dislike') reasons.push('가족 취향 · 비선호 신호');
        else if (score.preferenceKind === 'conflict') reasons.push('가족 취향 · 선호 충돌(신중)');

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
          effort,
          recent,
          score,
        });
      }
    }
  }

  candidates.sort(compareDinnerScores);
  return candidates;
}

/**
 * Recent-meal duplication signal is **protein-name based only**
 * (todayDinner.protein + mealPlan dinner slot proteins).
 * Cooking pattern / sauce repetition is NOT included in v2 ranking.
 */
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

/**
 * Soft preference only (ordering hint). Do not collapse every protein onto garlic-soy —
 * that made 「바꾸기」 show just roast/steam garlic photos despite 12 prebakes on disk.
 */
function pickPreferredSauce(pool, protein) {
  if (!pool?.length) return null;
  if (/닭/.test(protein || '')) {
    const garlicSoy = pool.find((s) => /간장마늘|마늘\s*간장|마늘간장/.test(s.name));
    if (garlicSoy) return garlicSoy;
    // Prefer olive-oil nutmeg label; still accept legacy butter-named rows.
    const nutmeg = pool.find((s) => /넛맥|육두구/.test(s.name));
    if (nutmeg) return nutmeg;
  }
  if (/양|lamb/i.test(protein || '')) {
    const lamb = pool.find((s) => /양꼬치|쯔란/.test(s.name));
    if (lamb) return lamb;
  }
  return null;
}
