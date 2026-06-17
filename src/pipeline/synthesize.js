'use strict';

const { scoreHeuristic } = require('./llm/heuristic');
const { estimateCost } = require('./llm/cost');

const SECTION_DEFS = [
  { id: 'ai-models', title: 'AI models & architecture' },
  { id: 'ai-infra', title: 'AI infrastructure' },
  { id: 'bio-robotics', title: 'AI × biology & robotics' },
  { id: 'equities', title: 'Public equities (tech)' },
  { id: 'voices', title: 'Voices & interviews' },
];
const SECTION_IDS = SECTION_DEFS.map((s) => s.id);

function routeSection(item) {
  if (item.kind === 'x' || item.kind === 'podcast') return 'voices';
  return SECTION_IDS.includes(item.category) ? item.category : null;
}

/**
 * Score -> route into sections -> keep top-K per section -> assign global
 * citation refs -> synthesize -> enforce grounding (drop any claim whose refs
 * don't resolve to a real deck item).
 */
async function synthesize(artifact, engine, ctx, profile) {
  const log = (ctx && ctx.log) || console;
  const items = artifact.items || [];
  profile = profile || {};

  // 1. score
  let scores = new Map();
  try {
    scores = await engine.score(items, profile);
  } catch (e) {
    log.warn(`[synthesize] scoring failed (${e.message}); heuristic only`);
  }
  for (const it of items) {
    const s = scores.get(it.id);
    it.score = it.reason && it.reason.startsWith('price-move') ? 1 : s ? s.score : scoreHeuristic(it, profile);
  }

  // 2. route + keep top-K
  const maxK = profile.maxPerSection || 6;
  const bySection = {};
  for (const s of SECTION_DEFS) bySection[s.id] = [];
  for (const it of items) {
    const sec = routeSection(it);
    if (sec) bySection[sec].push(it);
  }
  const kept = [];
  for (const s of SECTION_DEFS) {
    bySection[s.id] = bySection[s.id].sort((a, b) => b.score - a.score).slice(0, maxK);
    kept.push(...bySection[s.id]);
  }

  // 3. assign global citation refs
  const refById = new Map();
  const deckItems = [];
  let ref = 1;
  for (const it of kept) {
    if (refById.has(it.id)) continue;
    refById.set(it.id, ref);
    deckItems.push({ ref, ...slim(it) });
    ref++;
  }
  const sectionItems = {};
  for (const s of SECTION_DEFS) sectionItems[s.id] = bySection[s.id].map((it) => refById.get(it.id));

  const deck = {
    date: artifact.dateISO,
    items: deckItems,
    sectionsOrder: SECTION_DEFS,
    sectionItems,
    movers: artifact.movers || [],
    profile,
  };

  // 4. synthesize
  const { brief, usage } = await engine.synthesize(deck, ctx);

  // 5. grounding: prune refs that don't resolve; drop ungrounded claims
  const valid = new Set(deckItems.map((d) => d.ref));
  const dropped = pruneGrounding(brief, valid);
  if (dropped) log.warn(`[synthesize] dropped ${dropped} ungrounded ref(s)`);

  const cost = estimateCost(usage);
  return { brief, deck, usage: usage || [], cost, engine: engine.name || 'unknown' };
}

function slim(it) {
  return {
    id: it.id,
    title: it.title,
    body: (it.body || '').slice(0, 600),
    url: it.url,
    sourceId: it.sourceId,
    kind: it.kind,
    category: it.category,
    trustTier: it.trustTier,
    publishedAt: it.publishedAt,
    reason: it.reason,
    score: it.score,
    entities: it.entities,
  };
}

function pruneGrounding(brief, valid) {
  let dropped = 0;
  const filterRefs = (refs) => {
    const out = (refs || []).filter((r) => valid.has(r));
    dropped += (refs || []).length - out.length;
    return out;
  };
  brief.headline = (brief.headline || []).map((h) => ({ ...h, refs: filterRefs(h.refs) })).filter((h) => h.refs.length);
  for (const sec of brief.sections || []) {
    sec.items = (sec.items || []).map((i) => ({ ...i, refs: filterRefs(i.refs) })).filter((i) => i.refs.length);
  }
  // movers are grounded by our own price data; keep them, just clean refs
  for (const m of brief.movers || []) m.refs = filterRefs(m.refs);
  return dropped;
}

module.exports = { synthesize, SECTION_DEFS };
