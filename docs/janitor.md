# Janitor Cron

Daily audit of the ingest pipeline. Runs at 13:00 UTC (06:00 PT during DST,
05:00 PT under standard time). The cron is post-hoc, so the DST drift is
acceptable — it always reads "yesterday" in Pacific time when scoring volume
and re-fetching CSV, regardless of when it actually runs.

## What it checks

1. **Cron health** — looks at `cron_runs` for the last 20 hours. For each of
   `pitches`, `milb-pitches`, `roster`, `player-stats`, `wbc`: flags `Missing`,
   `Failed`, `Stuck` (>4h still running), or `Slow` (>3× the 7-day avg
   duration).
2. **Volume sanity** — counts yesterday's rows in `pitches` and `milb_pitches`,
   compares to a trailing 7-day avg (excluding yesterday). Flags <50% or >200%
   of avg. Skips the ratio if the 7-day avg is <100 (early-season noise).
3. **Silent-drop detection** — re-fetches yesterday's regular-season Savant CSV
   using the same URL shape as `app/api/update/route.ts::syncPitches`. Compares
   row count to DB. Flags any non-zero delta.
4. **Auto-fix unknown players** — for any pitcher/batter ID in the CSV that
   isn't in `players`, fetches `https://statsapi.mlb.com/api/v1/people/{id}`
   and upserts. Failed lookups are listed under "Needs Review."

The report is built as Markdown. If everything is clean and
`JANITOR_ALWAYS_REPORT` is unset, no notification is sent — only logged.

## Required env vars

- `CRON_SECRET` — same secret all crons use; the janitor enforces
  `Authorization: Bearer ${CRON_SECRET}`.

Notification channel — set **one**:

- `GITHUB_TOKEN` — PAT with `issues:write` scope on
  `IamTrevorMay/baseball-savant-web`. Issues are labeled `janitor` plus either
  `clean` or `review`. Filed issues are visible at
  https://github.com/IamTrevorMay/baseball-savant-web/issues?q=label%3Ajanitor
- `RESEND_API_KEY` + `JANITOR_NOTIFY_EMAIL` — fallback. `JANITOR_FROM_EMAIL`
  defaults to `Janitor <janitor@tritonapex.io>` (same verified Resend domain as
  the newsletter cron); override only if you switch domains.

Optional:

- `JANITOR_ALWAYS_REPORT=1` — send a report every day, even when clean. Useful
  for confirming the cron is actually running.

## One-time setup

Run `scripts/create-cron-runs.sql` against the Supabase project
(`xgzxfsqwtemlcosglhzr`). Creates the `cron_runs` table that
`lib/cronTracker.ts` writes to. Without this, the wrapped crons will log
`[cronTracker] insert failed` to Vercel logs but continue working — the
janitor's cron-health check will then report all jobs as `Missing`.

## Manual test

With the dev server running:

```bash
curl -X GET -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/janitor
```

Look for in the JSON response:

- `status`: `'clean'` or `'needs_review'`
- `report`: full Markdown body
- `channel`: `'github'`, `'email'`, or `'log-only'`

Look for in the dev/Vercel logs:

- The full Markdown report (always logged)
- `[cronTracker]` lines if `cron_runs` is missing or misconfigured
- `[janitor]` warnings if no notification channel is set or the chosen channel
  failed
