'use strict';

const { MockEngine } = require('./MockEngine');
const { AnthropicEngine } = require('./AnthropicEngine');

/**
 * Choose an engine. Real Anthropic engine when an API key is present; otherwise
 * the deterministic mock (so runs and CI never hard-fail on a missing key).
 * Force the mock with BRIEF_ENGINE=mock.
 */
function makeEngine(ctx = {}) {
  const log = ctx.log || console;
  if (process.env.BRIEF_ENGINE === 'mock') return new MockEngine({ log });
  if (process.env.ANTHROPIC_API_KEY) return new AnthropicEngine({ log });
  log.warn('[llm] no ANTHROPIC_API_KEY — using mock engine (set the key or BRIEF_ENGINE for real synthesis)');
  return new MockEngine({ log });
}

module.exports = { makeEngine, MockEngine, AnthropicEngine };
