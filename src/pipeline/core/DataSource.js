'use strict';

const { finalizeItem } = require('./item');

/**
 * A DataSource binds canonical traits to a kind implementation `{ fetch, map }`.
 *
 *   fetch(traits, ctx) -> Promise<rawRecord[]>   // get raw records from the source
 *   map(raw, traits, ctx) -> Item | Item[] | null // normalize one raw record
 *
 * collect() runs fetch -> map -> freshness filter -> source-level finalize -> cap.
 * Errors are the caller's concern to isolate (see SourceRegistry.collectAll).
 */
class DataSource {
  constructor(traits, impl) {
    this.traits = traits;
    this.impl = impl;
  }

  get id() { return this.traits.id; }
  get kind() { return this.traits.kind; }
  get enabled() { return this.traits.enabled; }

  async collect(ctx) {
    const raw = (await this.impl.fetch(this.traits, ctx)) || [];
    const items = [];
    for (const r of raw) {
      const mapped = await this.impl.map(r, this.traits, ctx);
      for (const m of [].concat(mapped)) {
        if (m) items.push(finalizeItem(m, this.traits));
      }
    }
    // Prefer the run-level recency window when present; else per-source lookback.
    const cutoff = ctx.windowStart != null ? ctx.windowStart : ctx.now - this.traits.lookbackHours * 3600 * 1000;
    const dropUndated = ctx.windowStart != null && ctx.dropUndated !== false;
    const fresh = items.filter((it) =>
      it.publishedAt ? +new Date(it.publishedAt) >= cutoff : !dropUndated
    );
    return fresh.slice(0, this.traits.maxItems);
  }
}

module.exports = { DataSource };
