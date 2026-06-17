'use strict';

/**
 * End-to-end demo with NO network and NO API key: builds a realistic one-day
 * artifact (items across every section + price movers + X voices), runs the
 * full score -> synthesize -> render pipeline on the MockEngine, writes the
 * rendered brief to docs/sample-brief.{md,html}, and prints the Markdown.
 *
 *   node scripts/demo-brief.js
 *   ANTHROPIC_API_KEY=... node scripts/demo-brief.js   # uses the real engine
 */
const path = require('path');
const { newItem } = require('../src/pipeline/core/item');
const { FileStore } = require('../src/pipeline/core/store');
const { makeEngine } = require('../src/pipeline/llm');
const { synthesize } = require('../src/pipeline/synthesize');
const { render } = require('../src/pipeline/render');
const { loadYaml } = require('../src/pipeline/build');
const { computeWindow } = require('../src/pipeline/window');

const now = new Date().toISOString();
const repoRoot = path.resolve(__dirname, '..');

function item(o) {
  return {
    ...newItem({ ...o, publishedAt: o.publishedAt || now }),
    category: o.category,
    trustTier: o.trustTier || 'press',
    weight: o.weight == null ? 0.6 : o.weight,
    reason: o.reason || null,
  };
}

const items = [
  // AI models
  item({ sourceId: 'openai-news', kind: 'rss', category: 'ai-models', trustTier: 'primary', weight: 0.85,
    title: 'OpenAI releases a smaller reasoning model with 1M context',
    body: 'New model targets long-context reasoning at lower inference cost; open weights for research.',
    url: 'https://openai.com/news/reasoning-mini' }),
  item({ sourceId: 'arxiv-ai', kind: 'arxiv', category: 'ai-models', trustTier: 'primary', weight: 0.6,
    title: 'Linear-attention variant matches transformers at 1/3 the KV-cache',
    body: 'Architecture change reduces memory bandwidth pressure during decoding.',
    url: 'https://arxiv.org/abs/2606.00001' }),
  // AI infra
  item({ sourceId: 'semianalysis', kind: 'rss', category: 'ai-infra', trustTier: 'primary', weight: 0.9,
    title: 'HBM supply remains the binding constraint for 2026 accelerator ramps',
    body: 'Packaging (CoWoS) and HBM3E allocation, not wafers, gate datacenter GPU output.',
    url: 'https://semianalysis.com/hbm-2026' }),
  item({ sourceId: 'pub:NVDA:rss:0', kind: 'rss', category: 'ai-infra', trustTier: 'primary', weight: 0.8,
    entities: { tickers: ['NVDA'], orgs: ['NVIDIA'] },
    title: 'NVIDIA details next-gen rack-scale interconnect',
    body: 'Higher NVLink bandwidth aimed at trillion-parameter training clusters.',
    url: 'https://blogs.nvidia.com/interconnect' }),
  item({ sourceId: 'sec:NVDA', kind: 'sec', category: 'equities', trustTier: 'primary', weight: 0.85,
    entities: { tickers: ['NVDA'], orgs: ['NVIDIA'] }, topics: ['filing', '8-K'],
    title: '8-K — NVIDIA (Results of Operations)',
    body: '', url: 'https://www.sec.gov/Archives/edgar/data/1045810/000/nvda-8k.htm' }),
  // bio + robotics
  item({ sourceId: 'ieee-robotics', kind: 'rss', category: 'bio-robotics', trustTier: 'press', weight: 0.6,
    title: 'Humanoid startup shows dexterous manipulation trained mostly in sim',
    body: 'Sim-to-real transfer closes the gap on contact-rich tasks.',
    url: 'https://spectrum.ieee.org/humanoid-sim2real' }),
  item({ sourceId: 'arxiv-bio', kind: 'arxiv', category: 'bio-robotics', trustTier: 'primary', weight: 0.6,
    title: 'Protein-design model improves binder success rate in wet-lab tests',
    body: 'Generative model proposes binders later validated experimentally.',
    url: 'https://arxiv.org/abs/2606.00002' }),
  // equities — movement-driven search hit
  item({ sourceId: 'news-search', kind: 'news-search', category: 'ai-infra', trustTier: 'press', weight: 0.9,
    reason: 'price-move:NVDA', entities: { tickers: ['NVDA'], orgs: ['NVIDIA'] },
    title: 'NVIDIA jumps after raising datacenter guidance',
    body: 'Shares rallied as the company lifted its outlook on AI accelerator demand.',
    url: 'https://news.example/nvda-guidance' }),
  // voices (X)
  item({ sourceId: 'x-thought-leaders', kind: 'x', category: 'ai-infra', trustTier: 'social', weight: 0.55,
    entities: { orgs: ['Dylan Patel'] },
    title: '@dylan522p: HBM is the gating input into 2026 — not wafers.',
    body: 'HBM is the gating input into 2026 — not wafers. Watch packaging allocation.',
    url: 'https://x.com/dylan522p/status/1' }),
  item({ sourceId: 'x-thought-leaders', kind: 'x', category: 'ai-models', trustTier: 'social', weight: 0.55,
    entities: { orgs: ['Andrej Karpathy'] },
    title: '@karpathy: long-context done right changes how we build agents.',
    body: 'Long-context done right changes how we build agents — fewer retrieval hacks.',
    url: 'https://x.com/karpathy/status/2' }),
];

const artifact = {
  dateISO: now.slice(0, 10),
  items,
  movers: [
    { ticker: 'NVDA', company: 'NVIDIA', sector: 'Semiconductors', pct: 8.2, volZ: 2.6, direction: 'up', reason: 'price' },
    { ticker: 'MU', company: 'Micron', sector: 'Memory', pct: -5.1, volZ: 1.2, direction: 'down', reason: 'price' },
  ],
};

async function main() {
  const ctx = { log: console, configDir: path.join(repoRoot, 'config') };
  const engine = makeEngine(ctx);
  const profile = loadYaml(path.join(ctx.configDir, 'profile.yaml'), {});
  const result = await synthesize(artifact, engine, ctx, profile);
  const win = computeWindow({ timeZone: (profile.window && profile.window.timezone) || 'America/New_York' });
  const { markdown, html } = render(result.brief, result.deck, {
    date: artifact.dateISO,
    coverage: win.label,
    cost: result.cost,
    engine: result.engine,
  });

  const store = new FileStore(repoRoot);
  store.writeText('docs/sample-brief.md', markdown);
  store.writeText('docs/sample-brief.html', html);

  console.log('\n' + '='.repeat(72));
  console.log(markdown);
  console.log('='.repeat(72));
  console.log(`\nengine=${result.engine}  cost=$${result.cost.toFixed(4)}  deck=${result.deck.items.length} items`);
  console.log('wrote docs/sample-brief.md and docs/sample-brief.html');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
