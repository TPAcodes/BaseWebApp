'use strict';

const path = require('path');

const { FileStore } = require('./core/store');
const { dedupe } = require('./core/dedupe');
const { makeHttp, makeFeedFetcher, DEFAULT_UA } = require('./providers/http');
const { YahooPriceProvider } = require('./providers/priceProvider');
const { GoogleNewsSearchProvider } = require('./providers/searchProvider');
const { makeXProvider } = require('./providers/xProvider');
const { CompanyRegistry } = require('./companies/registry');
const { buildRegistry, loadYaml } = require('./build');
const { trackPrices } = require('./priceTracker');
const { searchMovers } = require('./movementSearch');
const { makeEngine } = require('./llm');
const { synthesize } = require('./synthesize');
const { render } = require('./render');
const { makeDeliverer } = require('./deliver/email');

/**
 * Build the runtime context (providers + IO). Exposed so tests can inject mocks.
 */
function makeContext(overrides = {}) {
  const repoRoot = overrides.repoRoot || path.resolve(__dirname, '../..');
  const userAgent = process.env.APP_USER_AGENT || DEFAULT_UA;
  const secUserAgent =
    process.env.SEC_USER_AGENT ||
    `morning-brief/0.2 (contact: ${process.env.CONTACT_EMAIL || 'configure CONTACT_EMAIL'})`;
  const http = overrides.http || makeHttp({ userAgent });
  const fetchFeed = overrides.fetchFeed || makeFeedFetcher({ userAgent });

  return {
    now: overrides.now || Date.now(),
    dateISO: overrides.dateISO || new Date().toISOString().slice(0, 10),
    log: overrides.log || console,
    userAgent,
    config: { app: { userAgent, secUserAgent } },
    store: overrides.store || new FileStore(repoRoot),
    http,
    fetchFeed,
    companies: overrides.companies,
    providers: overrides.providers || {
      price: new YahooPriceProvider({ http }),
      search: new GoogleNewsSearchProvider({ fetchFeed }),
      x: makeXProvider({ http, bearerToken: process.env.X_BEARER_TOKEN }),
    },
    configDir: overrides.configDir || path.join(repoRoot, 'config'),
  };
}

/**
 * One ingestion run: track prices -> search movers -> collect all sources ->
 * dedupe -> persist artifacts. (LLM relevance/summary/synthesis is the next
 * stage — see docs/morning-brief-plan.md §3 — and consumes briefs/raw/<date>.json.)
 */
async function run(ctx) {
  ctx.companies = ctx.companies || CompanyRegistry.load(path.join(ctx.configDir, 'companies.yaml'));
  const registry = ctx.registry || buildRegistry({ configDir: ctx.configDir, companies: ctx.companies });

  ctx.log.info(`[run] ${ctx.dateISO} — ${registry.list().length} sources, ${ctx.companies.tickers().length} tickers`);

  // 1. Systematic price tracking (whole watchlist, every run).
  const prices = await trackPrices(ctx.companies, ctx);
  ctx.log.info(`[prices] ${Object.keys(prices.snapshot).length} quoted, ${prices.movers.length} movers`);

  // 2. For each mover, go find the company/industry news that explains it.
  const moverItems = await searchMovers(prices.movers, ctx.companies, ctx);
  ctx.log.info(`[movement-search] ${moverItems.length} items for ${prices.movers.length} movers`);

  // 3. Collect every source (errors isolated per source).
  const { items, stats } = await registry.collectAll(ctx);

  // 4. Dedupe + cluster the combined pool.
  const pool = dedupe([...items, ...moverItems]);

  const artifact = {
    generatedAt: new Date().toISOString(),
    dateISO: ctx.dateISO,
    counts: { sources: registry.list().length, rawItems: items.length, moverItems: moverItems.length, deduped: pool.length },
    movers: prices.movers,
    sourceStats: stats,
    items: pool,
  };
  ctx.store.writeJSON(`briefs/raw/${ctx.dateISO}.json`, artifact);
  ctx.log.info(`[run] wrote briefs/raw/${ctx.dateISO}.json — ${pool.length} items`);

  // 5. Synthesis: score -> six-section brief -> render (Markdown + HTML).
  const engine = ctx.engine || makeEngine(ctx);
  const profile = ctx.profile || loadYaml(path.join(ctx.configDir, 'profile.yaml'), {});
  const result = await synthesize(artifact, engine, ctx, profile);
  const { markdown, html } = render(result.brief, result.deck, {
    date: ctx.dateISO,
    cost: result.cost,
    engine: result.engine,
  });
  ctx.store.writeText(`briefs/${ctx.dateISO}.md`, markdown);
  ctx.store.writeText(`briefs/${ctx.dateISO}.html`, html);
  ctx.store.writeJSON(`briefs/${ctx.dateISO}.brief.json`, {
    brief: result.brief,
    usage: result.usage,
    cost: result.cost,
    engine: result.engine,
  });
  ctx.log.info(`[synthesize] ${result.engine} engine · est. cost $${result.cost.toFixed(4)} · wrote briefs/${ctx.dateISO}.{md,html}`);

  // 6. Deliver (email if configured; no-op otherwise).
  const deliverer = ctx.deliverer || makeDeliverer(process.env, ctx.log);
  try {
    const res = await deliverer.send({
      subject: `Morning Brief — ${ctx.dateISO}`,
      html,
      text: markdown,
    });
    if (res.ok) ctx.log.info(`[deliver] sent via ${deliverer.name} to configured recipient`);
  } catch (e) {
    ctx.log.warn(`[deliver] send failed: ${e.message}`);
  }

  return { artifact, ...result, markdown, html };
}

if (require.main === module) {
  run(makeContext()).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { run, makeContext };
