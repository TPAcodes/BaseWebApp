'use strict';

/**
 * Expand the company registry into concrete data sources so we systematically
 * track *everything each company publishes*:
 *   - each declared publication channel (RSS/IR blog, or X account)
 *   - one SEC EDGAR source per company with a CIK (guaranteed disclosures)
 *
 * Every emitted source is pre-tagged with the company's ticker + org, so its
 * items are automatically attributable and joinable against price moves.
 */
function expandCompanies(registry, companies) {
  for (const c of companies.all()) {
    const ticker = c.ticker.toUpperCase();
    const entities = { tickers: [ticker], orgs: [c.name] };

    (c.publications || []).forEach((pub, i) => {
      const base = {
        id: `pub:${ticker}:${pub.kind}:${i}`,
        name: `${c.name} — ${pub.kind}`,
        kind: pub.kind,
        category: pub.category || sectorCategory(c.sector),
        trustTier: pub.trustTier || (pub.kind === 'x' ? 'social' : 'primary'),
        weight: pub.weight != null ? pub.weight : 0.7,
        entities,
        topics: pub.topics || [],
        options: {},
      };
      if (pub.kind === 'rss') base.options.feedUrl = pub.feedUrl;
      if (pub.kind === 'x') {
        base.options.handles = [{ handle: pub.handle, name: c.name, topics: pub.topics || [] }];
      }
      registry.build(base);
    });

    if (c.secCik) {
      registry.build({
        id: `sec:${ticker}`,
        name: `${c.name} — SEC filings`,
        kind: 'sec',
        category: 'equities',
        entities,
        options: { cik: c.secCik, company: c.name, forms: c.secForms },
      });
    }
  }
  return registry;
}

function sectorCategory(sector) {
  const s = (sector || '').toLowerCase();
  if (s.includes('semic') || s.includes('hardware') || s.includes('infra')) return 'ai-infra';
  if (s.includes('bio') || s.includes('robot') || s.includes('health')) return 'bio-robotics';
  return 'equities';
}

module.exports = { expandCompanies };
