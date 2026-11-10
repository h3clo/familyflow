import { uid } from '../lib/id.js';
import { loadState, saveState } from '../lib/storage.js';
import { seedSauces, seedState } from './seed.js';

export function createEmptyState() {
  return {
    version: 8,
    household: {
      id: uid(),
      name: '우리 집',
      budgetWon: 80000,
      currency: 'KRW',
    },
    // Family people profiles (not Auth accounts). No health/finance fields.
    members: [{ id: uid(), displayName: '나', role: 'owner', roleLabel: '관리자', note: '', sortOrder: 0 }],
    shoppingLists: [],
    inventory: [],
    sauces: [],
    cookingPatterns: [],
    mealPlan: null,
    todayDinner: null,
    suggestionsMeta: { dismissed: {} },
    proposalsMeta: { applied: {} },
    cloud: {
      householdId: null,
      lastPushedAt: null,
      lastPulledAt: null,
      userId: null,
      mode: 'local', // 'local' | 'cloud-primary'
      migratedAt: null,
    },
    settings: {
      activeListId: null,
      view: 'home',
      foodSegment: 'shopping',
      localAi: false,
      todayFlags: null,
      ai: {
        provider: 'ollama',
        model: 'qwen3:4b',
      },
    },
    meta: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };
}

export function migrateState(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const state = structuredClone(raw);
  if (!state.version || state.version < 2) {
    state.todayDinner = state.todayDinner || null;
    state.suggestionsMeta = state.suggestionsMeta || { dismissed: {} };
    if (!state.suggestionsMeta.dismissed) state.suggestionsMeta.dismissed = {};
    if (!state.settings) state.settings = {};
    if (!state.settings.view || state.settings.view === 'shopping') {
      state.settings.view = 'home';
    }
    state.version = 2;
  }
  if (state.version < 3) {
    state.proposalsMeta = state.proposalsMeta || { applied: {} };
    if (!state.proposalsMeta.applied) state.proposalsMeta.applied = {};
    state.version = 3;
  }
  if (state.version < 4) {
    if (!state.settings) state.settings = {};
    state.settings.ai = state.settings.ai || { provider: 'ollama', model: 'qwen3:4b' };
    if (!state.settings.ai.model) state.settings.ai.model = 'qwen3:4b';
    if (!state.settings.ai.provider) state.settings.ai.provider = 'ollama';
    state.version = 4;
  }
  if (state.version < 5) {
    state.cloud = state.cloud || {
      householdId: null,
      lastPushedAt: null,
      lastPulledAt: null,
      userId: null,
    };
    state.version = 5;
  }
  if (state.version < 6) {
    state.cloud = state.cloud || {};
    if (!state.cloud.mode) state.cloud.mode = state.cloud.householdId ? 'cloud-primary' : 'local';
    if (!('migratedAt' in state.cloud)) state.cloud.migratedAt = null;
    state.members = (state.members || []).map((m, idx) => ({
      ...m,
      roleLabel: m.roleLabel || (m.role === 'owner' ? '관리자' : '구성원'),
      note: m.note || '',
      sortOrder: Number.isFinite(m.sortOrder) ? m.sortOrder : idx,
    }));
    state.version = 6;
  }
  if (state.version < 7) {
    if (!state.settings) state.settings = {};
    const v = state.settings.view;
    if (v === 'shopping' || v === 'inventory' || v === 'meals') {
      state.settings.foodSegment = v;
      state.settings.view = 'food';
    }
    if (!state.settings.foodSegment) state.settings.foodSegment = 'shopping';
    state.version = 7;
  }
  if (state.version < 8) {
    // Refresh device sauce catalog to the prebaked dinner set when still on defaults /
    // empty. Custom-named sauces are kept.
    const names = (state.sauces || []).map((s) => s.name);
    const legacy = new Set([
      '스리라차',
      '마늘간장 소스',
      '토마토소스',
      '닭 양념 (마늘간장설탕)',
      '양꼬치 시즈닝',
    ]);
    const onlyLegacyOrEmpty =
      !names.length || names.every((n) => legacy.has(n) || n === '부추장');
    if (onlyLegacyOrEmpty) state.sauces = seedSauces();
    else {
      for (const s of state.sauces || []) {
        if (!s.visualKey) {
          if (/부추/.test(s.name)) s.visualKey = 'buchujang';
          else if (/참깨/.test(s.name)) s.visualKey = 'sesame-soy';
          else if (/겨자/.test(s.name)) s.visualKey = 'mustard-soy';
          else if (/스리라차/.test(s.name)) s.visualKey = 'sriracha';
          else if (/토마토/.test(s.name)) s.visualKey = 'tomato-onion';
          else if (/양꼬치|쯔란/.test(s.name)) s.visualKey = 'lamb-skewer';
          else if (/허니|머스터드/.test(s.name)) s.visualKey = 'honey-mustard';
          else if (/넛맥|육두구/.test(s.name)) s.visualKey = 'nutmeg';
          else if (/마늘|간장/.test(s.name)) s.visualKey = 'garlic-soy';
        }
      }
    }
    state.version = 8;
  }
  return state;
}

export function bootState() {
  const existing = loadState();
  if (existing) {
    const migrated = migrateState(existing);
    if (migrated) {
      persist(migrated);
      return migrated;
    }
  }
  const seeded = seedState(createEmptyState());
  persist(seeded);
  return seeded;
}

export function persist(state) {
  state.meta.updatedAt = new Date().toISOString();
  saveState(state);
  return state;
}

export function activeList(state) {
  const id = state.settings.activeListId;
  return state.shoppingLists.find((l) => l.id === id) || state.shoppingLists[0] || null;
}
