/**
 * Blended dinner ranking — no fixed absolute priority (e.g. stock always wins).
 * Signals: confirmed stock, cooking effort, recent-meal duplication, explicit prefs.
 * Never invents inventory. Preferences only from explicit member.note tags.
 */

/** Equal-ish weights so effort/recent can outrank stock when they differ strongly. */
export const DINNER_RANK_WEIGHTS = {
  stock: 0.28,
  effort: 0.28,
  recent: 0.28,
  preference: 0.16,
};

/**
 * Parse explicit preference tags from family profile notes (≤120 chars, existing schema).
 * Formats (Korean):
 *   좋아함:닭,야채찜
 *   선호:고등어
 *   싫어함:돼지
 *   비선호:고등어,구이
 * Returns empty likes/dislikes when notes have no tags (safe no-op).
 */
export function parseFamilyPreferenceNotes(members = []) {
  const likes = new Set();
  const dislikes = new Set();
  for (const m of members || []) {
    const note = String(m.note || '');
    for (const token of extractTaggedItems(note, /(?:좋아함|선호)\s*[:：]/g)) {
      likes.add(normalizeToken(token));
    }
    for (const token of extractTaggedItems(note, /(?:싫어함|비선호)\s*[:：]/g)) {
      dislikes.add(normalizeToken(token));
    }
  }
  const likeList = [...likes].filter(Boolean);
  const dislikeList = [...dislikes].filter(Boolean);
  const conflicts = likeList.filter((t) => dislikeList.includes(t));
  return { likes: likeList, dislikes: dislikeList, conflicts };
}

/**
 * Preference match for a candidate.
 * Member A likes + member B dislikes the same token → kind 'conflict' (neither auto-wins).
 */
export function resolvePreferenceMatch(candidate, prefs = {}) {
  const likes = prefs.likes || [];
  const dislikes = prefs.dislikes || [];
  if (!likes.length && !dislikes.length) {
    return { kind: 'none', signal: 0.5, matchedLikes: [], matchedDislikes: [] };
  }

  const protein = normalizeToken(candidate.protein);
  const pattern = normalizeToken(candidate.patternName);
  const hay = `${protein} ${pattern}`;
  const matchedLikes = likes.filter((l) => l && hay.includes(l));
  const matchedDislikes = dislikes.filter((d) => d && hay.includes(d));

  if (matchedLikes.length && matchedDislikes.length) {
    return { kind: 'conflict', signal: 0.3, matchedLikes, matchedDislikes };
  }
  if (matchedDislikes.length) {
    return { kind: 'dislike', signal: 0.05, matchedLikes, matchedDislikes };
  }
  if (matchedLikes.length) {
    return { kind: 'like', signal: 1, matchedLikes, matchedDislikes };
  }
  return { kind: 'neutral', signal: 0.45, matchedLikes, matchedDislikes };
}

/**
 * @param {{ stockStatus?: string, effort?: string|null, protein?: string, patternName?: string, recent?: boolean }} candidate
 * @param {{ likes?: string[], dislikes?: string[] }} prefs
 */
export function scoreDinnerCandidate(candidate, prefs = {}) {
  const stock = stockSignal(candidate.stockStatus);
  const effort = effortSignal(candidate.effort);
  const recent = candidate.recent ? 0.15 : 1;
  const prefMatch = resolvePreferenceMatch(candidate, prefs);
  const preference = prefMatch.signal;

  const w = DINNER_RANK_WEIGHTS;
  const total =
    w.stock * stock + w.effort * effort + w.recent * recent + w.preference * preference;

  return {
    total: round4(total),
    parts: {
      stock: round4(stock),
      effort: round4(effort),
      recent: round4(recent),
      preference: round4(preference),
    },
    preferenceKind: prefMatch.kind,
  };
}

/** Stable sort: higher total first; tie-break pattern → sauce → protein → title. */
export function compareDinnerScores(a, b) {
  const diff = (b.score?.total ?? 0) - (a.score?.total ?? 0);
  if (Math.abs(diff) > 1e-9) return diff > 0 ? 1 : -1;
  const byPattern = String(a.patternName || '').localeCompare(String(b.patternName || ''), 'ko');
  if (byPattern) return byPattern;
  const bySauce = String(a.sauceName || '').localeCompare(String(b.sauceName || ''), 'ko');
  if (bySauce) return bySauce;
  const byProtein = String(a.protein || '').localeCompare(String(b.protein || ''), 'ko');
  if (byProtein) return byProtein;
  return String(a.title || '').localeCompare(String(b.title || ''), 'ko');
}

function stockSignal(status) {
  if (status === 'enough') return 1;
  if (status === 'low') return 0.55;
  if (status === 'out') return 0.2;
  if (status === 'untracked') return 0.4;
  return 0.35;
}

function effortSignal(effort) {
  if (effort === 'low') return 1;
  if (effort === 'medium') return 0.55;
  if (effort === 'high') return 0.25;
  return 0.45;
}

function extractTaggedItems(note, tagRe) {
  const out = [];
  const re = new RegExp(tagRe.source, tagRe.flags.includes('g') ? tagRe.flags : `${tagRe.flags}g`);
  let match;
  while ((match = re.exec(note))) {
    const start = match.index + match[0].length;
    const rest = note.slice(start);
    const stop = rest.search(/[|/\n]|(?:좋아함|선호|싫어함|비선호)\s*[:：]/);
    const chunk = (stop >= 0 ? rest.slice(0, stop) : rest).trim();
    for (const part of chunk.split(/[,，、]/)) {
      const t = part.trim();
      if (t) out.push(t);
    }
  }
  return out;
}

function normalizeToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

function round4(n) {
  return Math.round(Number(n) * 10000) / 10000;
}
