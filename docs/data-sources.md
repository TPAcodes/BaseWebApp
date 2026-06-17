# Data sources — architecture & how to add one

The ingestion layer is built around one idea: **every data source is described by
the same canonical traits**, and a *kind* supplies the defaults that an instance
customizes. Downstream stages only ever see normalized `Item`s, so adding a
source never touches ranking, summarization, or synthesis.

```
config (sources.yaml / companies.yaml / people.yaml)
        │  customizes traits
        ▼
   KIND factory ({ traitDefaults, fetch, map })   ──build──▶  DataSource
        │                                                        │ collect()
        ▼                                                        ▼
   provider (price / search / X / feed)                    normalized Item[]
                                                                 │
                                  dedupe + cluster ──▶ briefs/raw/<date>.json ──▶ (LLM stage)
```

## Canonical traits

Defined in `src/pipeline/core/traits.js`. Every source has all of these; a kind
sets defaults, a config entry overrides any of them.

| Trait | Meaning |
|---|---|
| `id` | unique identifier (required) |
| `name` | human label |
| `kind` | which factory implements fetch/map (`rss`, `arxiv`, `hackernews`, `x`, `sec`, …) |
| `category` | `ai-models` · `ai-infra` · `bio-robotics` · `equities` · `podcasts` · `general` |
| `enabled` | toggle without deleting |
| `cadence` | scheduler hint |
| `weight` | base relevance/priority (0–1) used by later ranking |
| `trustTier` | `primary` · `press` · `social` · `aggregator` (drives dedupe representative + ranking) |
| `topics` | tags stamped on every item |
| `entities` | `{tickers, orgs}` stamped on every item (how company feeds stay attributable) |
| `maxItems` | hard cap per run |
| `lookbackHours` | freshness window |
| `rateLimit` | `{perRun, minIntervalMs}` |
| `dedupeKeys` | identity fields |
| `options` | kind-specific config (`feedUrl`, `handles`, `categories`, `cik`, …) |

## Three ways to add a source

**1. New source, existing kind — edit `config/sources.yaml`:**
```yaml
- id: my-feed
  name: Some Blog
  kind: rss
  category: ai-infra
  trustTier: primary
  weight: 0.8
  options: { feedUrl: "https://example.com/feed.xml" }
```

**2. New company — edit `config/companies.yaml`.** Prices are tracked
automatically; each `publications` channel becomes a source; `secCik` adds a SEC
EDGAR source:
```yaml
- ticker: ACME
  name: Acme Corp
  sector: Semiconductors
  secCik: "0001234567"
  publications:
    - { kind: rss, category: ai-infra, feedUrl: "https://acme.com/blog/rss" }
    - { kind: x, handle: acme }
```

**3. New *kind* of source — add a factory** (`src/pipeline/sources/<kind>.js`)
exporting `{ traitDefaults, fetch, map }`, then register it in
`src/pipeline/sources/index.js`. That's the only code change — config and the
rest of the pipeline pick it up immediately. (RSS/arXiv/HN/X/SEC are all just
~30-line factories following this contract.)

Network access for a kind goes through a **pluggable provider** on `ctx`
(`fetchFeed`, `http`, `providers.price`, `providers.search`, `providers.x`) so
each kind is testable offline with mocks — see `scripts/smoke.js`.

---

## Answering the tracking questions

**Are we systematically tracking prices?** Yes. `priceTracker.js` snapshots the
**entire watchlist every run** (not only names that had news), persists a rolling
history (`data/prices/history.json` + daily snapshots), and computes `% move` and
a **volume z-score** for each name. Anything past the thresholds (default ±4% or
≥2σ volume) becomes a **mover**.

**Do we search around for company/industry news on a move?** Yes.
`movementSearch.js` takes each mover and fans out targeted queries (company
name + surge/fall, earnings/guidance, announcement verbs, and a *sector* query)
through the search provider. Results are tagged `price-move:<TICKER>`, weighted
up, and pushed into the pool so the synthesis stage is forced to explain the
catalyst — not just report the move.

**Are we systematically tracking everything those companies publish?** Two layers:
- **Declared channels** — each company's IR/blog RSS and official X account
  (best-effort; depends on the publisher offering a feed).
- **SEC EDGAR** — a guaranteed backstop for *regulated disclosures* (8-K, 10-Q,
  10-K, 6-K, 20-F, S-1, 13D, 425…). This is the systematic guarantee: a company
  can forget to blog, but it cannot skip a required filing.

Together these mean we capture the full disclosure surface for US-listed names,
plus whatever they choose to publish on their own channels.

---

## X / Twitter access (important caveat)

X is the one source with no free, public feed. The `x` kind delegates to a
pluggable provider (`src/pipeline/providers/xProvider.js`):

- **`XApiV2Provider`** — official API v2; set `X_BEARER_TOKEN`. Recommended, but
  the API is paid/tiered, so this has a real cost outside the $1/day model and
  should be budgeted separately or kept to a small handle list.
- **`NullXProvider`** — used when no token is set: logs a warning and yields
  nothing, so the pipeline runs fine before X is wired up.
- A self-hosted bridge can be dropped in by implementing the same `timeline()`.

Thought leaders live in `config/people.yaml`; a company's official account lives
under that company's `publications`.

## Environment variables

| Var | Purpose |
|---|---|
| `X_BEARER_TOKEN` | enables the X source (otherwise skipped) |
| `SEC_USER_AGENT` / `CONTACT_EMAIL` | SEC requires a contact UA on EDGAR requests |
| `APP_USER_AGENT` | UA for feed/HTTP requests |

## Downstream: synthesis & output

`briefs/raw/<date>.json` feeds the synthesis stage (`src/pipeline/synthesize.js`):

1. **Score** every item for relevance (Haiku, or the deterministic heuristic).
2. **Route** items into the six sections; X/podcast items go to *Voices*; price-move
   items are force-included.
3. **Assign citation refs** and **synthesize** the structured brief (Opus 4.8,
   adaptive thinking, cached system prompt) — output is JSON so citations are
   machine-checkable.
4. **Enforce grounding** — any claim whose `refs` don't resolve to a real deck
   item is dropped.
5. **Render** to Markdown + HTML (`render.js`) with a resolved Sources list and a
   movers table; written to `briefs/<date>.{md,html}`.

The engine is pluggable: `AnthropicEngine` (real, tiered Haiku+Opus) when
`ANTHROPIC_API_KEY` is set, else a deterministic `MockEngine` so the full
pipeline runs offline. See `docs/sample-brief.md` for example output.

## Run it

```bash
npm install
npm run brief:smoke   # offline framework test (no network/keys)
npm run brief:demo    # end-to-end synthesis on a fixture -> docs/sample-brief.{md,html}
npm run brief:run     # full pipeline: ingest -> prices -> synthesize -> briefs/<date>.{md,html}
```

`brief:run` and `brief:demo` use the real models when `ANTHROPIC_API_KEY` is set,
otherwise the mock engine (logged). Optional env: `X_BEARER_TOKEN`,
`SEC_USER_AGENT`/`CONTACT_EMAIL`, `APP_USER_AGENT`.
