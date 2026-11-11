import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeOrderTitle,
  parseOrderPaste,
  applyClarifyAnswer,
} from '../src/domain/orderPaste.js';
import { createEmptyState } from '../src/domain/state.js';
import { applyPurchaseToInventory } from '../src/domain/inventory.js';

test('normalize core grocery titles from agreed rules', () => {
  assert.deepEqual(pick(normalizeOrderTitle('[KF365] 무항생제 달걀 XL(특란) 40구(20구＊2ea)')), {
    name: '달걀',
    quantity: 40,
    unit: '구',
  });
  assert.deepEqual(pick(normalizeOrderTitle('국산 미니 단호박 4~7입 1.5kg')), {
    name: '미니 단호박',
    quantity: 1.5,
    unit: 'kg',
  });
  assert.deepEqual(pick(normalizeOrderTitle('포스트 아몬드 후레이크 620g 2개+시리얼 30g 2개')), {
    name: '아몬드 후레이크',
    quantity: 1240,
    unit: 'g',
  });
  assert.deepEqual(pick(normalizeOrderTitle('[면사랑] 칼국수사리 230g x 5개입 (개별 포장)')), {
    name: '칼국수사리',
    quantity: 5,
    unit: '개',
  });
  assert.deepEqual(pick(normalizeOrderTitle('[KS365] 3겹 천연펄프 화장지 (27m X 30롤)')), {
    name: '화장지',
    quantity: 30,
    unit: '롤',
  });
  assert.deepEqual(pick(normalizeOrderTitle('[풀무원] 특제 대파 간장 나또 8개입')), {
    name: '낫또',
    quantity: 8,
    unit: '개',
  });
  assert.deepEqual(pick(normalizeOrderTitle('[니뽕내뽕] 크뽕 (크림 짬뽕)')), {
    name: '크뽕',
    quantity: 1,
    unit: '개',
  });
});

test('condiments without size are status-only', () => {
  const nutmeg = normalizeOrderTitle('[칸나멜라] 넛맥 분말');
  assert.equal(nutmeg.name, '넛맥');
  assert.equal(nutmeg.quantity, null);
  assert.equal(nutmeg.needsClarify, false);
  const oil = normalizeOrderTitle('[대한민국농수산] 저온압착 순수 참기름');
  assert.equal(oil.name, '참기름');
  assert.equal(oil.quantity, null);
});

test('slash options and N종 need clarify', () => {
  const tteok = normalizeOrderTitle('[KF365] 한돈 떡갈비 500g/1kg (냉동)');
  assert.equal(tteok.needsClarify, true);
  assert.equal(tteok.name, '떡갈비');
  assert.equal(tteok.location, 'freezer');
  const banana = normalizeOrderTitle('[Dole] 스위티오 바나나 2종 (택1)');
  assert.equal(banana.needsClarify, true);
  assert.equal(banana.name, '바나나');
});

test('택3 ramen registers quantity 3', () => {
  const r = normalizeOrderTitle('[골라담기] 오뚜기 라면 7종 균일가 (택3)');
  assert.deepEqual(pick(r), { name: '라면', quantity: 3, unit: '개' });
});

test('applyClarifyAnswer accepts weight answers', () => {
  const item = normalizeOrderTitle('해뜨레 영암 황토 꿀 고구마 호박고구마 베니하루카');
  assert.equal(item.needsClarify, true);
  const done = applyClarifyAnswer(item, '1kg');
  assert.equal(done.needsClarify, false);
  assert.deepEqual(pick(done), { name: '꿀고구마', quantity: 1, unit: 'kg' });
});

test('parseOrderPaste skips cancelled blocks and durables', () => {
  const text = `
결제완료
[연세우유 x 마켓컬리] 전용목장우유 1.8L
5,200원
취소완료
10.26.(월) 취소
스탠리 퀜처 H2.0 플로우스테이트 텀블러 887ml, 피스타치오
20,820원
반품환불완료
식물성 멜라토닌 5mg 리포좀 30정, 1개
9,800원
구매확정완료
넛티스트 땅콩버터 100% 무첨가 무가당 크리미, 500g, 1개
2,900원
펌퀸 큐핀 모듈에어 마사지기 종아리-발 케어 SET
19,900원
`;
  const { ready, skipped } = parseOrderPaste(text);
  const names = ready.map((r) => r.name);
  assert.ok(names.includes('우유'));
  assert.ok(names.includes('땅콩버터'));
  assert.ok(!names.includes('멜라토닌') && !names.some((n) => /텀블러|마사지기/.test(n)));
  assert.ok(skipped.some((s) => /마사지기|텀블러/.test(s)) || !ready.some((r) => /마사지기/.test(r.sourceText)));
});

test('order detail dump keeps real groceries only (no chrome clarify spam)', () => {
  const text = `
네이버페이주문 상세정보
2026.11.11. 14:18:36
주문번호2026111195348941영수증
멤버십 전용 혜택
패밀리 대표에게 결제 요청하기
주문상품
접기
판매자명컬리N마트
무료 배송
문의하기
배송완료
오늘배송
KURLY.CC02에서 11. 11.(수) 23:59까지 배송
[KF365] 무항생제 달걀 XL(특란) 40구(20구＊2ea)
상품명[KF365] 무항생제 달걀 XL(특란) 40구(20구＊2ea)
옵션
옵션명: [KF365] 무항생제 달걀 XL(특란) 40구(20구＊2ea)1개
상품가격10,860원14,020
상품주문번호 : 2026111135274881복사
구매확정(최대 258원 적립)
배송조회
장바구니 담기
배송완료
상품명[연세우유 x 마켓컬리] 전용목장우유 1.8L
옵션명: [연세우유 x 마켓컬리] 전용목장우유 1.8L1개
상품가격5,200원5,280
상품명[바름팜] 영암 꿀고구마 1kg(26년 햇)
옵션명: [바름팜] 영암 꿀고구마 1kg1개 (-3,000원)
상품명국산 미니 단호박 4~7입 1.5kg
옵션명: 국산 미니 단호박 4~7입 1.5kg1개 (-2,000원)
전체 상품 장바구니 담기
배송지명이혜진(집)
연락처010-2***-1***
주소서울특별시 은평구 ***** (03471)보기
결제정보
신용카드(삼성페이)
`;
  const { ready, needsClarify, skipped } = parseOrderPaste(text);
  void skipped;
  const names = ready.map((r) => r.name).sort();
  assert.deepEqual(names, ['달걀', '미니 단호박', '우유', '꿀고구마'].sort());
  assert.equal(
    needsClarify.length,
    0,
    `unexpected clarify: ${needsClarify.map((c) => c.name).join(', ')}`,
  );
  assert.ok(!ready.some((r) => /상품명|주문|멤버십|연락처|카드/.test(r.name)));
});

test('paste proposals apply to inventory via applyPurchaseToInventory', () => {
  const state = createEmptyState();
  const item = normalizeOrderTitle('[KF365] 무항생제 달걀 XL(특란) 40구(20구＊2ea)');
  applyPurchaseToInventory(
    state,
    {
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      category: item.category,
      location: item.location,
      suggestedStatus: 'enough',
    },
    { accept: true },
  );
  assert.equal(state.inventory.length, 1);
  assert.equal(state.inventory[0].name, '달걀');
  assert.equal(state.inventory[0].quantity, 40);
  assert.equal(state.inventory[0].unit, '구');
});

function pick(item) {
  return { name: item.name, quantity: item.quantity, unit: item.unit };
}
