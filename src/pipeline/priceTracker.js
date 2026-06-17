'use strict';

/**
 * Systematic price tracking.
 *
 * Every run snapshots the ENTIRE watchlist (not just names that happened to
 * have news), persists a rolling history, and computes for each name:
 *   - pct  : % change vs prior close
 *   - volZ : volume z-score vs the trailing window (unusual-activity signal)
 *
 * Names breaching either threshold are flagged as "movers" and handed to the
 * movement-driven news search so we go find out *why* they moved.
 */
function zscore(value, series) {
  const xs = series.filter((v) => typeof v === 'number');
  if (value == null || xs.length < 5) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
  const sd = Math.sqrt(variance);
  return sd === 0 ? 0 : (value - mean) / sd;
}

async function trackPrices(companies, ctx, opts = {}) {
  const pctThreshold = opts.pctThreshold != null ? opts.pctThreshold : 4; // %
  const volZThreshold = opts.volZThreshold != null ? opts.volZThreshold : 2; // sigma
  const tickers = companies.tickers();

  const quotes = await ctx.providers.price.quotes(tickers, ctx);
  const history = ctx.store.readJSON('data/prices/history.json', {});
  const snapshot = {};
  const movers = [];

  for (const ticker of tickers) {
    const q = quotes[ticker];
    if (!q || q.price == null || q.prevClose == null) continue;

    const pct = ((q.price - q.prevClose) / q.prevClose) * 100;
    const trailingVolumes = (q.history || []).slice(0, -1).map((d) => d.volume);
    const volZ = zscore(q.volume, trailingVolumes);

    const row = {
      ticker,
      company: (companies.byTicker(ticker) || {}).name || ticker,
      sector: (companies.byTicker(ticker) || {}).sector || null,
      price: round(q.price),
      prevClose: round(q.prevClose),
      pct: round(pct, 2),
      volume: q.volume,
      volZ: round(volZ, 2),
      asOf: ctx.dateISO,
    };
    snapshot[ticker] = row;

    const hist = history[ticker] || [];
    hist.push({ date: ctx.dateISO, close: row.price, pct: row.pct, volume: q.volume, volZ: row.volZ });
    history[ticker] = hist.slice(-400);

    if (Math.abs(pct) >= pctThreshold || volZ >= volZThreshold) {
      movers.push({
        ...row,
        direction: pct >= 0 ? 'up' : 'down',
        reason: Math.abs(pct) >= pctThreshold ? 'price' : 'volume',
      });
    }
  }

  movers.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
  ctx.store.writeJSON('data/prices/history.json', history);
  ctx.store.writeJSON(`data/prices/snapshots/${ctx.dateISO}.json`, snapshot);

  return { snapshot, movers, thresholds: { pctThreshold, volZThreshold } };
}

function round(n, d = 2) {
  if (n == null) return null;
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

module.exports = { trackPrices, zscore };
