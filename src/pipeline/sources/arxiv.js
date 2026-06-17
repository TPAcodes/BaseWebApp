'use strict';

const { newItem } = require('../core/item');

/**
 * arXiv kind — recent submissions for one or more categories, newest first.
 * Uses the arXiv Atom API (parsed by the same feed fetcher as RSS).
 *   options: { categories: ['cs.LG','cs.AI',...], maxResults?: 40 }
 */
module.exports = {
  traitDefaults: { category: 'ai-models', trustTier: 'primary', lookbackHours: 48 },

  async fetch(traits, ctx) {
    const cats = traits.options.categories || ['cs.LG'];
    const max = traits.options.maxResults || Math.max(traits.maxItems, 40);
    const search = cats.map((c) => `cat:${c}`).join('+OR+');
    const url =
      `http://export.arxiv.org/api/query?search_query=${search}` +
      `&sortBy=submittedDate&sortOrder=descending&max_results=${max}`;
    return ctx.fetchFeed(url, { fixture: traits.options.fixture });
  },

  map(raw, traits) {
    return newItem({
      sourceId: traits.id,
      kind: 'arxiv',
      url: raw.link || raw.id,
      title: (raw.title || '').replace(/\s+/g, ' '),
      body: raw.contentSnippet || raw.summary || '',
      publishedAt: raw.isoDate || raw.pubDate,
      topics: ['paper'],
    });
  },
};
