# Build Prompt — "Morning Brief" (hand to a fresh agent)

> Copy everything in the fenced block below into a new agent session. It is
> self-contained: the agent needs no prior context from this project.

```
ROLE
You are a senior engineer building a production-ready product from scratch in a
fresh repository. Work in two phases: (1) produce a written PLAN and get it
approved, then (2) implement it in milestones with tests. Do not start coding
until the plan is written. Prefer boring, reliable choices over clever ones.

MISSION
Build "Morning Brief": a service that generates one personalized daily
intelligence brief on the technology + public-markets world and emails it. It
runs unattended on a schedule for under $1/day.

THE BRIEF (what it outputs)
A single brief with a coverage line ("Covering <yesterday> → now") and six
sections:
  0. What matters most — 4 ranked bullets, each linking to its supporting item.
  1. AI models & architecture — releases, capability jumps, notable papers.
  2. AI infrastructure — chips, fabs, packaging/HBM, networking, power, capex.
  3. AI × biology & robotics — bio/protein/clinical AI, humanoid/industrial robotics.
  4. Public equities (tech) — material news & earnings for a watchlist, RANKED BY
     share-price movement, with the likely catalyst explained.
  5. Voices & interviews — notable claims from thought leaders / podcasts that
     could be an inflection (a new constraint, a breakthrough, forward guidance).
Every claim must link to a real fetched source. Tone: terse executive.

═══════════════════════════════════════════════════════════════════════════
HARD REQUIREMENT #1 — IT MUST RUN OUT OF THE BOX. (This is the top priority.)
The previous attempt was well-architected but nobody could get a real brief out
of it, mostly due to network/data-access friction and silent empty output.
Design so a new developer gets working output in one command, and so failures
are loud and diagnosable — never a silent empty page. Concretely, deliver:

  a) `make demo` (or `npm run demo`) → produces a FULL sample brief (HTML+MD) in
     <30s with NO API key and NO network, using built-in fixture data + a mock
     LLM engine. This is the first thing the README tells you to run.

  b) `make doctor` (or `npm run doctor`) → a preflight that PRINTS A TABLE of:
       - Node/toolchain version check
       - each configured data source: reachable? (HTTP GET, 5s timeout) OK/403/timeout
       - ANTHROPIC_API_KEY present? SMTP configured? recipient set?
     Exits 0, highlights every gap in plain language, and tells the user exactly
     what to fix. Run it before every real run.

  c) `make brief` (or `npm run brief`) → the real run. If ZERO data sources are
     reachable, DO NOT emit a cheerful empty brief — print the doctor diagnostics
     and exit non-zero with: "No sources reachable — likely blocked network
     egress. See README ▸ Running." Partial reachability is fine: skip dead
     sources, note coverage gaps in the brief.

  d) A `Dockerfile` + `docker compose up brief` path that runs the real pipeline
     identically anywhere with open internet (the supported runtime).

  e) `.env.example` documenting EVERY variable; a one-screen README quickstart
     with exactly three commands (demo → doctor → brief); sensible, committed
     default config that works with no edits.

  f) CI (GitHub Actions) that on every push runs the test suite AND `make demo`
     (proving it builds + produces output with no secrets), separate from the
     scheduled real-brief job.

Definition of "runs out of the box": a reviewer clones the repo, runs the README's
first command, and sees a rendered brief within a minute — no keys, no network,
no config. Then `doctor` tells them precisely what to set up for a live run.

═══════════════════════════════════════════════════════════════════════════
HARD REQUIREMENT #2 — NEVER FABRICATE.
The brief may only contain items actually fetched this run. If a section has no
qualifying items, show fewer/none — never invent a headline, quote, URL, or
number to fill space. Enforce this mechanically: the synthesis model returns
structured JSON whose every claim cites item id(s); drop any claim whose citation
doesn't resolve to a fetched item. An empty brief is acceptable output; a
fabricated one is a critical bug.

═══════════════════════════════════════════════════════════════════════════
DATA SOURCES — EXTENSIBLE BY DESIGN, REACHABLE BY DEFAULT

Canonical traits: model every source as the SAME descriptor so adding one is a
config entry, and adding a new KIND is one small factory. Traits (kind supplies
defaults; an instance overrides any):
  id, name, kind, category, enabled, cadence, weight, trustTier
  (primary|press|social|aggregator), topics[], entities{tickers,orgs},
  maxItems, lookbackHours, dedupeKeys[], options{...kind-specific}.
A source normalizes raw records into ONE Item schema
  {id, sourceId, kind, category, url, title, body, publishedAt, topics[],
   entities{tickers,orgs}, trustTier, weight, reason, sources[]}.
All downstream stages see only Items, so new sources never touch them.

Reachability is a first-class concern — pick sources that allow anonymous/bot
access, and abstract each network dependency behind a swappable PROVIDER with a
keyless default and at least one fallback:
  - Prices (systematic, EVERY run for the whole watchlist): keyless provider —
    e.g. Stooq CSV or the Yahoo chart JSON endpoint; compute % move + a
    volume z-score; persist rolling history. Provider-abstracted with a fallback.
  - News search on a price move (movement-driven): keyless — GDELT Doc API (JSON)
    as primary; Google News RSS as fallback. (Note: many news HOMEPAGES —
    Techmeme, Reuters, Bloomberg — return 403 to bots; use their RSS/APIs, never
    scrape the homepage.)
  - Papers: arXiv API (cs.LG/cs.AI/cs.CL, cs.RO, q-bio.*).
  - Aggregator: Hacker News Firebase API (score-filtered).
  - Company publications: a COMPANY REGISTRY (ticker → name, aliases, sector,
    IR/blog RSS, X handle, secCik). Expand each company into per-channel sources.
  - SEC EDGAR (data.sec.gov) as the GUARANTEED disclosure backstop (8-K/10-Q/
    10-K/6-K/20-F/S-1/13D). Requires a contact User-Agent.
  - Named sources to include by default: SemiAnalysis (RSS), major lab blogs
    (OpenAI/DeepMind/Google AI), IEEE Spectrum robotics.
  - X / Twitter: a `x` kind for thought leaders (Dylan Patel, Karpathy, LeCun,
    Jim Fan, etc.) AND company accounts — behind a pluggable provider that is
    OPTIONAL and OFF by default (the API is paid). No token → skip cleanly with a
    log line, never error.
`doctor` must probe every one of these and report status.

SYSTEMATIC TRACKING (answer these explicitly in the plan):
  - Prices: snapshot the ENTIRE watchlist every run, not just names with news.
  - Publications: capture everything each company publishes = declared channels
    (RSS/X, best-effort) + SEC filings (guaranteed).
  - Movement→news: for each mover, fan out company + sector queries and tag the
    results `price-move:<TICKER>`, weighted up, so synthesis explains the catalyst.

RECENCY WINDOW:
  The brief covers only "yesterday → now", computed as 00:00 of the previous
  business day in a configurable timezone (default America/New_York) through now;
  a Monday run reaches back over the weekend to Friday. Enforce the window across
  the WHOLE pool (feeds + movement search). Drop undated items by default. Show
  the window in the brief and log it. Allow a fixed rolling window override.

═══════════════════════════════════════════════════════════════════════════
PIPELINE
ingest (parallel collectors) → normalize → dedupe/cluster (collapse same story,
keep multiple sources) → enforce recency window → track prices → movement search
→ relevance score → route into the 6 sections (X/podcast → Voices; movers
force-included) → synthesize structured brief → grounding check → render MD+HTML
→ persist artifact + commit archive → deliver (email).

MODELS & COST (target < $1/day; print estimated cost every run)
  - Tiered: Haiku 4.5 (`claude-haiku-4-5`) for relevance scoring (chunked);
    Opus 4.8 (`claude-opus-4-8`) for ONE synthesis pass. Adaptive thinking on
    synthesis. Cache the system prompt.
  - Use STRUCTURED OUTPUTS for both. IMPORTANT: the parameter is
    `output_config: { format: { type: "json_schema", schema } }` — it does NOT
    accept a `name` field (that returns 400 invalid_request_error). Read tool
    input via the SDK's parsed object, never string-match serialized JSON.
  - Provide a deterministic MOCK engine (no key) so demo/tests/CI run offline;
    auto-select mock when ANTHROPIC_API_KEY is absent.
  - Offer an optional Batch API path (−50%) for the non-urgent daily run.
  - Never hardcode secrets. Read the API key only from env. If a key ever appears
    in logs or files, treat it as a bug.

DELIVERY & SCHEDULE
  - Pluggable deliverer: SMTP emailer (nodemailer) when SMTP_* + recipient set,
    else a logged no-op. Email the HTML; keep Markdown as the text part.
  - GitHub Actions scheduled workflow (weekday cron; also manual dispatch) that
    runs the real pipeline on open network, commits the brief to `briefs/<date>.*`
    as an archive, uploads it as an artifact, and emails it. Document that
    scheduled runs fire only from the default branch, and that egress must be
    open (Actions runners are). Include a Docker path as an alternative runtime.

STACK & LAYOUT
  Node ≥ 20, CommonJS or ESM (pick one, be consistent). Minimal deps
  (feed parser, yaml, mailer, Anthropic SDK). Layout roughly:
    src/core (traits, item, registry, dedupe, window, store)
    src/providers (http, feed, price, search, x — all swappable/mockable)
    src/sources (rss, arxiv, hackernews, x, sec, companyPublications)
    src/pipeline (priceTracker, movementSearch, synthesize, render, deliver, run)
    src/engine (anthropic, mock)
    config/ (companies.yaml, sources.yaml, people.yaml, profile.yaml)
    scripts/ (demo, doctor); test/; Dockerfile; .github/workflows/
  Config in YAML with committed, working defaults.

DEFINITION OF DONE (all must pass)
  1. Fresh clone → README's first command renders a full sample brief in <60s,
     no key/network.
  2. `doctor` prints a clear reachability + credentials table and exits 0.
  3. Real run with a key + open network produces a brief whose every claim links
     to a fetched source; with no reachable sources it exits non-zero with a
     diagnostic (no silent empty brief).
  4. Test suite is green and covers: trait merge/registry, dedupe/cluster, the
     recency window (incl. Monday→Friday and undated-drop), price mover
     detection, movement-query building, and grounding (unresolved citations
     dropped). Tests run offline (mock engine, fixture feeds).
  5. Adding a new source = a config entry; adding a new kind = one factory file —
     demonstrate each with a short doc.
  6. One real run's printed cost is well under $1; the cost method is documented.
  7. `docker compose up brief` runs the real pipeline.
  8. No secret is ever written to a file, log, or commit.

WORKING STYLE
  - First deliver PLAN.md: architecture, the source/trait model, provider
    choices with the reachability rationale, the out-of-the-box strategy, cost
    model with numbers, milestones, and risks. Pause for approval.
  - Then implement in milestones, each ending green: (M1) core + traits +
    registry + dedupe + window + mock engine + `demo` + tests; (M2) real
    providers + price tracking + movement search + doctor; (M3) synthesis +
    render + grounding; (M4) delivery + Docker + Actions + docs.
  - Commit per milestone. Keep the README quickstart accurate at every step.

PITFALLS TO AVOID (learned the hard way)
  - Assuming network access. Verify it (doctor); make the container/CI the
    supported runtime; degrade loudly, never silently empty.
  - Bot-blocked sources (news homepages 403). Use RSS/APIs, not scraping.
  - `output_config.format.name` → 400. Omit it.
  - Undated items polluting a "yesterday" brief. Drop them.
  - Treating the mock demo as proof of live capability. It is not — gate real
    output behind doctor + a real fetch.
  - Leaking the API key into logs/files/commits.
```
