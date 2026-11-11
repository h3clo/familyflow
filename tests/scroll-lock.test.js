import test from 'node:test';
import assert from 'node:assert/strict';
import { currentScrollY, pinWindowTop, restoreScrollY } from '../src/lib/scrollLock.js';

test('currentScrollY prefers window then document scroll tops', () => {
  globalThis.window = { scrollY: 0, pageYOffset: 0 };
  globalThis.document = {
    documentElement: { scrollTop: 0 },
    body: { scrollTop: 28 },
  };
  assert.equal(currentScrollY(), 28);
});

test('pinWindowTop forces scroll to 0 when forced', () => {
  const calls = [];
  globalThis.window = {
    scrollY: 40,
    pageYOffset: 40,
    scrollTo: (x, y) => calls.push([x, y]),
  };
  globalThis.document = {
    documentElement: { scrollTop: 40 },
    body: { scrollTop: 40 },
  };

  pinWindowTop({ force: true });
  assert.deepEqual(calls[0], [0, 0]);
  assert.equal(document.documentElement.scrollTop, 0);
  assert.equal(document.body.scrollTop, 0);
});

test('pinWindowTop ignores large user scroll unless forced', () => {
  const calls = [];
  globalThis.window = {
    scrollY: 240,
    pageYOffset: 240,
    scrollTo: (x, y) => calls.push([x, y]),
  };
  globalThis.document = {
    documentElement: { scrollTop: 240 },
    body: { scrollTop: 240 },
  };

  pinWindowTop();
  assert.equal(calls.length, 0);
  pinWindowTop({ force: true });
  assert.deepEqual(calls[0], [0, 0]);
});

test('restoreScrollY restores the previous window offset', () => {
  const calls = [];
  globalThis.window = {
    scrollY: 0,
    pageYOffset: 0,
    scrollTo: (x, y) => calls.push([x, y]),
  };
  globalThis.document = {
    documentElement: { scrollTop: 0 },
    body: { scrollTop: 0 },
  };
  restoreScrollY(180);
  assert.deepEqual(calls[0], [0, 180]);
  assert.equal(document.documentElement.scrollTop, 180);
});
