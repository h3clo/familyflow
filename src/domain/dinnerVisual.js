/**
 * Dinner hero visuals — prebaked pattern×sauce photos.
 * Faster and less repetitive than one base photo + runtime texture overlay.
 */

import { APP_BUILD_ID } from '../lib/buildId.js';

const STEAM_RE = /야채찜|찜/;
const ROAST_RE = /야채구이|구이/;
const SHABU_RE = /샤브/;

/** sauce visualKey or name → file stem under public/dinner/ */
const SAUCE_KEYS = [
  { match: /부추/, key: 'buchujang' },
  { match: /참깨/, key: 'sesame' },
  { match: /겨자\s*간장/, key: 'mustard-soy' },
  { match: /스리라차/, key: 'sriracha' },
  { match: /토마토/, key: 'tomato-onion' },
  { match: /양꼬치|쯔란/, key: 'lamb-skewer' },
  { match: /허니|머스터드|mustard/i, key: 'honey-mustard' },
  // Match legacy 「넛맥 버터 시즈닝」 and current 「넛맥 올리브유 시즈닝」.
  { match: /넛맥|육두구|nutmeg/i, key: 'nutmeg' },
  { match: /폰즈|ponzu/i, key: 'ponzu' },
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
    // Bust SW/CDN caches when a public/dinner/*.jpg asset is replaced in-place.
    imageSrc: file ? `${base}dinner/${file}?v=${encodeURIComponent(assetVersion())}` : null,
    sauceTextureSrc: null,
  };
}

function assetVersion() {
  const id = String(APP_BUILD_ID || '');
  if (id && !id.includes('APP_BUILD_ID')) return id;
  return 'dev';
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
    SHABU_RE.test(patternName) || method === 'shabu'
      ? 'shabu'
      : STEAM_RE.test(patternName) || method === 'steam'
        ? 'steam'
        : ROAST_RE.test(patternName) || method === 'roast'
          ? 'roast'
          : null;
  if (!kind) return null;
  if (visualKey) {
    // Steam/roast sesame sauces historically used sesame-soy filename.
    if ((kind === 'steam' || kind === 'roast') && visualKey === 'sesame') {
      return `${kind}-sesame-soy.jpg`;
    }
    return `${kind}-${visualKey}.jpg`;
  }
  return `${kind}.jpg`;
}
