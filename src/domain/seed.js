import { uid } from '../lib/id.js';
import { createShoppingList } from './shopping.js';

/** Empty starter — no fake broccoli purchase history. User confirms before lasting data. */
export function seedState(state) {
  const list = createShoppingList({ budgetWon: state.household.budgetWon });
  state.shoppingLists = [list];
  state.settings.activeListId = list.id;

  state.cookingPatterns = [
    {
      id: uid(),
      name: '야채찜',
      method: 'steam',
      effort: 'medium',
      notes: '색색 야채 + 고기 한 덩이',
    },
    {
      id: uid(),
      name: '야채구이',
      method: 'roast',
      effort: 'medium',
      notes: '소스·고기 양념으로 변형',
    },
    {
      id: uid(),
      name: '간단 아침',
      method: 'assemble',
      effort: 'low',
      notes: '구운란, 찐빵 등 저조리',
    },
  ];

  state.sauces = [
    {
      id: uid(),
      name: '스리라차',
      components: [{ name: '스리라차' }],
      exactAmounts: false,
      forPatterns: ['야채찜'],
    },
    {
      id: uid(),
      name: '부추장',
      components: [
        { name: '부추', prep: '손 한마디 길이' },
        { name: '간장' },
        { name: '올리브유' },
        { name: '고춧가루' },
        { name: '매실청' },
      ],
      exactAmounts: false,
      forPatterns: ['야채찜'],
    },
    {
      id: uid(),
      name: '마늘간장 소스',
      components: [
        { name: '다진 마늘' },
        { name: '간장' },
        { name: '올리브유' },
        { name: '후추' },
      ],
      exactAmounts: false,
      forPatterns: ['야채찜'],
    },
    {
      id: uid(),
      name: '토마토소스',
      components: [{ name: '토마토소스' }],
      exactAmounts: false,
      forPatterns: ['야채구이'],
    },
    {
      id: uid(),
      name: '닭 양념 (마늘간장설탕)',
      components: [
        { name: '다진 마늘' },
        { name: '간장' },
        { name: '설탕' },
      ],
      exactAmounts: false,
      forPatterns: ['야채구이'],
    },
    {
      id: uid(),
      name: '양꼬치 시즈닝',
      components: [{ name: '양꼬치 시즈닝' }],
      exactAmounts: false,
      forPatterns: ['야채구이'],
    },
  ];

  state.inventory = [];
  state.mealPlan = null;
  return state;
}
