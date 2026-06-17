'use strict';

const { newItem } = require('../core/item');

/**
 * X / Twitter kind — posts from a set of handles (industry experts / thought
 * leaders, or a company's official account). Delegates network access to the
 * pluggable X provider (ctx.providers.x), so this kind stays the same whether
 * posts come from the official API, a bridge, or a mock.
 *   options: { handles: [{handle, name?, topics?}], limitPerHandle?: 10 }
 */
module.exports = {
  traitDefaults: { category: 'general', trustTier: 'social', weight: 0.55 },

  async fetch(traits, ctx) {
    const handles = traits.options.handles || [];
    if (!handles.length) return [];
    if (!ctx.providers || !ctx.providers.x) throw new Error('no X provider on ctx');
    const posts = await ctx.providers.x.timeline(handles, {
      sinceHours: traits.lookbackHours,
      limitPerHandle: traits.options.limitPerHandle || 10,
    }, ctx);
    // carry per-handle topic hints onto each post
    const topicByHandle = {};
    for (const h of handles) topicByHandle[(h.handle || h).toLowerCase()] = h.topics || [];
    return posts.map((p) => ({ ...p, topics: topicByHandle[p.handle.toLowerCase()] || [] }));
  },

  map(raw, traits) {
    const text = raw.text || '';
    return newItem({
      sourceId: traits.id,
      kind: 'x',
      url: raw.url,
      title: `@${raw.handle}: ${text.slice(0, 100)}${text.length > 100 ? '…' : ''}`,
      body: text,
      publishedAt: raw.createdAt,
      topics: raw.topics || [],
      entities: { orgs: raw.name ? [raw.name] : [] },
      meta: { handle: raw.handle, author: raw.name },
    });
  },
};
