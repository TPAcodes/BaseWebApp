'use strict';

/**
 * Canonical data-source traits.
 *
 * Every data source — no matter what it ingests — is described by the same set
 * of traits. A "kind" (rss, arxiv, x, sec, ...) supplies sensible defaults for
 * these traits; an individual source instance (from config) customizes them.
 *
 * This is the contract the rest of the pipeline relies on, so adding a new
 * source never means touching downstream stages — only registering a new kind
 * and/or a new config entry.
 */
const DEFAULT_TRAITS = {
  id: null,            // required, unique across the registry
  name: null,          // human label
  kind: null,          // required; maps to a registered kind factory
  category: 'general', // ai-models | ai-infra | bio-robotics | equities | podcasts | general
  enabled: true,
  cadence: 'daily',    // scheduler hint (informational at the source layer)
  weight: 0.5,         // base relevance/priority 0..1, used by ranking later
  trustTier: 'press',  // primary | press | aggregator | social
  topics: [],          // tag hints stamped onto every item from this source
  entities: { tickers: [], orgs: [] }, // default entity tags (e.g. a company feed)
  maxItems: 50,        // hard cap per run
  lookbackHours: 36,   // freshness window; older items are dropped
  rateLimit: { perRun: 60, minIntervalMs: 0 },
  dedupeKeys: ['url'], // fields that define item identity
  options: {},         // kind-specific config (feedUrl, handles, categories, ...)
};

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

/** Deep-merge for trait objects (arrays replace, objects merge). */
function mergeTraits(base, override) {
  const out = Array.isArray(base) ? base.slice() : { ...base };
  if (!override) return out;
  for (const key of Object.keys(override)) {
    const ov = override[key];
    if (isPlainObject(ov) && isPlainObject(out[key])) {
      out[key] = mergeTraits(out[key], ov);
    } else if (ov !== undefined) {
      out[key] = ov;
    }
  }
  return out;
}

/**
 * Produce a validated, fully-populated traits object from a partial spec.
 * `kindDefaults` lets a kind factory inject its canonical defaults beneath the
 * user's per-instance customization.
 */
function defineSource(partial, kindDefaults) {
  const merged = mergeTraits(mergeTraits(DEFAULT_TRAITS, kindDefaults || {}), partial || {});
  if (!merged.id) throw new Error('data source is missing required trait "id"');
  if (!merged.kind) throw new Error(`data source "${merged.id}" is missing required trait "kind"`);
  if (!merged.name) merged.name = merged.id;
  return merged;
}

module.exports = { DEFAULT_TRAITS, defineSource, mergeTraits };
