import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDinnerVisual, sauceAsset, shortSauceName } from '../src/domain/dinnerVisual.js';

const state = {
  cookingPatterns: [
    { id: 'p1', name: '야채찜', method: 'steam' },
    { id: 'p2', name: '야채구이', method: 'roast' },
  ],
};

test('maps 야채찜 to steam asset and sauce overlay label + png', () => {
  const v = resolveDinnerVisual(state, {
    patternName: '야채찜',
    sauceName: '마늘간장 소스',
  });
  assert.match(v.imageSrc, /dinner\/steam\.jpg$/);
  assert.equal(v.sauceLabel, '소스 · 마늘간장 소스');
  assert.match(v.sauceImageSrc, /dinner\/sauces\/garlic-soy\.png$/);
});

test('maps 야채구이 to roast asset and shortens long sauce chips', () => {
  const v = resolveDinnerVisual(state, {
    patternName: '야채구이',
    sauceName: '닭 양념 (마늘간장설탕)',
  });
  assert.match(v.imageSrc, /dinner\/roast\.jpg$/);
  assert.equal(v.sauceLabel, '소스 · 닭 양념');
  assert.match(v.sauceImageSrc, /dinner\/sauces\/chicken-marinade\.png$/);
});

test('returns no image for unknown patterns', () => {
  const v = resolveDinnerVisual(state, { patternName: '비빔밥', sauceName: null });
  assert.equal(v.imageSrc, null);
  assert.equal(v.sauceLabel, null);
  assert.equal(v.sauceImageSrc, null);
});

test('sauceAsset maps seed sauce names', () => {
  assert.equal(sauceAsset('스리라차'), 'sriracha.png');
  assert.equal(sauceAsset('부추장'), 'chive.png');
  assert.equal(sauceAsset('토마토소스'), 'tomato.png');
  assert.equal(sauceAsset('양꼬치 시즈닝'), 'lamb-spice.png');
  assert.equal(sauceAsset('없는소스'), null);
});

test('shortSauceName strips parenthetical notes', () => {
  assert.equal(shortSauceName('닭 양념 (마늘간장설탕)'), '닭 양념');
});
