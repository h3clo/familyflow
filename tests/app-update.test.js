import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldApplyRemoteBuild, checkForAppUpdate } from '../src/lib/appUpdate.js';

test('shouldApplyRemoteBuild ignores placeholder and equal ids', () => {
  assert.equal(shouldApplyRemoteBuild('__APP_BUILD_ID__', 'abc'), false);
  assert.equal(shouldApplyRemoteBuild('abc', 'abc'), false);
  assert.equal(shouldApplyRemoteBuild('abc', 'def'), true);
  assert.equal(shouldApplyRemoteBuild('', 'def'), false);
  assert.equal(shouldApplyRemoteBuild('2fc82620dbb8', 'nextbuild001'), true);
});

test('checkForAppUpdate reloads once when remote build differs', async () => {
  const storage = new Map();
  const store = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, v),
  };
  let reloads = 0;
  let cleared = 0;

  const fetchImpl = async () => ({
    ok: true,
    json: async () => ({ id: 'newbuild123' }),
  });

  const first = await checkForAppUpdate({
    localId: 'oldbuild000',
    baseUrl: '/familyflow/',
    storage: store,
    fetchImpl,
    reload: () => {
      reloads += 1;
    },
    clear: async () => {
      cleared += 1;
    },
  });
  assert.equal(first, 'reloading');
  assert.equal(reloads, 1);
  assert.equal(cleared, 1);

  const second = await checkForAppUpdate({
    localId: 'oldbuild000',
    baseUrl: '/familyflow/',
    storage: store,
    fetchImpl,
    reload: () => {
      reloads += 1;
    },
    clear: async () => {
      cleared += 1;
    },
  });
  assert.equal(second, 'skipped');
  assert.equal(reloads, 1);
});

test('checkForAppUpdate stays put when already current', async () => {
  let reloads = 0;
  const result = await checkForAppUpdate({
    localId: 'sameid',
    baseUrl: '/',
    storage: null,
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ id: 'sameid' }),
    }),
    reload: () => {
      reloads += 1;
    },
  });
  assert.equal(result, 'current');
  assert.equal(reloads, 0);
});
