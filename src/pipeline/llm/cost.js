'use strict';

/** Per-MTok USD rates (standard API). Batch API would halve these. */
const RATES = {
  'claude-opus-4-8': { in: 5, out: 25 },
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-haiku-4-5': { in: 1, out: 5 },
};

/** Sum a list of {model, input, output} usage records into a USD estimate. */
function estimateCost(usages) {
  let usd = 0;
  for (const u of usages || []) {
    const r = RATES[u.model];
    if (!r) continue;
    usd += (u.input || 0) / 1e6 * r.in + (u.output || 0) / 1e6 * r.out;
  }
  return Math.round(usd * 10000) / 10000;
}

module.exports = { RATES, estimateCost };
