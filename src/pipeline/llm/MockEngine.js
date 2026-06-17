'use strict';

const { scoreHeuristic } = require('./heuristic');

/**
 * Deterministic, no-network engine. Produces the same structured brief shape as
 * the AnthropicEngine so the whole pipeline can be exercised end-to-end offline
 * (and so tests/CI never need an API key).
 */
class MockEngine {
  constructor({ log } = {}) {
    this.log = log || console;
    this.name = 'mock';
  }

  async score(items, profile) {
    const m = new Map();
    for (const it of items) m.set(it.id, { score: scoreHeuristic(it, profile), reason: 'heuristic' });
    return m;
  }

  async synthesize(deck) {
    const byRef = new Map(deck.items.map((d) => [d.ref, d]));

    // headline: top items across the deck by score
    const headline = [...deck.items]
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, (deck.profile && deck.profile.headlineCount) || 4)
      .map((d) => ({ text: `${d.title}${srcTag(d)}`, refs: [d.ref] }));

    const sections = deck.sectionsOrder.map((s) => ({
      id: s.id,
      title: s.title,
      items: (deck.sectionItems[s.id] || [])
        .map((ref) => byRef.get(ref))
        .filter(Boolean)
        .map((d) => ({ title: d.title, summary: snippet(d), refs: [d.ref] })),
    }));

    const movers = (deck.movers || []).map((m) => {
      const hit = deck.items.find((d) => d.reason === `price-move:${m.ticker}`);
      return {
        ticker: m.ticker,
        pct: m.pct,
        volZ: m.volZ,
        note:
          `${m.direction === 'up' ? 'Up' : 'Down'} ${Math.abs(m.pct)}%` +
          (m.volZ >= 2 ? ` on ${m.volZ}σ volume` : '') +
          (hit ? ' — see linked coverage.' : ' — no clear catalyst surfaced.'),
        refs: hit ? [hit.ref] : [],
      };
    });

    return { brief: { headline, sections, movers }, usage: [] };
  }
}

function srcTag(d) {
  return d.sourceId ? ` (${d.sourceId})` : '';
}

function snippet(d) {
  const body = (d.body || '').replace(/\s+/g, ' ').trim();
  if (body) return body.slice(0, 220) + (body.length > 220 ? '…' : '');
  if (d.kind === 'sec') return 'Regulated disclosure filed with the SEC.';
  return d.title;
}

module.exports = { MockEngine };
