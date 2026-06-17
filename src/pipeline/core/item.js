'use strict';

const crypto = require('crypto');

const TRACKING_PARAM = /^(utm_|fbclid$|gclid$|mc_|ref$|ref_src$|ref_url$|cmpid$|smid$)/i;

/** Normalize a URL for stable identity & dedup (strip tracking params, hash, trailing slash). */
function canonicalUrl(raw) {
  if (!raw) return '';
  try {
    const url = new URL(raw);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAM.test(key)) url.searchParams.delete(key);
    }
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    let s = url.toString();
    return s.replace(/\/$/, '');
  } catch (_) {
    return String(raw).trim();
  }
}

function makeId(parts) {
  return crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 16);
}

/**
 * The normalized Item — the single schema every source maps into. Downstream
 * stages (dedup, ranking, summarization, synthesis) only ever see Items.
 */
function newItem(o) {
  const url = o.url ? canonicalUrl(o.url) : '';
  return {
    id: o.id || makeId([o.sourceId || '', url, o.title || '']),
    sourceId: o.sourceId || null,
    kind: o.kind || null,
    category: o.category || null,
    url,
    title: (o.title || '').trim(),
    body: (o.body || '').trim(),
    publishedAt: o.publishedAt ? safeIso(o.publishedAt) : null,
    topics: o.topics || [],
    entities: { tickers: [], orgs: [], ...(o.entities || {}) },
    trustTier: o.trustTier || null,
    weight: o.weight == null ? null : o.weight,
    reason: o.reason || null, // why this item is here (e.g. "price-move:NVDA")
    meta: o.meta || {},
  };
}

function safeIso(d) {
  const t = new Date(d);
  return isNaN(+t) ? null : t.toISOString();
}

/** Apply source-level defaults to an item produced by a kind's `map`. */
function finalizeItem(it, traits) {
  return {
    ...it,
    category: it.category || traits.category,
    trustTier: it.trustTier || traits.trustTier,
    weight: it.weight == null ? traits.weight : it.weight,
    topics: uniq([...(traits.topics || []), ...(it.topics || [])]),
    entities: {
      tickers: uniq([...(traits.entities.tickers || []), ...(it.entities.tickers || [])]),
      orgs: uniq([...(traits.entities.orgs || []), ...(it.entities.orgs || [])]),
    },
  };
}

function uniq(arr) {
  return Array.from(new Set(arr.filter(Boolean)));
}

module.exports = { newItem, finalizeItem, canonicalUrl, makeId, uniq };
