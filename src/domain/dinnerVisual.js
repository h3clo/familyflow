/**
 * Dinner hero visuals — pattern photos + sauce texture overlays
 * (sauce looks poured onto the dish; not a text chip / bowl thumbnail).
 */

const STEAM_RE = /야채찜|찜/;
const ROAST_RE = /야채구이|구이/;

/** Seed sauce name → texture PNG under public/dinner/sauces/ */
const SAUCE_ASSETS = [
  { match: /닭\s*양념|마늘간장설탕/, file: 'chicken-marinade.png' },
  { match: /마늘간장/, file: 'garlic-soy.png' },
  { match: /토마토/, file: 'tomato.png' },
  { match: /스리라차/, file: 'sriracha.png' },
  { match: /부추/, file: 'chive.png' },
  { match: /양꼬치|시즈닝/, file: 'lamb-spice.png' },
];

/**
 * @param {object} state
 * @param {{ patternId?: string|null, patternName?: string|null, sauceName?: string|null }} dinnerLike
 */
export function resolveDinnerVisual(state, dinnerLike = {}) {
  const patterns = state?.cookingPatterns || [];
  const pattern =
    patterns.find((p) => dinnerLike.patternId && p.id === dinnerLike.patternId) ||
    patterns.find((p) => dinnerLike.patternName && p.name === dinnerLike.patternName) ||
    null;

  const patternName = dinnerLike.patternName || pattern?.name || '';
  const method = pattern?.method || '';
  const asset = patternAsset(patternName, method);
  const base = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';
  const sauceName = String(dinnerLike.sauceName || '').trim();
  const sauceFile = sauceAsset(sauceName);

  return {
    patternName,
    method: method || null,
    imageSrc: asset ? `${base}dinner/${asset}` : null,
    sauceName: sauceName || null,
    sauceShortName: sauceName ? shortSauceName(sauceName) : null,
    sauceTextureSrc: sauceFile ? `${base}dinner/sauces/${sauceFile}` : null,
  };
}

export function shortSauceName(name) {
  const raw = String(name || '').trim();
  const cut = raw.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  if (cut.length <= 14) return cut;
  return `${cut.slice(0, 13)}…`;
}

export function sauceAsset(sauceName) {
  const raw = String(sauceName || '').trim();
  if (!raw) return null;
  const hit = SAUCE_ASSETS.find((row) => row.match.test(raw));
  return hit?.file || null;
}

function patternAsset(patternName, method) {
  if (STEAM_RE.test(patternName) || method === 'steam') return 'steam.jpg';
  if (ROAST_RE.test(patternName) || method === 'roast') return 'roast.jpg';
  return null;
}
