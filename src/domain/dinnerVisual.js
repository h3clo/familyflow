/**
 * Dinner hero visuals — prebaked pattern×sauce photos.
 * Faster and less repetitive than one base photo + runtime texture overlay.
 */

const STEAM_RE = /야채찜|찜/;
const ROAST_RE = /야채구이|구이/;

/** sauce visualKey or name → file stem under public/dinner/ */
const SAUCE_KEYS = [
  { match: /부추/, key: 'buchujang' },
  { match: /참깨\s*간장/, key: 'sesame-soy' },
  { match: /겨자\s*간장/, key: 'mustard-soy' },
  { match: /스리라차/, key: 'sriracha' },
  { match: /토마토/, key: 'tomato-onion' },
  { match: /양꼬치|쯔란/, key: 'lamb-skewer' },
  { match: /허니|머스터드|mustard/i, key: 'honey-mustard' },
  { match: /넛맥|육두구|nutmeg/i, key: 'nutmeg' },
  // garlic-soy shared by 찜「마늘 간장」and 구이「간장마늘」
  { match: /마늘\s*간장|간장\s*마늘|마늘간장|간장마늘/, key: 'garlic-soy' },
];

/**
 * @param {object} state
 * @param {{ patternId?: string|null, patternName?: string|null, sauceName?: string|null, sauceId?: string|null }} dinnerLike
 */
export function resolveDinnerVisual(state, dinnerLike = {}) {
  const patterns = state?.cookingPatterns || [];
  const sauces = state?.sauces || [];
  const pattern =
    patterns.find((p) => dinnerLike.patternId && p.id === dinnerLike.patternId) ||
    patterns.find((p) => dinnerLike.patternName && p.name === dinnerLike.patternName) ||
    null;

  const sauce =
    sauces.find((s) => dinnerLike.sauceId && s.id === dinnerLike.sauceId) ||
    sauces.find((s) => dinnerLike.sauceName && s.name === dinnerLike.sauceName) ||
    null;

  const patternName = dinnerLike.patternName || pattern?.name || '';
  const method = pattern?.method || '';
  const sauceName = String(dinnerLike.sauceName || sauce?.name || '').trim();
  const visualKey = sauce?.visualKey || sauceKeyFromName(sauceName);
  const file = prebakedAsset(patternName, method, visualKey);
  const base = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';

  return {
    patternName,
    method: method || null,
    sauceName: sauceName || null,
    sauceShortName: sauceName ? shortSauceName(sauceName) : null,
    imageSrc: file ? `${base}dinner/${file}` : null,
    sauceTextureSrc: null,
  };
}

export function shortSauceName(name) {
  const raw = String(name || '').trim();
  const cut = raw.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  if (cut.length <= 16) return cut;
  return `${cut.slice(0, 15)}…`;
}

export function sauceKeyFromName(sauceName) {
  const raw = String(sauceName || '').trim();
  if (!raw) return null;
  const hit = SAUCE_KEYS.find((row) => row.match.test(raw));
  return hit?.key || null;
}

/** @deprecated use sauceKeyFromName — kept for older tests naming */
export function sauceAsset(sauceName) {
  return sauceKeyFromName(sauceName);
}

function prebakedAsset(patternName, method, visualKey) {
  const kind =
    STEAM_RE.test(patternName) || method === 'steam'
      ? 'steam'
      : ROAST_RE.test(patternName) || method === 'roast'
        ? 'roast'
        : null;
  if (!kind) return null;
  if (visualKey) return `${kind}-${visualKey}.jpg`;
  return `${kind}.jpg`;
}
