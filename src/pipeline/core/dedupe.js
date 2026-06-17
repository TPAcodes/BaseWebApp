'use strict';

/**
 * Dedup + light clustering. Items sharing a canonical URL collapse exactly;
 * remaining items cluster by title-token similarity so the same story reported
 * by several outlets becomes one entry with multiple `sources`.
 */
function normTitle(t) {
  return (t || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenize(t) {
  return new Set(normTitle(t).split(' ').filter((w) => w.length > 2));
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

const TRUST_RANK = { primary: 3, press: 2, social: 1, aggregator: 0 };

function better(a, b) {
  const ta = TRUST_RANK[a.trustTier] ?? 0;
  const tb = TRUST_RANK[b.trustTier] ?? 0;
  if (ta !== tb) return ta > tb ? a : b;
  if ((a.weight ?? 0) !== (b.weight ?? 0)) return (a.weight ?? 0) > (b.weight ?? 0) ? a : b;
  return (a.body || '').length >= (b.body || '').length ? a : b;
}

function dedupe(items, { titleThreshold = 0.82 } = {}) {
  // 1) exact collapse by canonical URL
  const byUrl = new Map();
  const noUrl = [];
  for (const it of items) {
    if (it.url) {
      byUrl.set(it.url, byUrl.has(it.url) ? mergeSources(byUrl.get(it.url), it) : withSources(it));
    } else {
      noUrl.push(withSources(it));
    }
  }
  const flat = [...byUrl.values(), ...noUrl];

  // 2) cluster the survivors by title similarity
  const clusters = [];
  for (const it of flat) {
    const tok = tokenize(it.title);
    let placed = false;
    for (const c of clusters) {
      if (jaccard(c.tok, tok) >= titleThreshold) {
        c.rep = mergeSources(better(c.rep, it), it);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push({ tok, rep: it });
  }

  return clusters.map((c) => ({
    ...c.rep,
    clusterSize: c.rep.sources ? c.rep.sources.length : 1,
  }));
}

function withSources(it) {
  return { ...it, sources: [{ sourceId: it.sourceId, url: it.url }] };
}

function mergeSources(keep, drop) {
  const sources = (keep.sources || [{ sourceId: keep.sourceId, url: keep.url }]).slice();
  const incoming = drop.sources || [{ sourceId: drop.sourceId, url: drop.url }];
  for (const s of incoming) {
    if (!sources.some((x) => x.sourceId === s.sourceId && x.url === s.url)) sources.push(s);
  }
  return { ...keep, sources };
}

module.exports = { dedupe, jaccard, tokenize };
