import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuickAdd } from '../src/domain/quick-add.js';

test('parses tissue roll utterance', () => {
  const r = parseQuickAdd('휴지가 다 떨어졌어. 이번 장보기 목록에 휴지 30롤 넣어줘.');
  assert.equal(r.name, '휴지');
  assert.equal(r.quantity, 30);
  assert.equal(r.unit, '롤');
  assert.equal(r.priority, 'must');
  assert.equal(r.category, 'household');
});

test('parses simple qty unit', () => {
  const r = parseQuickAdd('우유 2개');
  assert.equal(r.name, '우유');
  assert.equal(r.quantity, 2);
  assert.equal(r.category, 'food');
});

test('returns null for empty', () => {
  assert.equal(parseQuickAdd(''), null);
});

test('infers snack category for 과자', () => {
  const r = parseQuickAdd('과자 2봉');
  assert.equal(r.name, '과자');
  assert.equal(r.category, 'snack');
});
