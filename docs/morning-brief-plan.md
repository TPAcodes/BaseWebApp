# Morning Brief — Product Plan

> A daily, personalized intelligence brief on the technology and public-markets
> ecosystem, generated automatically for **under $1/day**.

**Status:** Plan / design doc · **Author:** generated for andersontrevorpaul@gmail.com · **Date:** 2026-06-17

---

## 1. What it produces

A single brief, delivered every morning (default 06:00 local), with six sections.
The first is an editorial top-of-mind; the next five map 1:1 to the stated interests:

0. **What matters most today** — 5 ranked bullets, each linking to its section below.
1. **AI models & architecture** — new model releases, capability jumps, architecture/training changes, notable papers (arXiv `cs.LG/cs.AI/cs.CL`), evals.
2. **AI infrastructure** — chips, fabs, packaging/HBM, networking, power & datacenters, capex.
3. **AI × biology & robotics** — bio/protein/clinical AI, embodied AI, humanoid/industrial robotics, sim-to-real.
4. **Public equities (tech)** — material news & earnings for a watchlist, **ranked by share-price movement** so relevance tracks what the market actually cared about.
5. **Podcast & interview synthesis** — what was said that could be an *inflection*: a new constraint, a problem breakthrough, a contrarian or forward-looking claim. Attributed to speaker + episode + timestamp.

Every claim carries a source link. Synthesis is grounded — no statement ships without a backing item. Format: HTML email (primary) + an archived web page served by the existing Express app.

---

## 2. Why this is feasible under $1/day

The cost driver is LLM tokens, and it is fully controllable with a **tiered model strategy**:

- **Haiku 4.5** ($1/$5 per MTok) does the bulk grunt work — relevance scoring, dedup/cluster labeling, and first-pass per-item summaries.
- **Opus 4.8** ($5/$25 per MTok) runs **once**, on the final synthesis, over an already-distilled digest. Adaptive thinking on, prompt-cached system prompt.
- Everything that isn't latency-sensitive (i.e. almost everything — the brief is built at 5am) runs on the **Batch API at −50%**.
- Data is sourced from **free tiers and RSS**; podcast transcripts prefer free sources before paid ASR.

### Daily cost estimate

| Component | Approach | Volume/day | Cost/day |
|---|---|---|---|
| Bulk filter + per-item summaries | Haiku 4.5, Batch API, prompt cache | ~400K in / 40K out | **$0.30** |
| Final synthesis | Opus 4.8, Batch API, cached system prompt | ~50K in / 6K out | **$0.20** |
| Podcast transcription | Prefer published/YouTube transcripts; Groq Whisper turbo (~$0.04/audio-hr) for the rest | ~3–5 episodes | **$0.05–0.15** |
| News / papers / company news | RSS + Hacker News + arXiv + Finnhub free tier | — | **$0.00** |
| Equities prices, earnings calendar | `yahoo-finance2` / Finnhub free tier | watchlist ~40 names | **$0.00** |
| Compute / scheduling | GitHub Actions cron (free) | 1 run ~15 min | **$0.00** |
| Email delivery | Gmail (MCP) or SMTP | 1 email | **$0.00** |
| **Total** | | | **≈ $0.55–0.65/day** |

Headroom to ~$1 covers traffic spikes (a big launch day, more podcasts). **Levers if you ever exceed budget:** move synthesis to Sonnet 4.6 (cuts that line ~⅗), tighten the watchlist/feed set, cap podcasts/day, raise the relevance threshold.

> Hosting note: if you prefer to run the pipeline on the existing **Heroku** dyno instead of GitHub Actions, add ~$0.16/day for an Eco dyno. GitHub Actions is recommended (free, repo already on GitHub) — Heroku just serves the archive.

---

## 3. Architecture

A nightly scheduled job runs a 7-stage pipeline. Each stage writes to a common `Item` store so stages are independently testable and re-runnable.

```
                 ┌─────────── Collectors (parallel) ──────────┐
 cron (05:00) ─▶ │ RSS/Atom · arXiv · Equities · Podcasts      │
                 └───────────────────┬─────────────────────────┘
                                     ▼
   1. Ingest  →  2. Normalize  →  3. Dedup & cluster  →  4. Relevance score
                                     │                         │ (Haiku)
                                     ▼                         ▼
   5. Summarize clusters (Haiku) ─▶ 6. Synthesize brief (Opus) ─▶ 7. Render & deliver
                                                                   │
                                              HTML email + web archive (committed to repo)
```

### Stage detail

1. **Ingest** — pluggable collectors, each yielding raw records:
   - *RSS/Atom*: a curated, categorized feed list (`config/feeds.yaml`) — labs (OpenAI, Anthropic, Google DeepMind, Meta AI, Mistral), infra (NVIDIA, TSMC, AMD, Broadcom, semiconductor press, datacenter/power trades), bio/robotics outlets, and general tech press. Plus the Hacker News API (front-page + score filter).
   - *arXiv*: recent submissions in `cs.LG, cs.AI, cs.CL, cs.RO, q-bio.*`, deduped by title.
   - *Equities*: for a watchlist (`config/watchlist.yaml`, ~30–50 tickers), pull prior-session close, % change, and unusual-volume flag; pull the earnings calendar (today/this week); pull company news (Finnhub free `company-news`).
   - *Podcasts*: a curated show list (`config/podcasts.yaml`) — e.g. Dwarkesh, Latent Space, No Priors, BG2, Stratechery/Sharp Tech, Acquired, The Cognitive Revolution, ML Street Talk, Gradient Dissent, plus named interview YouTube channels. Read each show's RSS, detect new episodes, acquire a transcript (see §5).

2. **Normalize** — everything becomes one schema: `{id, source, type, url, published_at, title, body, topic_tags[], ticker?, price_move?, speaker?, episode?}`.

3. **Dedup & cluster** — near-duplicate detection (URL canonicalization + title/embedding similarity), then cluster items describing the same event so the brief reports each story once with multiple sources.

4. **Relevance scoring** — Haiku scores each cluster 0–1 against the **interest profile** (`config/profile.yaml`), with rule-based boosts:
   - large share-price move or unusual volume → auto-promote that ticker's cluster (and instruct synthesis to *explain the driver*);
   - first-party release from a top lab/vendor → boost;
   - earnings day for a watchlist name → boost.
   Clusters below threshold are dropped (keeps the Opus input small and cheap).

5. **Summarize clusters** — Haiku turns each surviving cluster into a compact card: *what's new / why it matters / what it could signal* (inflection, new constraint, breakthrough). Podcast transcripts are summarized into attributed claim cards (speaker, timestamp, claim, why-interesting).

6. **Synthesize** — Opus 4.8 receives the distilled card deck (already small — tens of KB) and writes the six-section brief: ranks within sections, cross-references the markets section against the AI sections, and writes the "What matters most" lede. **Grounding rule in the system prompt:** every assertion must cite a card; if evidence is thin, say so rather than embellish.

7. **Render & deliver** — render to responsive HTML (and Markdown). Deliver by email; commit `briefs/YYYY-MM-DD.md` + `.json` to the repo (free, versioned archive); the Express app serves `/brief/:date` and a latest view.

---

## 4. Relevance from price movement (the markets section)

Share-price movement is treated as a *relevance oracle*, not just a data point:

- Each watchlist name's overnight/prior-session **% move and volume z-score** are computed first.
- Names with |move| above a configurable band (e.g. ±4%, or ±2σ volume) are **auto-included** and flagged "market moved on this."
- Their news clusters are boosted, and synthesis is explicitly tasked with **identifying and explaining the catalyst** (earnings beat/miss, guidance, a product/infra announcement, a supply signal) — tying the markets section back to sections 1–3 where relevant (e.g. an HBM shortage showing up in both an infra story and a memory-maker's move).
- Quiet names with no material news are omitted, regardless of being on the watchlist.

---

## 5. Podcast synthesis (the hardest, highest-value section)

Goal: surface *inflections* — not episode recaps.

- **Transcript acquisition, cheapest-first:** (a) publisher-provided transcript, (b) YouTube auto-captions for the episode's video, (c) paid ASR fallback (Groq `whisper-large-v3-turbo`, ~$0.04/audio-hr) only when neither exists.
- **Claim extraction (Haiku):** pull statements that match inflection patterns — *a new constraint* (power, HBM/packaging capacity, data, talent, capital), *a problem breakthrough or solved bottleneck*, *forward guidance/roadmap*, *contrarian or surprising claims*. Each becomes a card with speaker, episode, timestamp link, the claim, and a one-line "why this could matter."
- **Synthesis (Opus):** dedupe across shows, rank by potential significance, and connect to the day's other signals (e.g. a guest naming a packaging bottleneck that also appears in the infra section).
- **Confidence tagging:** speculation vs. reported fact is labeled, so opinion isn't presented as data.

---

## 6. Personalization & feedback

- `config/profile.yaml` holds interests, watchlist, feed/podcast lists, thresholds, and delivery time — the single tuning surface.
- Optional lightweight feedback: 👍/👎 links in the email write back to a small store and nudge topic/source weights over time (v2).

---

## 7. Tech choices

- **Language/runtime:** Node (matches the existing Express repo). `@anthropic-ai/sdk`, `rss-parser`, `yahoo-finance2`, `fast-xml-parser`. ASR via Groq/Deepgram REST.
- **LLM:** Anthropic API. Haiku 4.5 (`claude-haiku-4-5`) for filter/summarize; Opus 4.8 (`claude-opus-4-8`) for synthesis with `thinking: {type:"adaptive"}`. **Batch API** for both. **Prompt caching** on the stable system prompts.
- **Scheduling:** GitHub Actions `schedule:` cron → runs pipeline → commits the brief → (optionally) sends email.
- **Storage:** the repo itself (briefs as committed MD/JSON). No database needed for MVP.
- **Viewer:** extend the current Express/EJS app with a brief archive route.
- **Delivery:** Gmail (via the connected Gmail integration) or SMTP.

---

## 8. Build phases

**MVP (week 1) — prove the loop, one section end-to-end**
- RSS + arXiv + HN collectors → normalize → Haiku summarize → Opus synthesize sections 0–3 → Markdown to repo + plain email. No podcasts, no equities yet.

**v1 (week 2) — full six sections**
- Add equities (prices, earnings, company news) and price-driven ranking.
- Add podcasts with transcript-preferring acquisition + claim extraction.
- HTML email + Express archive viewer. Batch API + prompt caching wired in.

**v2 (later) — refinement**
- Feedback loop & weight tuning; embeddings-based dedup; per-section "since you last read" diffing; calendar-aware scheduling (skip weekends / surface the week's earnings on Mondays) using the connected calendar.

---

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Paywalled primary sources (The Information, etc.) | Lead with free first-party (lab blogs, IR releases, arXiv, transcripts); treat paywalled as pointers only. |
| Podcast transcripts unavailable | Cheapest-first cascade; cap paid ASR minutes/day to protect budget. |
| Free API rate limits | Batch ticker calls; cache within a run; rotate providers (Finnhub/Yahoo). |
| Hallucination / unsupported claims | Hard grounding rule + every claim cites a card; confidence tags on podcast opinion. |
| Cost creep on big news days | Relevance threshold + caps on items/podcasts; Sonnet fallback for synthesis. |
| Token-count drift / model changes | Centralize model IDs and `count_tokens` baselines; Batch API keeps the ceiling low. |

---

## 10. Open questions (for you)

1. **Delivery channel** — email only, or email + the web archive (recommended)?
2. **Watchlist** — start from a default tech set (NVDA, TSMC, AMD, AVGO, MSFT, GOOGL, META, AMZN, AAPL, ASML, MU, ARM, PLTR, TSLA, …) or your own list?
3. **Hosting** — GitHub Actions (free, recommended) or the existing Heroku dyno?
4. **Tone/length** — terse executive (≈1–2 screens) or longer analyst-style?
