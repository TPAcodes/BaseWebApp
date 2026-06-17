'use strict';

const Parser = require('rss-parser');

const DEFAULT_UA =
  'morning-brief/0.2 (+https://github.com/TPAcodes/BaseWebApp; contact: configure app.userAgent)';

/** fetch() wrapper with UA, timeout, and a couple of retries on 5xx/network. */
function makeHttp({ userAgent = DEFAULT_UA, timeoutMs = 15000, retries = 2 } = {}) {
  return async function http(url, opts = {}) {
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs || timeoutMs);
      try {
        const res = await fetch(url, {
          method: opts.method || 'GET',
          headers: { 'User-Agent': userAgent, Accept: '*/*', ...(opts.headers || {}) },
          body: opts.body,
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        if (res.status >= 500 && attempt < retries) {
          lastErr = new Error(`HTTP ${res.status}`);
          await sleep(250 * (attempt + 1));
          continue;
        }
        return res;
      } catch (e) {
        clearTimeout(timer);
        lastErr = e;
        if (attempt < retries) await sleep(250 * (attempt + 1));
      }
    }
    throw lastErr;
  };
}

/**
 * Feed fetcher for RSS *and* Atom (rss-parser handles both). Supports a
 * `fixture` string so sources can be exercised offline in tests.
 */
function makeFeedFetcher({ userAgent = DEFAULT_UA, timeoutMs = 15000 } = {}) {
  const parser = new Parser({
    timeout: timeoutMs,
    headers: { 'User-Agent': userAgent },
  });
  return async function fetchFeed(url, { fixture } = {}) {
    const feed = fixture ? await parser.parseString(fixture) : await parser.parseURL(url);
    return feed.items || [];
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = { makeHttp, makeFeedFetcher, sleep, DEFAULT_UA };
