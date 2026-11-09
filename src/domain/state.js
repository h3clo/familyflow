import { uid } from '../lib/id.js';
import { loadState, saveState } from '../lib/storage.js';
import { seedState } from './seed.js';

export function createEmptyState() {
  return {
    version: 1,
    household: {
      id: uid(),
      name: '우리 집',
      budgetWon: 80000,
      currency: 'KRW',
    },
    members: [
      { id: uid(), displayName: '나', role: 'owner' },
    ],
    shoppingLists: [],
    inventory: [],
    sauces: [],
    cookingPatterns: [],
    mealPlan: null,
    settings: {
      activeListId: null,
      view: 'shopping',
      localAi: false,
    },
    meta: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };
}

export function bootState() {
  const existing = loadState();
  if (existing?.version === 1) return existing;
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
