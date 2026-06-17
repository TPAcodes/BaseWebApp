'use strict';

const { newItem } = require('../core/item');

/**
 * Generic RSS/Atom kind. The workhorse — most sources (SemiAnalysis, lab blogs,
 * IR feeds, press) are just an entry naming this kind with `options.feedUrl`.
 */
module.exports = {
  traitDefaults: { trustTier: 'press' },

  async fetch(traits, ctx) {
    if (!traits.options.feedUrl && !traits.options.fixture) {
      throw new Error(`rss source "${traits.id}" needs options.feedUrl`);
    }
    return ctx.fetchFeed(traits.options.feedUrl, { fixture: traits.options.fixture });
  },

  map(raw, traits) {
    return newItem({
      sourceId: traits.id,
      kind: 'rss',
      url: raw.link || raw.guid,
      title: raw.title,
      body: raw.contentSnippet || raw.summary || raw.content || '',
      publishedAt: raw.isoDate || raw.pubDate,
    });
  },
};
