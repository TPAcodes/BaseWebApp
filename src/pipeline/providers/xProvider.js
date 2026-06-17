'use strict';

/**
 * XProvider contract:
 *   timeline(handles, { sinceHours, limitPerHandle }, ctx) -> Promise<Post[]>
 *   Post = { id, handle, name, text, url, createdAt }
 *
 * X/Twitter access is the one source that is NOT freely available: there is no
 * public RSS and the official API is paid/tiered. We therefore make the
 * provider pluggable and ship three implementations:
 *
 *   - XApiV2Provider  : official API v2 (needs a bearer token; recommended).
 *   - NullXProvider   : no credentials -> logs a warning, yields nothing
 *                       (so the pipeline runs fine before X is wired up).
 *   - MockXProvider   : fixtures for offline tests.
 *
 * A self-hosted bridge (e.g. an RSS-bridge / nitter instance) can be dropped in
 * by implementing the same `timeline()` shape.
 */
class XApiV2Provider {
  constructor({ http, bearerToken }) {
    this.http = http;
    this.bearer = bearerToken;
    this._idCache = new Map();
  }

  _auth() {
    return { Authorization: `Bearer ${this.bearer}`, headers: true };
  }

  async _resolveIds(handles) {
    const missing = handles.filter((h) => !this._idCache.has(h));
    for (let i = 0; i < missing.length; i += 100) {
      const batch = missing.slice(i, i + 100);
      const url = `https://api.twitter.com/2/users/by?usernames=${batch.join(',')}`;
      const res = await this.http(url, { headers: { Authorization: `Bearer ${this.bearer}` } });
      if (!res.ok) throw new Error(`users/by HTTP ${res.status}`);
      const json = await res.json();
      for (const u of json.data || []) this._idCache.set(u.username.toLowerCase(), u);
    }
    return handles.map((h) => this._idCache.get(h.toLowerCase())).filter(Boolean);
  }

  async timeline(handles, { sinceHours = 36, limitPerHandle = 10 } = {}) {
    if (!this.bearer) throw new Error('X bearer token not configured');
    const start = new Date(Date.now() - sinceHours * 3600 * 1000).toISOString();
    const users = await this._resolveIds(handles.map((h) => h.handle || h));
    const posts = [];
    for (const u of users) {
      const url =
        `https://api.twitter.com/2/users/${u.id}/tweets` +
        `?max_results=${Math.min(Math.max(limitPerHandle, 5), 100)}` +
        `&start_time=${encodeURIComponent(start)}` +
        `&tweet.fields=created_at,public_metrics&exclude=retweets,replies`;
      const res = await this.http(url, { headers: { Authorization: `Bearer ${this.bearer}` } });
      if (!res.ok) continue;
      const json = await res.json();
      for (const t of json.data || []) {
        posts.push({
          id: t.id,
          handle: u.username,
          name: u.name,
          text: t.text,
          url: `https://x.com/${u.username}/status/${t.id}`,
          createdAt: t.created_at,
        });
      }
    }
    return posts;
  }
}

class NullXProvider {
  async timeline(handles, _opts, ctx) {
    (ctx && ctx.log ? ctx.log : console).warn(
      '[x] no X provider configured (set X_BEARER_TOKEN) — skipping ' +
        (handles ? handles.length : 0) + ' handle(s)'
    );
    return [];
  }
}

class MockXProvider {
  constructor(posts) {
    this._posts = posts || [];
  }
  async timeline(handles) {
    const wanted = new Set(handles.map((h) => (h.handle || h).toLowerCase()));
    return this._posts.filter((p) => wanted.has(p.handle.toLowerCase()));
  }
}

/** Pick an implementation from env/config. */
function makeXProvider({ http, bearerToken } = {}) {
  return bearerToken ? new XApiV2Provider({ http, bearerToken }) : new NullXProvider();
}

module.exports = { XApiV2Provider, NullXProvider, MockXProvider, makeXProvider };
