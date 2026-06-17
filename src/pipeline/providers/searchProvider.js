'use strict';

const { newItem } = require('../core/item');

/**
 * SearchProvider contract:
 *   search(query, { limit }, ctx) -> Promise<Item[]>
 *
 * Default uses Google News RSS search — free, keyless, query-driven. Swap for
 * GDELT, Bing News, or a paid news API without touching movementSearch.
 */
class GoogleNewsSearchProvider {
  constructor({ fetchFeed, hl = 'en-US', gl = 'US', ceid = 'US:en' } = {}) {
    this.fetchFeed = fetchFeed;
    this.params = { hl, gl, ceid };
  }

  async search(query, { limit = 8 } = {}) {
    const url =
      'https://news.google.com/rss/search?q=' +
      encodeURIComponent(query) +
      `&hl=${this.params.hl}&gl=${this.params.gl}&ceid=${this.params.ceid}`;
    const items = await this.fetchFeed(url);
    return items.slice(0, limit).map((raw) =>
      newItem({
        sourceId: 'news-search',
        kind: 'news-search',
        url: raw.link,
        title: raw.title,
        body: raw.contentSnippet || raw.content || '',
        publishedAt: raw.isoDate || raw.pubDate,
        trustTier: 'press',
      })
    );
  }
}

/** Returns fixture items keyed by substring match — for offline tests. */
class MockSearchProvider {
  constructor(byQuery) {
    this._byQuery = byQuery || {};
  }
  async search(query, { limit = 8 } = {}) {
    for (const key of Object.keys(this._byQuery)) {
      if (query.toLowerCase().includes(key.toLowerCase())) {
        return this._byQuery[key].slice(0, limit).map((o) => newItem(o));
      }
    }
    return [];
  }
}

module.exports = { GoogleNewsSearchProvider, MockSearchProvider };
