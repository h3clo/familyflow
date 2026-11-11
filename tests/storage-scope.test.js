import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSandboxSearch,
  initStorageScope,
  resetStorageScopeForTests,
  scopedStorageKey,
  sanitizeDeviceId,
  sandboxBadgeText,
  getStorageScope,
} from '../src/lib/storageScope.js';
import { saveState, loadState, clearState } from '../src/lib/storage.js';
import { writeDeferAuth, readDeferAuth } from '../src/lib/deferAuth.js';
import { cloudCacheKey, deviceLocalKey, deviceBackupKey } from '../src/cloud/sessionScope.js';

function mockLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    _store: store,
  };
  return store;
}

describe('storageScope', { concurrency: false }, () => {
  test('parseSandboxSearch requires sandbox flag', () => {
    assert.equal(parseSandboxSearch('').enabled, false);
    assert.equal(parseSandboxSearch('?device=only').enabled, false);
    const on = parseSandboxSearch('?sandbox&device=Work-Lane_1');
    assert.equal(on.enabled, true);
    assert.equal(on.device, 'work-lane_1');
    assert.equal(parseSandboxSearch('?sandbox=1').device, 'default');
  });

  test('sanitizeDeviceId strips unsafe chars and caps length', () => {
    assert.equal(sanitizeDeviceId('  Hello World!!  '), 'hello-world');
    assert.equal(sanitizeDeviceId(''), 'default');
    assert.equal(sanitizeDeviceId('a'.repeat(80)).length, 48);
  });

  test('scoped keys isolate state and defer-auth across devices', () => {
    const store = mockLocalStorage();
    try {
      resetStorageScopeForTests();
      initStorageScope('?sandbox&device=alpha');
      saveState({ version: 10, mark: 'alpha' });
      writeDeferAuth(true);
      assert.equal(loadState().mark, 'alpha');
      assert.equal(readDeferAuth(), true);
      assert.ok([...store.keys()].every((k) => k.startsWith('familyflow-sb:alpha:')));

      initStorageScope('?sandbox&device=beta');
      assert.equal(loadState(), null);
      assert.equal(readDeferAuth(), false);
      saveState({ version: 10, mark: 'beta' });
      assert.equal(loadState().mark, 'beta');

      initStorageScope('?sandbox&device=alpha');
      assert.equal(loadState().mark, 'alpha');
      assert.equal(readDeferAuth(), true);

      clearState();
      assert.equal(loadState(), null);
    } finally {
      resetStorageScopeForTests();
    }
  });

  test('default scope keeps legacy key names', () => {
    const store = mockLocalStorage();
    try {
      resetStorageScopeForTests();
      initStorageScope('');
      assert.equal(scopedStorageKey('familyflow-v1'), 'familyflow-v1');
      assert.equal(deviceLocalKey(), 'familyflow-v1');
      assert.equal(deviceBackupKey(), 'familyflow-device-local-backup');
      assert.equal(cloudCacheKey('u1', 'h1'), 'familyflow-cache:u1:h1');
      saveState({ version: 10, mark: 'default' });
      assert.equal(store.get('familyflow-v1') != null, true);
      assert.equal(sandboxBadgeText(getStorageScope()), '');
    } finally {
      resetStorageScopeForTests();
    }
  });

  test('sandbox prefixes cache and badge label', () => {
    try {
      resetStorageScopeForTests();
      initStorageScope('?sandbox&device=qa-sync');
      assert.equal(cloudCacheKey('u1', 'h1'), 'familyflow-sb:qa-sync:familyflow-cache:u1:h1');
      assert.equal(sandboxBadgeText(), 'sandbox · qa-sync');
    } finally {
      resetStorageScopeForTests();
    }
  });
});
