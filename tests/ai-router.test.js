import test from 'node:test';
import assert from 'node:assert/strict';
import { createAiRouter, formatRouteBadge } from '../src/ai/router.js';
import { buildCloudSafeContext, buildHouseholdContext } from '../src/ai/householdContext.js';
import { createEmptyState } from '../src/domain/state.js';
import { seedState } from '../src/domain/seed.js';
import { ensureActiveList, addShoppingItem } from '../src/domain/shopping.js';
import { runConversationTurn } from '../src/ai/conversation.js';
import { GroqProxyError } from '../src/ai/groq.js';

function mockOllama({ ready = false, failComplete = false } = {}) {
  return {
    id: 'ollama',
    async probe() {
      return ready
        ? { status: 'ready', message: 'ok', detail: { activeModel: 'qwen3:4b' }, models: ['qwen3:4b'] }
        : { status: 'offline', message: 'down', models: [] };
    },
    async complete() {
      if (failComplete) throw new Error('ollama boom');
      return {
        text: JSON.stringify({
          kind: 'proposal',
          message: '휴지를 넣을게요',
          title: '휴지 추가',
          reason: '요청',
          ops: [{ op: 'shopping.add', payload: { name: '휴지', quantity: 1, unit: '롤' } }],
        }),
        model: 'qwen3:4b',
      };
    },
  };
}

function mockGroq({ ready = true, fail = null, text } = {}) {
  return {
    id: 'groq',
    preferredModel: 'openai/gpt-oss-20b',
    async probe() {
      return ready
        ? { status: 'ready', message: 'groq ok', detail: { activeModel: 'openai/gpt-oss-20b' }, models: ['openai/gpt-oss-20b'] }
        : { status: 'offline', message: 'no groq', models: [] };
    },
    async complete() {
      if (fail) throw fail;
      return {
        text:
          text ||
          JSON.stringify({
            kind: 'chat',
            message: 'Groq 응답입니다',
          }),
        model: 'openai/gpt-oss-20b',
        provider: 'groq',
      };
    },
  };
}

test('router prefers Ollama when ready', async () => {
  const router = createAiRouter({
    ollama: mockOllama({ ready: true }),
    groq: mockGroq({ ready: true }),
  });
  const probe = await router.probe();
  assert.equal(probe.provider, 'ollama');
  const completion = await router.completeConversation({
    userText: '휴지 사야 해',
    state: seedState(createEmptyState()),
    ollamaCompleteArgs: { prompt: 'x' },
  });
  assert.equal(completion.route, 'ollama');
});

test('router falls back to Groq when Ollama offline', async () => {
  const router = createAiRouter({
    ollama: mockOllama({ ready: false }),
    groq: mockGroq({ ready: true }),
  });
  const completion = await router.completeConversation({
    userText: '안녕',
    state: seedState(createEmptyState()),
  });
  assert.equal(completion.route, 'groq');
  assert.match(formatRouteBadge(router.getRoute()), /Groq/);
});

test('router falls to rules when Groq daily limit', async () => {
  const router = createAiRouter({
    ollama: mockOllama({ ready: false }),
    groq: mockGroq({
      ready: true,
      fail: new GroqProxyError('일일 한도', { code: 'groq_rate_limit', limitKind: 'rpd', status: 429 }),
    }),
  });
  await assert.rejects(
    () => router.completeConversation({ userText: '테스트', state: createEmptyState() }),
    (err) => err.limitKind === 'rpd',
  );
  assert.equal(router.getRoute().provider, 'rules');
});

test('cloud safe context strips ids and keeps shopping/inventory/meals only', () => {
  const state = seedState(createEmptyState());
  addShoppingItem(ensureActiveList(state), {
    name: '휴지',
    quantity: 1,
    unit: '롤',
    priority: 'must',
    category: 'household',
  });
  state.members = [{ id: 'm1', displayName: '엄마', note: '비밀메모', roleLabel: '엄마' }];
  const safe = buildCloudSafeContext(state);
  const full = buildHouseholdContext(state);
  assert.ok(full.inventory.every((i) => 'id' in i) || full.shoppingOpen);
  assert.equal('id' in (safe.inventory[0] || {}), false);
  assert.ok(!JSON.stringify(safe).includes('비밀메모'));
  assert.ok(!JSON.stringify(safe).includes('m1'));
});

test('conversation uses Groq engine label and keeps ActionProposal gate', async () => {
  const state = seedState(createEmptyState());
  const router = createAiRouter({
    ollama: mockOllama({ ready: false }),
    groq: mockGroq({
      ready: true,
      text: JSON.stringify({
        kind: 'proposal',
        message: '휴지 추가 제안',
        title: '휴지',
        reason: '요청',
        ops: [{ op: 'shopping.add', payload: { name: '휴지', quantity: 1, unit: '롤', priority: 'must' } }],
      }),
    }),
  });
  const turn = await runConversationTurn(state, '아무 의미 없는 긴 문장으로 로컬 패턴을 피한다 XYZ123', router, {
    forceAi: true,
  });
  assert.equal(turn.kind, 'proposal');
  assert.equal(turn.engine, 'groq');
  assert.ok(turn.proposal);
  assert.ok(turn.preview);
  assert.equal(turn.preview.ok, true);
});

test('auth failure message does not suggest paid upgrade', async () => {
  const router = createAiRouter({
    ollama: mockOllama({ ready: false }),
    groq: mockGroq({
      ready: true,
      fail: new GroqProxyError('로그인이 필요해요.', { code: 'unauthorized', status: 401 }),
    }),
  });
  const turn = await runConversationTurn(createEmptyState(), 'XYZNOLOCAL999', router, { forceAi: true });
  assert.equal(turn.kind, 'clarify');
  assert.match(turn.message, /로그인/);
  assert.doesNotMatch(turn.message, /유료|결제|업그레이드 하세요/);
});
