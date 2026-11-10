/**
 * Dinner hero visuals — curated pattern photos + sauce as text overlay.
 * Only 야채찜 / 야채구이 assets for now. No runtime AI image generation.
 */

const STEAM_RE = /야채찜|찜/;
const ROAST_RE = /야채구이|구이/;

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

  return {
    patternName,
    method: method || null,
    imageSrc: asset ? `${base}dinner/${asset}` : null,
    sauceLabel: dinnerLike.sauceName ? `소스 · ${dinnerLike.sauceName}` : null,
  };
}

function patternAsset(patternName, method) {
  if (STEAM_RE.test(patternName) || method === 'steam') return 'steam.jpg';
  if (ROAST_RE.test(patternName) || method === 'roast') return 'roast.jpg';
  return null;
}
