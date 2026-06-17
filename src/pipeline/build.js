'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const { SourceRegistry } = require('./core/registry');
const { registerKinds } = require('./sources');
const { expandCompanies } = require('./sources/companyPublications');

function loadYaml(p, fallback) {
  try {
    return yaml.load(fs.readFileSync(p, 'utf8')) || fallback;
  } catch (_) {
    return fallback;
  }
}

/**
 * Assemble the full source registry from configuration:
 *   1. static sources   (config/sources.yaml — SemiAnalysis, lab blogs, arXiv, HN…)
 *   2. X thought-leaders (config/people.yaml — one aggregated X source)
 *   3. company channels  (config/companies.yaml — per-company RSS/X + SEC, dynamic)
 */
function buildRegistry({ configDir, companies, extraKinds }) {
  const registry = new SourceRegistry();
  registerKinds(registry, extraKinds);

  const sources = (loadYaml(path.join(configDir, 'sources.yaml'), { sources: [] }).sources) || [];
  for (const entry of sources) {
    if (entry.enabled === false) continue;
    registry.build(entry);
  }

  const people = loadYaml(path.join(configDir, 'people.yaml'), {});
  if (people.handles && people.handles.length) {
    registry.build({
      id: 'x-thought-leaders',
      name: 'X — industry thought leaders',
      kind: 'x',
      category: people.category || 'general',
      trustTier: 'social',
      weight: people.weight || 0.55,
      options: { handles: people.handles, limitPerHandle: people.limitPerHandle || 8 },
    });
  }

  expandCompanies(registry, companies);
  return registry;
}

module.exports = { buildRegistry, loadYaml };
