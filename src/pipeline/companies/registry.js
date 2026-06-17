'use strict';

const fs = require('fs');
const yaml = require('js-yaml');

/**
 * Company registry: the source of truth tying a ticker to the channels it
 * publishes through (IR/blog RSS, X account) and its SEC CIK. Drives both
 * systematic price tracking and systematic publication tracking.
 */
class CompanyRegistry {
  constructor(companies) {
    this.companies = companies || [];
    this._byTicker = new Map();
    this._byAlias = new Map();
    for (const c of this.companies) {
      this._byTicker.set(c.ticker.toUpperCase(), c);
      for (const a of [c.name, ...(c.aliases || [])]) {
        if (a) this._byAlias.set(a.toLowerCase(), c);
      }
    }
  }

  all() {
    return this.companies;
  }

  tickers() {
    return this.companies.map((c) => c.ticker.toUpperCase());
  }

  byTicker(t) {
    return t ? this._byTicker.get(t.toUpperCase()) : undefined;
  }

  byAlias(name) {
    return name ? this._byAlias.get(name.toLowerCase()) : undefined;
  }

  static load(path) {
    const doc = yaml.load(fs.readFileSync(path, 'utf8')) || {};
    return new CompanyRegistry(doc.companies || []);
  }
}

module.exports = { CompanyRegistry };
