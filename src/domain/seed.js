import { uid } from '../lib/id.js';
import { createShoppingList } from './shopping.js';

/** Household sauce catalog used by dinner recommendations + hero prebakes. */
export function seedSauces() {
  return [
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
      visualKey: 'buchujang',
    },
    {
      id: uid(),
      name: '마늘 간장 소스',
      components: [
        { name: '다진 마늘' },
        { name: '간장' },
        { name: '올리브유' },
        { name: '후추' },
        { name: '깨' },
      ],
      exactAmounts: false,
      forPatterns: ['야채찜'],
      visualKey: 'garlic-soy',
    },
    {
      id: uid(),
      name: '스리라차 소스',
      components: [{ name: '스리라차' }],
      exactAmounts: false,
      forPatterns: ['야채찜'],
      visualKey: 'sriracha',
    },
    {
      id: uid(),
      name: '참깨 간장 소스',
      components: [
        { name: '간장', amount: 1 },
        { name: '식초', amount: 1 },
        { name: '올리고당', amount: 0.5 },
        { name: '갈아낸 깨', amount: 1 },
        { name: '물', amount: 1 },
      ],
      exactAmounts: true,
      forPatterns: ['야채찜'],
      visualKey: 'sesame-soy',
    },
    {
      id: uid(),
      name: '겨자 간장 소스',
      components: [
        { name: '간장', amount: 1 },
        { name: '식초', amount: 1 },
        { name: '물', amount: 1 },
        { name: '연겨자', amount: 0.2 },
        { name: '설탕', amount: 0.5 },
      ],
      exactAmounts: true,
      forPatterns: ['야채찜'],
      visualKey: 'mustard-soy',
    },
    {
      id: uid(),
      name: '토마토 양파 소스',
      components: [
        { name: '생토마토', prep: '볶아 졸이기' },
        { name: '양파', prep: '볶아 졸이기' },
        { name: '올리브유' },
        { name: '소금' },
        { name: '후추' },
      ],
      exactAmounts: false,
      forPatterns: ['야채구이'],
      visualKey: 'tomato-onion',
    },
    {
      id: uid(),
      name: '간장마늘 양념',
      components: [{ name: '간장' }, { name: '다진 마늘' }, { name: '설탕' }],
      exactAmounts: false,
      forPatterns: ['야채구이'],
      visualKey: 'garlic-soy',
    },
    {
      id: uid(),
      name: '양꼬치 양념',
      components: [{ name: '쯔란' }, { name: '후추' }, { name: '소금' }],
      exactAmounts: false,
      forPatterns: ['야채구이'],
      visualKey: 'lamb-skewer',
    },
    {
      id: uid(),
      name: '허니머스터드 소스',
      components: [
        { name: '머스터드', amount: 1 },
        { name: '꿀 또는 올리고당', amount: 1 },
        { name: '식초', amount: 0.3 },
      ],
      exactAmounts: true,
      forPatterns: ['야채구이'],
      visualKey: 'honey-mustard',
    },
    {
      id: uid(),
      name: '넛맥 올리브유 시즈닝',
      components: [
        { name: '넛맥(육두구)', prep: '살짝' },
        { name: '올리브유' },
        { name: '후추' },
        { name: '소금' },
      ],
      exactAmounts: false,
      forPatterns: ['야채구이'],
      visualKey: 'nutmeg',
      notes: '기본은 올리브유. 구운 야채·닭에 따뜻하게. 과하면 쓰니 소량.',
    },
  ];
}

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
      notes: '아침·점심 추천은 아직 안 씀. 저녁(찜·구이)만 다뤄요.',
    },
  ];

  state.sauces = seedSauces();
  state.inventory = [];
  state.mealPlan = null;
  return state;
}
