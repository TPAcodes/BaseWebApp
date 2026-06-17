'use strict';

const { newItem } = require('../core/item');

const DEFAULT_FORMS = ['8-K', '10-Q', '10-K', '6-K', '20-F', 'S-1', '424B5', 'SC 13D', '425'];

/**
 * SEC EDGAR kind — the systematic backstop for "everything a company publishes"
 * that is legally required to be disclosed. Blogs/IR feeds are best-effort;
 * EDGAR filings are guaranteed. One source per company (built from the company
 * registry's `secCik`).
 *   options: { cik, company, forms? }
 */
module.exports = {
  traitDefaults: { category: 'equities', trustTier: 'primary', weight: 0.85, lookbackHours: 72 },

  async fetch(traits, ctx) {
    const cik = String(traits.options.cik || '').replace(/\D/g, '');
    if (!cik) throw new Error(`sec source "${traits.id}" needs options.cik`);
    const padded = cik.padStart(10, '0');
    const ua = (ctx.config && ctx.config.app && ctx.config.app.secUserAgent) || ctx.userAgent;
    const res = await ctx.http(`https://data.sec.gov/submissions/CIK${padded}.json`, {
      headers: { 'User-Agent': ua, Host: 'data.sec.gov' },
    });
    if (!res.ok) throw new Error(`EDGAR HTTP ${res.status}`);
    const json = await res.json();
    const recent = (json.filings && json.filings.recent) || {};
    const forms = new Set(traits.options.forms || DEFAULT_FORMS);
    const rows = [];
    const n = (recent.accessionNumber || []).length;
    for (let i = 0; i < n; i++) {
      if (!forms.has(recent.form[i])) continue;
      rows.push({
        form: recent.form[i],
        filingDate: recent.filingDate[i],
        accession: recent.accessionNumber[i],
        primaryDoc: recent.primaryDocument[i],
        desc: recent.primaryDocDescription ? recent.primaryDocDescription[i] : '',
        cik,
      });
    }
    return rows;
  },

  map(raw, traits) {
    const accNoDash = raw.accession.replace(/-/g, '');
    const url = `https://www.sec.gov/Archives/edgar/data/${Number(raw.cik)}/${accNoDash}/${raw.primaryDoc}`;
    const company = traits.options.company || traits.name;
    return newItem({
      sourceId: traits.id,
      kind: 'sec',
      url,
      title: `${raw.form} — ${company}${raw.desc ? ` (${raw.desc})` : ''}`,
      body: '',
      publishedAt: raw.filingDate,
      topics: ['filing', raw.form],
      meta: { form: raw.form, accession: raw.accession },
    });
  },
};
