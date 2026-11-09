import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyState } from '../src/domain/state.js';
import { seedState } from '../src/domain/seed.js';
import { createInventoryItem } from '../src/domain/inventory.js';
import { draftWeek } from '../src/domain/meals.js';
import { ensureActiveList, addShoppingItem } from '../src/domain/shopping.js';
import { applyProposal } from '../src/domain/proposals.js';
import { matchLocalIntent } from '../src/ai/localIntent.js';
import {
  extractJsonObject,
  finalizeTurn,
  runConversationTurn,
} from '../src/ai/conversation.js';

function fresh() {
  return seedState(createEmptyState());
}

function withChickenWeek() {
  const state = fresh();
  state.mealPlan = draftWeek(state);
  for (const day of state.mealPlan.days) {
    const dinner = day.slots.find((s) => s.mealType === 'dinner');
    if (dinner) {
      dinner.protein = '닭고기';
      dinner.title = `야채찜 · 닭고기`;
    }
  }
  return state;
}

function mockProvider(probeStatus = 'ready', completeText = '{}') {
  return {
    async probe() {
      return { status: probeStatus, message: probeStatus, models: probeStatus === 'ready' ? ['qwen3:4b'] : [] };
    },
    async complete() {
      return { text: completeText, model: 'qwen3:4b', raw: { response: completeText } };
    },
  };
}

test('extractJsonObject pulls embedded JSON', () => {
  assert.deepEqual(extractJsonObject('여기요 {"kind":"chat","message":"안녕"} 끝'), {
    kind: 'chat',
    message: '안녕',
  });
});

test('tissue colloquial → proposal preview without mutate', async () => {
  const state = fresh();
  const before = JSON.stringify(state.shoppingLists);
  const turn = await runConversationTurn(
    state,
    '휴지가 다 떨어졌어. 다음 장볼 때 사야 해.',
    mockProvider('ready'),
  );
  assert.equal(turn.kind, 'proposal');
  assert.equal(turn.proposal.ops[0].op, 'shopping.add');
  assert.equal(turn.preview.ok, true);
  assert.equal(JSON.stringify(state.shoppingLists), before);
  applyProposal(state, turn.proposal);
  assert.ok(ensureActiveList(state).items.some((i) => i.name === '휴지'));
});

test('chicken→mackerel compound', async () => {
  const state = withChickenWeek();
  const turn = await runConversationTurn(
    state,
    '이번 주 닭고기 메뉴를 고등어로 바꿔줘. 고등어가 없으면 장보기에도 추가해줘.',
    mockProvider('offline'),
  );
  assert.equal(turn.kind, 'proposal');
  assert.ok(turn.proposal.ops.some((o) => o.op === 'meals.replace_protein'));
  assert.ok(turn.proposal.ops.some((o) => o.op === 'shopping.add'));
  assert.equal(turn.preview.ok, true);
});

test('fridge dinner asks or proposes from stock', async () => {
  const state = fresh();
  let turn = await runConversationTurn(state, '냉장고에 있는 재료로 오늘 저녁 뭐 해 먹을까?', mockProvider('offline'));
  assert.equal(turn.kind, 'clarify');
  state.inventory.push(
    createInventoryItem({ name: '두부', status: 'enough', location: 'fridge', category: 'food' }),
  );
  turn = await runConversationTurn(state, '냉장고에 있는 재료로 오늘 저녁 뭐 해 먹을까?', mockProvider('offline'));
  assert.equal(turn.kind, 'proposal');
  assert.equal(turn.proposal.ops[0].op, 'meals.confirm_dinner');
});

test('eggs skip removes from list or chats', async () => {
  const state = fresh();
  addShoppingItem(ensureActiveList(state), {
    name: '계란',
    quantity: 10,
    unit: '구',
    priority: 'nice',
    category: 'food',
  });
  const turn = await runConversationTurn(
    state,
    '계란은 아직 많으니까 이번 주에는 안 사도 돼.',
    mockProvider('offline'),
  );
  assert.equal(turn.kind, 'proposal');
  assert.equal(turn.proposal.ops[0].op, 'shopping.remove_unchecked');
  applyProposal(state, turn.proposal);
  assert.equal(ensureActiveList(state).items.filter((i) => i.name === '계란' && !i.checked).length, 0);
});

test('show shopping list is chat only', async () => {
  const state = fresh();
  addShoppingItem(ensureActiveList(state), {
    name: '우유',
    quantity: 1,
    unit: '개',
    priority: 'must',
    category: 'food',
  });
  const snap = JSON.stringify(state);
  const turn = await runConversationTurn(state, '이번 주 장보기 목록 보여줘.', mockProvider('offline'));
  assert.equal(turn.kind, 'chat');
  assert.match(turn.message, /우유/);
  assert.equal(JSON.stringify(state), snap);
});

test('tomorrow simple dinner clarifies', () => {
  const intent = matchLocalIntent(fresh(), '내일 저녁은 간단하게 먹고 싶어.');
  assert.equal(intent.kind, 'clarify');
});

test('finalizeTurn rejects unknown ops', () => {
  const turn = finalizeTurn(fresh(), {
    kind: 'proposal',
    message: 'hack',
    title: 'x',
    reason: 'y',
    ops: [{ op: 'finance.wipe', payload: {} }],
  });
  assert.equal(turn.kind, 'clarify');
});

test('AI JSON path via mock provider when forceAi', async () => {
  const state = fresh();
  const turn = await runConversationTurn(
    state,
    '임의의 문장 xyz',
    mockProvider(
      'ready',
      JSON.stringify({
        kind: 'chat',
        message: '그냥 대화예요.',
      }),
    ),
    { forceAi: true },
  );
  assert.equal(turn.kind, 'chat');
  assert.match(turn.message, /대화/);
  assert.equal(turn.engine, 'ai');
});

test('offline without local match stays safe', async () => {
  const turn = await runConversationTurn(fresh(), '양자역학이 뭐야?', mockProvider('offline'));
  assert.equal(turn.kind, 'clarify');
  assert.match(turn.message, /Ollama/);
});
