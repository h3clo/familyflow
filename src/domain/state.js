import { uid } from '../lib/id.js';
import { loadState, saveState } from '../lib/storage.js';
import { seedState } from './seed.js';

export function createEmptyState() {
  return {
    version: 5,
    household: {
      id: uid(),
      name: '우리 집',
      budgetWon: 80000,
      currency: 'KRW',
    },
    members: [{ id: uid(), displayName: '나', role: 'owner' }],
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
    },
    settings: {
      activeListId: null,
      view: 'home',
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
