'use strict';

/**
 * Offline smoke test for the ingestion framework. Uses fixture-backed feeds and
 * mock providers (no network), and asserts the canonical-traits / registry /
 * price-tracking / movement-search / dedupe behavior end to end.
 *
 *   node scripts/smoke.js
 */
const assert = require('assert');
const os = require('os');
const fs = require('fs');
const path = require('path');

const { SourceRegistry } = require('../src/pipeline/core/registry');
const { registerKinds } = require('../src/pipeline/sources');
const { CompanyRegistry } = require('../src/pipeline/companies/registry');
const { FileStore } = require('../src/pipeline/core/store');
const { makeFeedFetcher } = require('../src/pipeline/providers/http');
const { MockPriceProvider } = require('../src/pipeline/providers/priceProvider');
const { MockSearchProvider } = require('../src/pipeline/providers/searchProvider');
const { MockXProvider } = require('../src/pipeline/providers/xProvider');
const { trackPrices } = require('../src/pipeline/priceTracker');
const { searchMovers } = require('../src/pipeline/movementSearch');
const { dedupe } = require('../src/pipeline/core/dedupe');

const recent = new Date().toUTCString();

function feed(items) {
  return (
    '<?xml version="1.0"?><rss version="2.0"><channel><title>fix</title>' +
    items.map((it) => `<item><title>${it.t}</title><link>${it.l}</link><pubDate>${recent}</pubDate><description>${it.d || ''}</description></item>`).join('') +
    '</channel></rss>'
  );
}

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'brief-smoke-'));
  const silent = { info() {}, warn() {}, error: console.error };

  const companies = new CompanyRegistry([
    { ticker: 'NVDA', name: 'NVIDIA', sector: 'Semiconductors' },
    { ticker: 'AAPL', name: 'Apple', sector: 'Consumer Hardware' },
  ]);

  const ctx = {
    now: Date.now(),
    dateISO: new Date().toISOString().slice(0, 10),
    log: silent,
    store: new FileStore(tmp),
    fetchFeed: makeFeedFetcher(),
    config: { app: {} },
    companies,
    providers: {
      price: new MockPriceProvider({
        NVDA: { price: 130, prevClose: 110, volume: 9e8, history: hist(110, 3e8) },
        AAPL: { price: 200, prevClose: 199.5, volume: 5e7, history: hist(199, 5e7) },
      }),
      search: new MockSearchProvider({
        NVIDIA: [{ sourceId: 'news-search', kind: 'news-search', url: 'https://news.example/nvda-rubin', title: 'NVIDIA jumps on Rubin demand', publishedAt: recent }],
      }),
      x: new MockXProvider([
        { id: '1', handle: 'dylan522p', name: 'Dylan Patel', text: 'HBM supply is the binding constraint into 2026.', url: 'https://x.com/dylan522p/status/1', createdAt: new Date().toISOString() },
      ]),
    },
  };

  // --- canonical traits + registry -------------------------------------------
  const registry = registerKinds(new SourceRegistry());
  const rssSrc = registry.build({
    id: 'fix-infra', kind: 'rss', category: 'ai-infra', weight: 0.91,
    options: { fixture: feed([
      { t: 'NVIDIA announces Rubin GPU', l: 'https://example.com/a?utm_source=tw' },
      { t: 'New transformer variant cuts KV-cache memory', l: 'https://example.com/b' },
    ]) },
  });
  // duplicate story from another outlet (same link, different tracking param)
  registry.build({
    id: 'fix-press', kind: 'rss', category: 'ai-models',
    options: { fixture: feed([{ t: 'Nvidia unveils Rubin GPU', l: 'https://example.com/a?ref=home' }]) },
  });
  registry.build({
    id: 'fix-x', kind: 'x', category: 'ai-infra',
    options: { handles: [{ handle: 'dylan522p', name: 'Dylan Patel', topics: ['ai-infra'] }] },
  });

  assert.strictEqual(rssSrc.traits.weight, 0.91, 'per-instance trait override applied');
  assert.strictEqual(rssSrc.traits.trustTier, 'press', 'kind default trait applied');
  assert.strictEqual(rssSrc.traits.maxItems, 50, 'global default trait applied');

  // --- systematic price tracking ---------------------------------------------
  const prices = await trackPrices(companies, ctx);
  const nvda = prices.movers.find((m) => m.ticker === 'NVDA');
  assert.ok(nvda, 'NVDA detected as a mover');
  assert.ok(nvda.pct > 17 && nvda.pct < 19, `NVDA pct ~18 (got ${nvda.pct})`);
  assert.ok(!prices.movers.find((m) => m.ticker === 'AAPL'), 'AAPL not a mover');
  assert.ok(fs.existsSync(ctx.store.resolve('data/prices/history.json')), 'price history persisted');

  // --- movement-driven search -------------------------------------------------
  const moverItems = await searchMovers(prices.movers, companies, ctx);
  assert.ok(moverItems.length >= 1, 'movement search returned items');
  assert.strictEqual(moverItems[0].reason, 'price-move:NVDA', 'mover item tagged with ticker reason');
  assert.deepStrictEqual(moverItems[0].entities.tickers, ['NVDA'], 'mover item tagged with ticker entity');

  // --- collect + dedupe -------------------------------------------------------
  const { items } = await registry.collectAll(ctx);
  assert.ok(items.some((it) => it.kind === 'x'), 'X source produced items');
  assert.ok(items.some((it) => it.kind === 'rss'), 'RSS source produced items');

  const pool = dedupe([...items, ...moverItems]);
  const rubin = pool.find((it) => /rubin/i.test(it.title) && it.url.includes('example.com/a'));
  assert.ok(rubin, 'rubin story present after dedupe');
  assert.ok(rubin.clusterSize >= 2, `duplicate outlets clustered (size ${rubin.clusterSize})`);

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`PASS — ${pool.length} deduped items, ${prices.movers.length} mover(s), traits/registry/price/search/dedupe all green`);
}

function hist(close, vol) {
  return Array.from({ length: 20 }, (_, i) => ({ date: `2026-05-${String(i + 1).padStart(2, '0')}`, close, volume: vol }));
}

main().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
