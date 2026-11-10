import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState, migrateState } from '../src/domain/state.js';
import { seedSauces, seedState } from '../src/domain/seed.js';
import { resolveDinnerVisual } from '../src/domain/dinnerVisual.js';

test('seed nutmeg recipe is olive oil only (no butter)', () => {
  const nutmeg = seedSauces().find((s) => /넛맥/.test(s.name));
  assert.ok(nutmeg);
  assert.equal(nutmeg.name, '넛맥 올리브유 시즈닝');
  assert.ok(nutmeg.components.some((c) => c.name === '올리브유'));
  assert.ok(!nutmeg.components.some((c) => /버터/.test(c.name)));
});

test('v9 migrates legacy 넛맥 버터 시즈닝 rows without dropping sauce id', () => {
  const raw = createEmptyState();
  raw.version = 8;
  raw.sauces = [
    {
      id: 'keep-me',
      name: '넛맥 버터 시즈닝',
      components: [
        { name: '넛맥(육두구)', prep: '살짝' },
        { name: '버터 또는 올리브유' },
        { name: '후추' },
        { name: '소금' },
      ],
      forPatterns: ['야채구이'],
      visualKey: 'nutmeg',
    },
  ];
  raw.todayDinner = {
    title: '야채구이 · 넛맥 버터 시즈닝',
    protein: '닭고기',
    sauceName: '넛맥 버터 시즈닝',
    sauceId: 'keep-me',
  };

  const m = migrateState(raw);
  assert.equal(m.version, 10);
  assert.equal(m.sauces[0].id, 'keep-me');
  assert.equal(m.sauces[0].name, '넛맥 올리브유 시즈닝');
  assert.ok(m.sauces[0].components.every((c) => !/버터/.test(c.name)));
  assert.equal(m.todayDinner.sauceName, '넛맥 올리브유 시즈닝');
  assert.equal(m.todayDinner.sauceId, 'keep-me');
});

test('legacy butter sauce name still resolves nutmeg prebake photo', () => {
  const state = seedState(createEmptyState());
  const v = resolveDinnerVisual(state, {
    patternName: '야채구이',
    sauceName: '넛맥 버터 시즈닝',
  });
  assert.match(v.imageSrc || '', /roast-nutmeg\.jpg/);
});
