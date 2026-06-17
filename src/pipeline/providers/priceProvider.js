'use strict';

const { sleep } = require('./http');

/**
 * PriceProvider contract:
 *   quotes(tickers, ctx) -> Promise<{ [ticker]: Quote }>
 *   Quote = { price, prevClose, volume, history: [{ date, close, volume }] }
 *
 * Swap the implementation (Yahoo, Finnhub, Polygon, a paid feed) without
 * touching the price tracker — it only depends on this shape.
 */

/** Free, keyless Yahoo Finance chart endpoint. One call per symbol. */
class YahooPriceProvider {
  constructor({ http, minIntervalMs = 120, range = '1mo' } = {}) {
    this.http = http;
    this.minIntervalMs = minIntervalMs;
    this.range = range;
  }

  async quotes(tickers, ctx) {
    const out = {};
    for (const ticker of tickers) {
      try {
        out[ticker] = await this._one(ticker);
      } catch (e) {
        (ctx && ctx.log ? ctx.log : console).warn(`[price:${ticker}] ${e.message}`);
      }
      if (this.minIntervalMs) await sleep(this.minIntervalMs);
    }
    return out;
  }

  async _one(ticker) {
    const url =
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}` +
      `?range=${this.range}&interval=1d`;
    const res = await this.http(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const r = json && json.chart && json.chart.result && json.chart.result[0];
    if (!r) throw new Error('no chart result');
    const meta = r.meta || {};
    const ts = r.timestamp || [];
    const q = (r.indicators && r.indicators.quote && r.indicators.quote[0]) || {};
    const history = ts
      .map((t, i) => ({
        date: new Date(t * 1000).toISOString().slice(0, 10),
        close: q.close ? q.close[i] : null,
        volume: q.volume ? q.volume[i] : null,
      }))
      .filter((d) => d.close != null);
    const prevClose =
      meta.chartPreviousClose != null
        ? meta.chartPreviousClose
        : history.length > 1
        ? history[history.length - 2].close
        : null;
    return {
      price: meta.regularMarketPrice != null ? meta.regularMarketPrice : history.length ? history[history.length - 1].close : null,
      prevClose,
      volume: meta.regularMarketVolume != null ? meta.regularMarketVolume : history.length ? history[history.length - 1].volume : null,
      history,
    };
  }
}

/** Deterministic provider for offline tests. Pass a `{ticker: Quote}` map. */
class MockPriceProvider {
  constructor(quotes) {
    this._quotes = quotes || {};
  }
  async quotes(tickers) {
    const out = {};
    for (const t of tickers) if (this._quotes[t]) out[t] = this._quotes[t];
    return out;
  }
}

module.exports = { YahooPriceProvider, MockPriceProvider };
