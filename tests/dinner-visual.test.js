import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDinnerVisual, sauceKeyFromName, shortSauceName } from '../src/domain/dinnerVisual.js';

const state = {
  cookingPatterns: [
    { id: 'p1', name: '야채찜', method: 'steam' },
    { id: 'p2', name: '야채구이', method: 'roast' },
    { id: 'p3', name: '샤브샤브', method: 'shabu' },
  ],
  sauces: [
    { id: 's1', name: '마늘 간장 소스', visualKey: 'garlic-soy', forPatterns: ['야채찜'] },
    { id: 's2', name: '간장마늘 양념', visualKey: 'garlic-soy', forPatterns: ['야채구이'] },
    { id: 's3', name: '넛맥 올리브유 시즈닝', visualKey: 'nutmeg', forPatterns: ['야채구이'] },
    { id: 's4', name: '폰즈 소스', visualKey: 'ponzu', forPatterns: ['샤브샤브'] },
    { id: 's5', name: '참깨 소스', visualKey: 'sesame', forPatterns: ['샤브샤브'] },
  ],
};

test('maps 야채찜 + garlic soy to prebaked steam composite', () => {
  const v = resolveDinnerVisual(state, {
    patternName: '야채찜',
    sauceName: '마늘 간장 소스',
  });
  assert.match(v.imageSrc, /dinner\/steam-garlic-soy\.jpg\?v=.*20261111e/);
  assert.equal(v.sauceShortName, '마늘 간장 소스');
  assert.equal(v.sauceTextureSrc, null);
});

test('maps 야채구이 + nutmeg to prebaked roast composite', () => {
  const v = resolveDinnerVisual(state, {
    patternName: '야채구이',
    sauceName: '넛맥 올리브유 시즈닝',
  });
  assert.match(v.imageSrc, /dinner\/roast-nutmeg\.jpg\?v=/);
});

test('falls back to pattern-only asset when sauce unknown', () => {
  const v = resolveDinnerVisual(state, { patternName: '야채구이', sauceName: null });
  assert.match(v.imageSrc, /dinner\/roast\.jpg\?v=/);
});

test('returns no image for unknown patterns', () => {
  const v = resolveDinnerVisual(state, { patternName: '비빔밥', sauceName: null });
  assert.equal(v.imageSrc, null);
});

test('maps 샤브샤브 + ponzu/sesame to prebaked assets', () => {
  assert.match(
    resolveDinnerVisual(state, { patternName: '샤브샤브', sauceName: '폰즈 소스' }).imageSrc,
    /dinner\/shabu-ponzu\.jpg\?v=/,
  );
  assert.match(
    resolveDinnerVisual(state, { patternName: '샤브샤브', sauceName: '참깨 소스' }).imageSrc,
    /dinner\/shabu-sesame\.jpg\?v=/,
  );
});

test('sauceKeyFromName maps catalog names', () => {
  assert.equal(sauceKeyFromName('스리라차 소스'), 'sriracha');
  assert.equal(sauceKeyFromName('부추장'), 'buchujang');
  assert.equal(sauceKeyFromName('토마토 양파 소스'), 'tomato-onion');
  assert.equal(sauceKeyFromName('양꼬치 양념'), 'lamb-skewer');
  assert.equal(sauceKeyFromName('폰즈 소스'), 'ponzu');
  assert.equal(sauceKeyFromName('참깨 간장 소스'), 'sesame-soy');
  assert.equal(sauceKeyFromName('참깨 소스'), 'sesame');
  assert.equal(sauceKeyFromName('없는소스'), null);
});

test('missing prebake stem falls back to pattern-only file', () => {
  const v = resolveDinnerVisual(
    {
      cookingPatterns: [{ id: 'p1', name: '야채구이', method: 'roast' }],
      sauces: [{ id: 's1', name: '부추장', visualKey: 'buchujang', forPatterns: ['야채구이'] }],
    },
    { patternName: '야채구이', sauceName: '부추장' },
  );
  // roast-buchujang.jpg is not shipped — use roast.jpg instead of a 404.
  assert.match(v.imageSrc, /dinner\/roast\.jpg\?v=/);
});

test('shortSauceName strips parenthetical notes', () => {
  assert.equal(shortSauceName('허니머스터드 소스 (테스트)'), '허니머스터드 소스');
});
