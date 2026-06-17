'use strict';

/**
 * Movement-driven news search.
 *
 * For each price/volume mover, fan out targeted queries through the pluggable
 * search provider to find the company-specific and industry-specific news that
 * explains the move. Returned items are tagged with the ticker and a
 * `price-move:<TICKER>` reason and weighted up, so synthesis is pushed to
 * explain the catalyst rather than just report the move.
 */
function buildQueries(mover, company) {
  const name = company ? company.name : mover.ticker;
  const dir = mover.direction === 'up' ? '(surge OR jumps OR rises OR rally)' : '(falls OR drops OR plunges OR slides)';
  const queries = [
    `${name} stock ${dir}`,
    `${name} (earnings OR guidance OR results OR forecast)`,
    `"${name}" (announces OR launches OR deal OR cuts OR raises)`,
  ];
  if (company && company.sector) {
    queries.push(`${company.sector} ${mover.direction === 'up' ? 'demand OR growth' : 'weakness OR slowdown OR glut'}`);
  }
  return queries;
}

async function searchMovers(movers, companies, ctx, opts = {}) {
  const perQuery = opts.perQuery || 5;
  const maxQueriesPerMover = opts.maxQueriesPerMover || 3;
  const out = [];
  const seen = new Set();

  for (const mover of movers) {
    const company = companies.byTicker(mover.ticker);
    const queries = buildQueries(mover, company).slice(0, maxQueriesPerMover);
    for (const q of queries) {
      let results = [];
      try {
        results = await ctx.providers.search.search(q, { limit: perQuery }, ctx);
      } catch (e) {
        (ctx.log || console).warn(`[movement-search:${mover.ticker}] ${e.message}`);
        continue;
      }
      for (const it of results) {
        if (seen.has(it.url || it.id)) continue;
        seen.add(it.url || it.id);
        out.push({
          ...it,
          category: company ? sectorCategory(company.sector) : 'equities',
          reason: `price-move:${mover.ticker}`,
          weight: 0.9,
          entities: {
            tickers: [mover.ticker],
            orgs: company ? [company.name] : [],
          },
          meta: { ...it.meta, mover: { pct: mover.pct, volZ: mover.volZ, query: q } },
        });
      }
    }
  }
  return out;
}

function sectorCategory(sector) {
  const s = (sector || '').toLowerCase();
  if (s.includes('semic') || s.includes('hardware') || s.includes('infra')) return 'ai-infra';
  if (s.includes('bio') || s.includes('robot') || s.includes('health')) return 'bio-robotics';
  return 'equities';
}

module.exports = { searchMovers, buildQueries };
