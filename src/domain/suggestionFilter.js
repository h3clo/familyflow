/**
 * Keep home "지금 챙길 일" from duplicating the live dinner hero proposal.
 */
import { buildDinnerHomeOffer } from './dinnerHome.js';
import { normalizeItemName } from './inventoryMatch.js';

/**
 * Names already covered by the current dinner offer's shopping.add ops.
 */
export function dinnerOfferShoppingNames(state) {
  const dinner = buildDinnerHomeOffer(state);
  if (dinner.status !== 'offer' || !dinner.offer?.proposal?.ops) return new Set();
  const names = new Set();
  for (const op of dinner.offer.proposal.ops) {
    if (op.op === 'shopping.add' && op.payload?.name) {
      names.add(normalizeItemName(op.payload.name));
    }
  }
  return names;
}

/**
 * Drop suggestions that compete with the home dinner hero while an offer is live.
 * - meals.confirm_dinner → always deferred to hero
 * - shopping.add for names already in the hero compound proposal
 */
export function filterSuggestionsAgainstDinnerOffer(state, suggestions) {
  const dinner = buildDinnerHomeOffer(state);
  if (dinner.status !== 'offer') return suggestions || [];

  const coveredShop = dinnerOfferShoppingNames(state);
  return (suggestions || []).filter((s) => {
    const ops = s.ops || [];
    if (ops.some((o) => o.op === 'meals.confirm_dinner')) return false;
    const shop = ops.find((o) => o.op === 'shopping.add');
    if (shop?.payload?.name && coveredShop.has(normalizeItemName(shop.payload.name))) {
      return false;
    }
    return true;
  });
}
