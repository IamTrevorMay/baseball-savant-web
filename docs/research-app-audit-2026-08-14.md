# Research App — Data Integrity & Statistical Accuracy Audit

**Started 2026-08-14** · Scope: `docs/research-app-audit-scope.md` · Measurements: `docs/Queries.md` § 2026-08-14

**Progress: Slice A of 8 complete.** Slices B–H pending. This document grows per slice; the verdict
section is written last.

Every finding below was produced by `jo` from repo evidence plus a central measurement packet, then
**independently re-verified by the main session** — either by running the reproduction query against
production or by reading the cited code directly. Findings that failed verification are recorded as
refuted rather than deleted.

---

## Slice A — Source data completeness (`jo`)

*Question: is the raw input actually there, for every day the app will let a user select?*

### Ranked findings

| ID | Finding | Sev | Grade | Verified |
|---|---|---|---|---|
| A1 | `pitches` is missing 2026-08-12 and 08-13; Savant has both | **P0** | measured | ✅ query |
| A1b | The 2026-08-14 09:00 UTC `pitches` invocation never ran, and nothing detects an absent run | **P0** | measured | ✅ query |
| A5 | MiLB Stuff+ scoring silently failed for 08-06/07/08 — 13,702 pitches unscored | **P0** | measured | ✅ query |
| A10 | `POST /api/update/milb` writes to `milb_pitches` with **no authentication** | **P1** | measured | ✅ code |
| A2 | Any single date gets only ~2 fetch attempts, ever; nothing revisits older gaps | **P1** | measured | ✅ code |
| A3 | `checkMaterializedViews` returns `pass` *because* the data is missing | **P2** | measured | ✅ code |
| A11 | A missed ingest makes `/api/cron/refresh` skip its whole downstream and log `success` | **P2** | measured | ✅ code |
| A13 | 8 of 17 cron routes never write to `cron_runs` | **P2** | measured | ✅ code |
| A4 | `cron_runs.counts` for `milb-pitches` is structurally always `{"gameType":"R"}` | **P2** | measured | ✅ code |
| A6 | MiLB ingest cannot distinguish a league off-day from a total fetch failure | **P2** | measured | ✅ code |
| A7 | `csv.length < 100` still swallows upstream error pages; a second path at `rows.length === 0` | **P2** | measured | ✅ code |
| A8 | The unique key holding 8.88M rows together exists only in the live DB, not in the repo | **P2** | measured | ✅ query |
| A9 | No repair tool for a regular-season `pitches` gap; the one backfill script skips windows on error | **P2** | measured | ✅ code |
| A12 | Ingest freshness is queried on `/pitchers` and `/hitters`, then discarded | **P3** | measured | ✅ code |
| A14 | "Sync last 3 days" is a 4-day inclusive window | **P3** | measured | ✅ code |
| A15 | No in-batch de-duplication on the MLB ingest path | **P3** | measured | ✅ code |

### Detail on the P0s

**A1 — `pitches` is 3 days stale.** `max(game_date) = 2026-08-11`; 08-12 and 08-13 return 0 rows.
Savant holds 4,487 rows for 08-12 and 2,631 for 08-13 (measured over HTTP against the endpoint the
ingest itself calls). Sharpest at `/trends`, which anchors its "recent 14 days" window to
`MAX(game_date)` (`app/api/trends/route.ts:29,39`) — the window is silently 07-28 → 08-11, labelled
as recent, on every one of the 28 `(research)` pages that reads `pitches` by date.

*Refuted along the way:* the ingest window is **not** buggy. `game_date_gt`/`game_date_lt` are
inclusive on both ends, and the 08-13 run's window was 08-10 → 08-13, which covers 08-12. It inserted
7,237 rows = exactly 08-10 (3,001) + 08-11 (4,236), so Savant simply had no 08-12 data at 05:01 ET.
The cause is upstream lag meeting a too-narrow retry budget (**A2**), not an off-by-one.

**A1b — the 2026-08-14 invocation is missing.** Last `pitches` run in `cron_runs` is
2026-08-13 09:01, while `wbc` ran 08-14 08:31 and `integrity` 08-14 10:01. The 09:00 UTC slot did not
fire. Vercel does not retry, **and nothing in the system detects an absent run** — `/api/admin/cron-health`
reports on rows that exist, so a job that never ran is invisible. This also explains why 08-10 and
08-11 carry no `stuff_plus`: the MLB scoring path is correct and would have thrown, but it needs a run
to happen at all.

**A5 — MiLB Stuff+ is the un-fixed twin of the 2026 MLB outage.** The MLB path was repaired to one
`UPDATE` per day with failures collected and rethrown (`app/api/update/route.ts:306-352`,
`app/api/cron/pitches/route.ts:82-84`). The MiLB path still issues **one `UPDATE` across the whole
4-day window** plus a full-season aggregate, both under the 8s cap, and the caller only
`console.error`s the failure (`app/api/update/milb/route.ts:497-510`, `:385`).

Measured consequence:

| game_date | pitches | scored | % |
|---|---|---|---|
| 2026-08-05 | 4,768 | 4,768 | 100.0 |
| **2026-08-06** | **4,290** | **0** | **0.0** |
| **2026-08-07** | **4,546** | **0** | **0.0** |
| **2026-08-08** | **4,866** | **0** | **0.0** |
| 2026-08-09 | 4,417 | 4,417 | 100.0 |

2026 sits at 96.2% against 99.9–100.0% for 2023–2025. Intermittent, silent, and currently reaching
all 7 `(milb)` pages.

### The pattern behind most of Slice A

Six findings (A1b, A3, A4, A5, A6, A11) are one mechanism: **an operation fails or never happens, and
the system records success.** The strongest single piece of evidence is `cron_runs.counts` for the
last `refresh` run, which stores the failure verbatim and reports success anyway:

```json
{"leagueAverages":    {"error":"canceling statement due to statement timeout"},
 "leaguePercentiles": {"error":"canceling statement due to statement timeout"},
 "materializedViews": {"error":"canceling statement due to statement timeout"}}
```

That is the P0 refresh-chain outage caught in the act — no longer inferred from `proconfig = NULL`.

### Carry-in status

| Carry-in (from `reliability-findings-2026-08-11.md`) | Status |
|---|---|
| `csv.length < 100` swallows an upstream error page | **Still open**, plus a second silent path at `app/api/update/route.ts:136`. **Refuted as the cause of the 08-12 gap.** |
| `trackCronRun` logs success while doing nothing | **Still open**; now demonstrated on three further paths (A4, A5, A11). Fixed on the MLB `pitches` Stuff+ path only. |
| `lib/dataIntegrity.ts` cannot return `fail` | **Still open.** All 8 checks return `pass`/`warn`/`remediated`; the only `'fail'` is on promise rejection (`app/api/cron/integrity/route.ts:50`). |
| `reportError` has no sink | **Still open**, line unchanged (`lib/observability.ts:35`). |

### Corrections to our own records

- `stuff_plus_n` **does not exist** on `pitches` — `Li/metric-governance/04` says it does. Doc is wrong.
- **10 matviews, not 6** — the scope doc and findings doc both undercount.
- `players` duplicate names: **459 names / 972 rows** (previously recorded as 513).

### Handed to later slices

- **→ Slice D:** 2015–2018 `stuff_plus` coverage is ~44% while inputs are 90%+ present *and* baselines
  exist for those years (16–19 rows each, built from ~92% of the season). Neither inputs nor baselines
  explain the gap — the historical scoring backfill appears never to have completed. This sits
  directly on the 50% threshold at `lib/pitcherStats.ts:290-293` that silently swaps `stuff_rv` in
  under the "Stuff+" label.
- **→ Slice D:** three `pitch_baselines` rows have `std_velo` NULL or zero (2016, 2021, 2026).
  `NULLIF(std_velo,0)` → NULL → `COALESCE(...,0)` means those pitch types score a flat 100 on the
  velocity term rather than being excluded.
- **→ Slice E:** `refresh_league_averages` hardcodes cFIP / league ERA / league wOBA / wOBA scale /
  HR-FB with `WHEN` cases for **2015–2024 only**; 2025 and 2026 fall through to an `ELSE` branch of
  placeholder constants.

### Open, not yet run

- **O4:** `SELECT started_at, status, duration_ms, counts, error_message FROM cron_runs WHERE job='milb-pitches' AND started_at >= '2026-08-03' ORDER BY started_at` — `duration_ms` is the only surviving discriminator between a real off-day and a dropped fetch.
- **O5:** 2-day duplicate probe on the natural key. The 7-day form measures ~18.3s and will exceed the cap.
