'use strict';

const { newItem } = require('../core/item');

/**
 * Hacker News kind — front-page stories above a score threshold. Free Firebase
 * API, no key.  options: { minScore?: 100, pages?: 60 }
 */
module.exports = {
  traitDefaults: { category: 'general', trustTier: 'aggregator', weight: 0.4 },

  async fetch(traits, ctx) {
    if (traits.options.fixture) return traits.options.fixture; // array of HN items for tests
    const top = await (await ctx.http('https://hacker-news.firebaseio.com/v0/topstories.json')).json();
    const ids = top.slice(0, traits.options.pages || 60);
    const minScore = traits.options.minScore || 100;
    const out = [];
    for (const id of ids) {
      try {
        const it = await (await ctx.http(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)).json();
        if (it && it.type === 'story' && (it.score || 0) >= minScore) out.push(it);
      } catch (_) { /* skip */ }
      if (out.length >= traits.maxItems) break;
    }
    return out;
  },

  map(raw, traits) {
    return newItem({
      sourceId: traits.id,
      kind: 'hackernews',
      url: raw.url || `https://news.ycombinator.com/item?id=${raw.id}`,
      title: raw.title,
      body: '',
      publishedAt: raw.time ? new Date(raw.time * 1000).toISOString() : null,
      meta: { score: raw.score, hnId: raw.id },
    });
  },
};
