'use strict';

/**
 * Deterministic relevance heuristic. Used by the MockEngine and as the
 * AnthropicEngine's per-chunk fallback if a scoring call fails. Keeps the
 * pipeline producing a sane ranking even with no model.
 */
const TRUST_BONUS = { primary: 0.25, press: 0.1, social: 0.08, aggregator: 0 };

function scoreHeuristic(item, profile) {
  if (item.reason && item.reason.startsWith('price-move')) return 1;

  let score = item.weight == null ? 0.5 : item.weight;
  score += TRUST_BONUS[item.trustTier] || 0;

  // recency: full credit < 12h, decaying to 0 by lookback edge (~48h)
  if (item.publishedAt) {
    const ageH = (Date.now() - +new Date(item.publishedAt)) / 3.6e6;
    score += ageH < 12 ? 0.15 : ageH < 24 ? 0.08 : 0;
  }

  // keyword match against the interests for this item's category
  const interests = (profile && profile.interests && profile.interests[item.category]) || [];
  const hay = `${item.title} ${item.body}`.toLowerCase();
  let hits = 0;
  for (const kw of interests) if (hay.includes(String(kw).toLowerCase())) hits++;
  score += Math.min(hits * 0.06, 0.24);

  return Math.max(0, Math.min(1, score));
}

module.exports = { scoreHeuristic };
