'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const { BRIEF_SCHEMA, SCORE_SCHEMA } = require('./schema');
const { scoreHeuristic } = require('./heuristic');

/**
 * Real engine. Tiered models per the cost plan:
 *   - Haiku 4.5  for relevance scoring (cheap, chunked, structured output)
 *   - Opus 4.8   for the single synthesis pass (adaptive thinking, cached system)
 * Both use structured outputs so the result is guaranteed-parseable JSON.
 */
class AnthropicEngine {
  constructor({ apiKey, models, log } = {}) {
    this.client = new Anthropic({ apiKey: apiKey || process.env.ANTHROPIC_API_KEY });
    this.models = { score: 'claude-haiku-4-5', synthesize: 'claude-opus-4-8', ...(models || {}) };
    this.log = log || console;
    this.name = 'anthropic';
  }

  async _json({ model, system, user, schema, thinking, maxTokens = 8000 }) {
    const req = {
      model,
      max_tokens: maxTokens,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: user }],
      output_config: { format: { type: 'json_schema', schema } },
    };
    if (thinking) req.thinking = { type: 'adaptive' };
    const res = await this.client.messages.create(req);
    const text = (res.content.find((b) => b.type === 'text') || {}).text || '{}';
    const u = res.usage || {};
    const usage = {
      model,
      input: (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0),
      output: u.output_tokens || 0,
    };
    return { data: JSON.parse(text), usage };
  }

  async score(items, profile) {
    const out = new Map();
    const system =
      'You score how relevant each item is to the reader, 0..1. Reader interests:\n' +
      JSON.stringify(profile && profile.interests ? profile.interests : {}, null, 1) +
      '\nReturn a score for every id. Favor first-party releases, capability/architecture changes, ' +
      'new constraints (power, HBM, packaging, data, capital), and clear market-moving news.';
    const chunkSize = 30;
    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize);
      const user =
        'Score these items:\n' +
        chunk
          .map((it) => `id=${it.id} [${it.category}/${it.trustTier}] ${it.title} :: ${(it.body || '').slice(0, 160)}`)
          .join('\n');
      try {
        const { data } = await this._json({ model: this.models.score, system, user, schema: SCORE_SCHEMA, maxTokens: 2000 });
        for (const s of data.scores || []) out.set(s.id, { score: clamp(s.score), reason: s.reason || 'model' });
      } catch (e) {
        this.log.warn(`[score] chunk failed (${e.message}); using heuristic`);
        for (const it of chunk) out.set(it.id, { score: scoreHeuristic(it, profile), reason: 'heuristic-fallback' });
      }
    }
    return out;
  }

  async synthesize(deck) {
    const system = SYNTH_SYSTEM(deck.profile);
    const user = renderDeck(deck);
    const { data, usage } = await this._json({
      model: this.models.synthesize,
      system,
      user,
      schema: BRIEF_SCHEMA,
      thinking: true,
      maxTokens: 8000,
    });
    return { brief: data, usage: [usage] };
  }
}

function SYNTH_SYSTEM(profile) {
  const tone = (profile && profile.tone) || 'executive';
  return [
    'You are the editor of a daily technology & public-markets intelligence brief.',
    'Write the brief from the supplied deck of numbered items. Sections are fixed and given to you.',
    '',
    'GROUNDING (hard rule): every headline bullet and every section item MUST cite at least one',
    'item by its number via the `refs` array. Never assert anything not supported by a cited item.',
    'If a section has no strong items, return few or zero items for it rather than padding.',
    '',
    'Emphasize what could be an INFLECTION: a new constraint (power, HBM, packaging, data, capital,',
    'talent), a problem breakthrough, a capability/architecture change, or notable forward guidance.',
    'For the equities/movers, explain the likely CATALYST behind each move using the cited news;',
    'if no catalyst is evident in the deck, say so plainly.',
    `Tone: ${tone}. Be concise and concrete; prefer specifics over hedging.`,
  ].join('\n');
}

function renderDeck(deck) {
  const lines = [`Date: ${deck.date}`, '', 'SECTIONS (use these ids/titles):'];
  for (const s of deck.sectionsOrder) lines.push(`- ${s.id}: ${s.title} (items: ${(deck.sectionItems[s.id] || []).join(', ') || 'none'})`);
  lines.push('', 'PRICE MOVERS:');
  for (const m of deck.movers || []) lines.push(`- ${m.ticker} ${m.pct}% volZ=${m.volZ} (${m.direction})`);
  lines.push('', 'DECK ITEMS (cite by number):');
  for (const d of deck.items) {
    lines.push(
      `[${d.ref}] (${d.category}/${d.trustTier}/${d.sourceId}) ${d.title}` +
        (d.entities && d.entities.tickers && d.entities.tickers.length ? ` {${d.entities.tickers.join(',')}}` : '') +
        (d.body ? `\n     ${d.body.slice(0, 280)}` : '')
    );
  }
  return lines.join('\n');
}

function clamp(n) {
  return Math.max(0, Math.min(1, Number(n) || 0));
}

module.exports = { AnthropicEngine };
