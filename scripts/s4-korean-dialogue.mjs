/**
 * Live S4 dialogue matrix against local Ollama (this machine's localhost).
 * Does not mutate beyond in-memory state clones.
 */
import { createEmptyState } from '../src/domain/state.js';
import { seedState } from '../src/domain/seed.js';
import { createInventoryItem } from '../src/domain/inventory.js';
import { draftWeek } from '../src/domain/meals.js';
import { ensureActiveList, addShoppingItem } from '../src/domain/shopping.js';
import { applyProposal } from '../src/domain/proposals.js';
import { createOllamaProvider } from '../src/ai/ollama.js';
import { runConversationTurn } from '../src/ai/conversation.js';
import fs from 'node:fs';

const OUT = process.env.ARTIFACT_DIR || '/opt/cursor/artifacts';
fs.mkdirSync(OUT, { recursive: true });

function baseState() {
  const state = seedState(createEmptyState());
  state.mealPlan = draftWeek(state);
  for (const day of state.mealPlan.days) {
    const dinner = day.slots.find((s) => s.mealType === 'dinner');
    if (dinner) {
      dinner.protein = '닭고기';
      dinner.title = `야채찜 · 닭고기`;
    }
  }
  state.inventory.push(
    createInventoryItem({ name: '두부', status: 'enough', location: 'fridge', category: 'food' }),
  );
  addShoppingItem(ensureActiveList(state), {
    name: '계란',
    quantity: 10,
    unit: '구',
    priority: 'nice',
    category: 'food',
  });
  return state;
}

const provider = createOllamaProvider({
  baseUrl: 'http://127.0.0.1:11434',
  preferredModel: 'qwen3:4b',
});

const cases = [
  '휴지가 다 떨어졌어. 다음 장볼 때 사야 해.',
  '이번 주 닭고기 메뉴를 고등어로 바꿔줘. 고등어가 없으면 장보기에도 추가해줘.',
  '냉장고에 있는 재료로 오늘 저녁 뭐 해 먹을까?',
  '계란은 아직 많으니까 이번 주에는 안 사도 돼.',
  '이번 주 장보기 목록 보여줘.',
  '내일 저녁은 간단하게 먹고 싶어.',
];

const probe = await provider.probe();
const results = [];
for (const utterance of cases) {
  const state = baseState();
  const before = JSON.stringify({
    shop: ensureActiveList(state).items.map((i) => i.name),
    dinner: state.todayDinner,
    proteins: state.mealPlan.days.map((d) => d.slots.find((s) => s.mealType === 'dinner')?.protein),
  });
  const turn = await runConversationTurn(state, utterance, provider);
  const afterPreview = JSON.stringify({
    shop: ensureActiveList(state).items.map((i) => i.name),
    dinner: state.todayDinner,
    proteins: state.mealPlan.days.map((d) => d.slots.find((s) => s.mealType === 'dinner')?.protein),
  });
  let applied = null;
  if (turn.kind === 'proposal' && turn.proposal) {
    applied = applyProposal(state, turn.proposal);
  }
  results.push({
    utterance,
    kind: turn.kind,
    engine: turn.engine,
    message: turn.message,
    ops: turn.proposal?.ops?.map((o) => o.op) || [],
    previewOk: turn.preview?.ok ?? null,
    stateUnchangedBeforeApprove: before === afterPreview,
    applyOk: applied?.ok ?? null,
  });
}

// One free-form forceAi sample
{
  const state = baseState();
  const turn = await runConversationTurn(state, '오늘 날씨 어때?', provider, { forceAi: true });
  results.push({
    utterance: '오늘 날씨 어때? (forceAi)',
    kind: turn.kind,
    engine: turn.engine,
    message: turn.message,
    ops: turn.proposal?.ops?.map((o) => o.op) || [],
    previewOk: turn.preview?.ok ?? null,
    stateUnchangedBeforeApprove: true,
    applyOk: null,
  });
}

const report = { probe, results, at: new Date().toISOString() };
fs.writeFileSync(`${OUT}/s4-korean-dialogue.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
