import test from 'node:test';
import assert from 'node:assert/strict';
import { readDeferAuth, writeDeferAuth, hasLocalHouseholdActivity } from '../src/lib/deferAuth.js';
import { resetStorageScopeForTests } from '../src/lib/storageScope.js';

test('defer auth preference round-trips in localStorage', () => {
  resetStorageScopeForTests();
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };

  assert.equal(readDeferAuth(), false);
  writeDeferAuth(true);
  assert.equal(readDeferAuth(), true);
  assert.equal(store.get('familyflow-defer-auth'), '1');
  writeDeferAuth(false);
  assert.equal(readDeferAuth(), false);
});

test('hasLocalHouseholdActivity detects dinner/inventory/shopping/extra members', () => {
  assert.equal(hasLocalHouseholdActivity({ members: [{ id: '1' }] }), false);
  assert.equal(hasLocalHouseholdActivity({ todayDinner: { title: 'x' }, members: [{ id: '1' }] }), true);
  assert.equal(hasLocalHouseholdActivity({ inventory: [{ name: '두부' }], members: [{ id: '1' }] }), true);
  assert.equal(
    hasLocalHouseholdActivity({
      shoppingLists: [{ items: [{ name: '휴지' }] }],
      members: [{ id: '1' }],
    }),
    true,
  );
  assert.equal(
    hasLocalHouseholdActivity({
      members: [
        { id: '1' },
        { id: '2' },
      ],
    }),
    true,
  );
});
