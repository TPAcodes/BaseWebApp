# Deploying the Morning Brief (GitHub Actions)

The brief runs as a scheduled GitHub Actions workflow
(`.github/workflows/morning-brief.yml`). Actions runners have open network
access, so every data source (prices, news, SEC, arXiv, feeds) is reachable —
the sandbox allowlist that blocks local web sessions does not apply here.

Each run: ingest → track prices → movement search → score → synthesize →
render → **commit the brief to `briefs/`** (archive) and **email it**.

## One-time setup

### 1. Repository **secrets** (Settings → Secrets and variables → Actions → *Secrets*)

| Secret | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | for real synthesis | Haiku scoring + Opus synthesis (omit → mock engine) |
| `SMTP_HOST` | for email | SMTP server (e.g. `smtp.gmail.com`) |
| `SMTP_PORT` | for email | `587` (STARTTLS) or `465` (TLS) |
| `SMTP_USER` / `SMTP_PASS` | for email | SMTP credentials (Gmail: an **App Password**, not your login) |
| `BRIEF_EMAIL_FROM` | for email | From address |
| `X_BEARER_TOKEN` | optional | Enables X/Twitter ingestion (paid API; omit to skip) |

### 2. Repository **variables** (same page → *Variables*)

| Variable | Example | Purpose |
|---|---|---|
| `BRIEF_EMAIL_TO` | `andersontrevorpaul@gmail.com` | Recipient |
| `CONTACT_EMAIL` | `andersontrevorpaul@gmail.com` | SEC requires a contact in the User-Agent |
| `SEC_USER_AGENT` | `morning-brief (you@example.com)` | Overrides the default SEC UA |
| `APP_USER_AGENT` | (optional) | UA for feed/HTTP requests |

Email is optional: with no SMTP secrets the run still generates and commits the
brief, just skips sending.

### 3. Schedule

Default cron is `0 11 * * 1-5` (11:00 UTC, weekdays ≈ 6–7am US Eastern). Edit the
`cron:` line to change it. **Scheduled runs only fire from the repository's
default branch**, so merge this branch to the default branch for the cron to
start. Until then, use **Actions → Morning Brief → Run workflow** to trigger it
manually from any branch.

## Verifying

1. Push/merge so the workflow is present.
2. Add the secrets/variables above.
3. **Actions → Morning Brief → Run workflow** (manual trigger).
4. Check: the job log prints the engine + estimated cost; a `brief: <date>`
   commit appears with `briefs/<date>.{md,html}`; the HTML is attached as a run
   artifact; and the email arrives if SMTP is set.

## Cost & where it runs

GitHub Actions minutes are free for this workload (one ~10-min run/day). The only
recurring cost is the Anthropic tokens (~$0.50/day est. — see
`docs/morning-brief-plan.md`), plus X API if enabled. Prefer this over a Heroku
dyno for the pipeline; keep the Express app only if you want to serve the archive.
