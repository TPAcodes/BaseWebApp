'use strict';

const { defineSource } = require('./traits');
const { DataSource } = require('./DataSource');

/**
 * Registry of source KINDS and a registry of source INSTANCES.
 *
 * Kinds are factories: `{ traitDefaults, fetch, map }`. Register a kind once,
 * then any number of instances can be built from config that names that kind.
 */
class SourceRegistry {
  constructor() {
    this.kinds = new Map();    // kind name -> { traitDefaults, fetch, map }
    this.sources = [];         // DataSource[]
    this._ids = new Set();
  }

  registerKind(name, factory) {
    if (!factory || typeof factory.fetch !== 'function' || typeof factory.map !== 'function') {
      throw new Error(`kind "${name}" must provide fetch() and map()`);
    }
    this.kinds.set(name, factory);
    return this;
  }

  /** Build and register a DataSource from a config entry (must name a known kind). */
  build(entry) {
    const factory = this.kinds.get(entry.kind);
    if (!factory) throw new Error(`unknown source kind "${entry.kind}" (id=${entry.id})`);
    const traits = defineSource(entry, { kind: entry.kind, ...factory.traitDefaults });
    return this.add(new DataSource(traits, { fetch: factory.fetch, map: factory.map }));
  }

  /** Register an already-constructed DataSource (used by dynamic expanders). */
  add(source) {
    if (this._ids.has(source.id)) throw new Error(`duplicate source id "${source.id}"`);
    this._ids.add(source.id);
    this.sources.push(source);
    return source;
  }

  list({ category, enabledOnly = true } = {}) {
    return this.sources.filter(
      (s) => (!enabledOnly || s.enabled) && (!category || s.traits.category === category)
    );
  }

  /** Collect from every enabled source, isolating per-source failures. */
  async collectAll(ctx) {
    const all = [];
    const stats = [];
    for (const s of this.list()) {
      const t0 = Date.now();
      try {
        const items = await s.collect(ctx);
        all.push(...items);
        stats.push({ id: s.id, kind: s.kind, count: items.length, ms: Date.now() - t0 });
      } catch (e) {
        stats.push({ id: s.id, kind: s.kind, count: 0, ms: Date.now() - t0, error: e.message });
        (ctx.log || console).warn(`[source:${s.id}] ${e.message}`);
      }
    }
    return { items: all, stats };
  }
}

module.exports = { SourceRegistry };
