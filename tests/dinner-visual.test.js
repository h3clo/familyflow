import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDinnerVisual } from '../src/domain/dinnerVisual.js';

const state = {
  cookingPatterns: [
    { id: 'p1', name: '야채구이', method: 'roast' },
    { id: 'p2', name: '야채찜', method: 'steam' },
  ],
};

test('maps 야채찜 to steam asset and sauce overlay label', () => {
  const v = resolveDinnerVisual(state, {
    patternId: 'p2',
    patternName: '야채찜',
    sauceName: '마늘간장 소스',
  });
  assert.match(v.imageSrc, /dinner\/steam\.jpg$/);
  assert.equal(v.sauceLabel, '소스 · 마늘간장 소스');
});

test('maps 야채구이 to roast asset', () => {
  const v = resolveDinnerVisual(state, {
    patternName: '야채구이',
    sauceName: '닭 양념 (마늘간장설탕)',
  });
  assert.match(v.imageSrc, /dinner\/roast\.jpg$/);
  assert.equal(v.sauceLabel, '소스 · 닭 양념 (마늘간장설탕)');
});

test('returns no image for unknown patterns', () => {
  const v = resolveDinnerVisual(state, { patternName: '비빔밥', sauceName: null });
  assert.equal(v.imageSrc, null);
  assert.equal(v.sauceLabel, null);
});
