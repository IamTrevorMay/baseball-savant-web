---
title: External API Ingestion — Depending on Providers You Do Not Control
domain: data-reliability
tags:
  - external-apis
  - rate-limiting
  - retries-backoff
  - circuit-breaker
  - contract-drift
  - restatement
  - defensive-parsing
  - baseball-savant
sources_reviewed: 24
last_updated: 2026-08-11
---

# External API Ingestion — Depending on Providers You Do Not Control

## TL;DR

- **Triton's data supply is two undocumented, unversioned MLBAM endpoints.** 91 call sites across 50 files hit `baseballsavant.mlb.com` or `statsapi.mlb.com`. No published rate limit, changelog, SLA, or schema — the community reference calls them *"not officially supported"* and liable to *"change without notice."* (measured + documented)
- **Exactly one of those 91 call sites retries** — `app/api/pitch-video/route.ts:95`: 3 attempts, linear 300/600 ms backoff, no jitter, no `Retry-After`. Everything else, including the nightly ingest at `update:82`, is a single unretried `fetch`. AWS measured full jitter — `random(0, min(cap, base·2^n))` — as cutting call count "by more than half." (measured + documented)
- **Savant silently truncates large queries and Triton can't tell.** Community sources give the cap as 25,000, 30,000, and ~40,000 rows — three numbers, zero documentation. The defense isn't knowing it; it's alarming when a count lands *exactly* on a round cap, as `sabRmetrics` does. (documented + folklore)
- **The 3-day overlap window (`cron/pitches:37-38`) is both Triton's best defense against provider lateness and its blind spot for restatement.** A late Savant upload self-heals on one of the next two nights with no retry logic at all (`05-orchestration-scheduling.md` §4) — but Petti reloads by `game_year` because *"BaseballSavant will often times update data from previous seasons,"* and Triton re-reads only 3 days, so **every revision older than 72 hours is invisible forever.** (measured + documented)
- **MLBAM restatement is undisclosed and semantic.** April 2017: reported velocity silently moved from *at 50 ft* to *out of hand* (~54.5 ft), announced only afterward, prior seasons not restated — a permanent break in `release_speed`. (documented)
- **Contract drift breaks Triton in a way that returns HTTP 200.** A new Savant column makes PostgREST reject every batch, the per-row fallback fails every row, `inserted` lands at 0, Stuff+ is skipped as "no rows inserted," and `trackCronRun` records success — the 2026 outage's shape by another road. Swallowed upstream errors already sit at `update:55` and `cron/player-stats:72`. (measured + inferred)
- **Legally: defensible on access, exposed on use.** Savant's `robots.txt` permits everything with no crawl-delay, and *hiQ* (9th Cir. 2022) holds public-page scraping likely isn't CFAA "unauthorized access." But MLBAM's terms allow *"Only individual, non-commercial, non-bulk use."* (documented)
- **The right posture toward an unversioned upstream is assertion, not trust or distrust.** A schema hash, a truncation floor, and a monthly re-fetch-and-diff are ~60 lines and catch every failure mode below. (inferred)

---

## 1. The two providers, and what Triton asks of them

Measured 2026-08-11 by grep excluding `node_modules`: **91 call sites in 50 files.**

| Provider | Endpoint | Used by | Shape |
|---|---|---|---|
| Savant | `/statcast_search/csv` | `update:81`, `lib/savantCsv.ts` | CSV, ~35-param query string |
| Savant | `/gf?game_pk=`, `/sporty-videos?playId=` | `backfill-pitch-videos:58`, `pitch-video:80` | JSON/game; HTML scraped by regex |
| Stats API | `people?personIds=`, schedule, boxscore, roster, standings | `update:50`, `cron/player-stats:69,116`, `cron/roster` | JSON, 50 IDs/call |

The Stats API needs no auth, enforces no CORS, publishes **"No official limits… implement caching and backoff in your applications"**, and stamps responses with a copyright notice pointing at `gdx.mlb.com`. No portal, no versioning policy, no deprecation window — Savant publishes less still. **This is not an API integration; it is a dependency on a private system that happens to answer HTTP.**

---

## 2. Rate limits, politeness, and the ethics of scraping-adjacent endpoints

| Claim | Source | Grade |
|---|---|---|
| "limits queries to 30000 rows each" | pybaseball `docs/statcast.md` | documented (third party) |
| "limits queries to 25,000 rows" | `sabRmetrics::download_baseballsavant` | documented (third party) |
| "about 40,000 rows, or one week of games" | Petti, *Build a Statcast Database v2.0* | documented (third party) |
| A per-IP request-rate limit exists | — | **folklore.** No source states one. |

Three practitioners, three different caps. That disagreement *is* the finding: the limit is undocumented, has probably changed, and must be **detected rather than assumed**.

**pybaseball** splits ranges >5 days into 1-day chunks in a `ThreadPoolExecutor` — parallel, no sleep, no rate-limit handling. **sabRmetrics** loops five days at a time, sequentially. **Triton** issues one 3-day request per game type per night — 1–2 requests for the whole ingest, politest by an order of magnitude, and a consequence of the window design rather than of care. Its one crawler, `backfill-pitch-videos.ts:153`, sleeps a fixed 500 ms between game feeds: no jitter, no slowdown on 429.

**Jo's rule for an unpublished limit:** pick a budget you can defend out loud — "≤2 req/s, one connection, back off on any 429/503" — then implement and log it.

### 2.1 The legal and ethical footing

Savant's `robots.txt` is `User-agent: *` with an empty `Disallow:` — every path permitted, no `Crawl-delay`, no directive violated. Access law leans permissive: *hiQ v. LinkedIn* (9th Cir., 18 Apr 2022) held that automated capture from public pages not requiring an account likely isn't access "without authorization" under the CFAA. Use terms don't: MLBAM permits **"Only individual, non-commercial, non-bulk use of the Materials"**, and Triton's ingest is bulk and commercially adjacent. *hiQ* also didn't end at the CFAA — in November 2022 the court found it had **breached LinkedIn's user agreement**, and it settled by ceasing scraping. **Contract is the live theory, and the practical risk is being blocked with no notice and no recourse.** Identify with a real `User-Agent` and contact address rather than nothing or `'Mozilla/5.0'` (`backfill-pitch-videos:60`).

---

## 3. Timeouts, retries, backoff, and failing fast

### 3.1 Timeouts are set, but they are not budgets

Every external fetch carries an `AbortSignal.timeout(...)` — better than most codebases: 120,000 ms at `update:82`, 15,000 ms × N batches at `cron/player-stats:69,116`, 8,000 ms per attempt at `pitch-video:99`. **But per-call timeouts don't bound a job:** `cron/player-stats` can issue 20 batches at 15s each and blow the documented Vercel limit (default and Hobby max both **300s**) with no single call misbehaving, and a killed invocation produces no error, no `catch`, no failed run (`11-serverless-cron-reliability.md`). **Aborting is also not rollback** — undici has no default request timeout, and its connect timeout defaults to 10s outside `AbortSignal.timeout`'s control. Set timeouts near the provider's p99, not your ceiling: a 3-day CSV returns in seconds, so 120s lets a hung socket burn 40% of the budget.

### 3.2 Retry: the shape to copy

The one retry helper (`pitch-video:95-111`) is honest about why it exists — MLB's endpoints "intermittently hang or return a transient 5xx/429." It lacks three things. **Jitter:** full jitter beat plain exponential decisively in AWS's simulation, while equal jitter "does slightly more work than Full Jitter, and takes much longer." **`Retry-After`:** per MDN it "indicates how long the user agent should wait before making a follow-up request," accompanies 429/503/301, and takes `<http-date>` or `<delay-seconds>` — obeying beats guessing. **A budget:** Google SRE caps retries at **3 attempts per request** and **10% of requests** per client; above that you amplify an outage rather than survive it. Retry only idempotent calls — Triton's are all GETs, which stops being free the moment a POST appears. The helper is fifteen lines; **writing it is easy, and deleting the 90 bare `fetch` calls is the work.**

**A circuit breaker is the wrong tool here.** Fowler's pattern exists because "many callers on an unresponsive supplier" exhaust resources and cascade; Triton is one client with no pool to exhaust. Take the two halves that transfer: after 3 upstream failures abort the job rather than attempting the remaining 19 batches (`cron/player-stats` does the opposite — `if (!resp.ok) continue`, twenty more times), and record it, because **"any change in breaker state should be logged."**

---

## 4. Pagination, truncation, and defensive parsing

Savant's CSV endpoint has no cursor. Its "pagination" is **you choosing a date range small enough not to hit an undocumented row cap** — the worst possible interface, because overflow is silent: valid CSV, missing rows, HTTP 200. Slack's pagination post names the general hazard: over a mutating dataset, window paging means "the same results from the first page may be seen," or rows are skipped.

**Triton's exposure, measured:** 3 days × ~4,000 pitches/day ≈ **~12,000 rows** against a cap somewhere in 25,000–40,000 — ~2× headroom. Fine tonight; not fine for a manual `POST /api/update` with a wide range, a season backfill, or a wider window. `sabRmetrics` ships the detector: *"If any of the queries returns exactly 25,000 rows, this indicates that the user probably has not gotten all of the expected data, so this function throws a warning."*

Assert it: `if ([25_000, 30_000, 40_000].includes(rows.length)) throw new Error('likely truncated')`.

The parser itself gets a lot right — RFC 4180 quoted fields, BOM strip, `Unnamed*` removal, per-row batch isolation (`update:157-168`). The gaps are in how *"not what I expected"* is classified:

| Behavior | Failure mode |
|---|---|
| `if (csv.length < 100) return { fetched: 0, … }` (`update:87`) | Error body returns **success with zero rows** — an off-day and an outage look identical |
| `if (vals.length < numHeaders) continue` (`update:125`) | A CSV truncated mid-line **silently loses its final row** |
| Header set from the response verbatim (`update:117`) | New upstream column ⇒ every upsert batch rejected (§5) |
| `catch { … }` / `if (!resp.ok) continue` (`update:55`, `cron/player-stats:72`) | Up to 50 players dropped per failed batch |

**The highest-value change is distinguishing "the provider had nothing" from "we got nothing."** Triton maps both to `{ fetched: 0, inserted: 0 }` and a 200, and `update:84` discards the status code so 429, 500, and 403 alert identically. For JSON, validate at the boundary instead of optional-chaining through it — `cron/player-stats:76` chains four levels then `continue`s, indistinguishable from "no stats." A `safeParse` makes "the shape changed" countable and alertable.

---

## 5. Contract drift — the change that arrives without a changelog

On 2018-04-03 the endpoint changed overnight: pybaseball began throwing `could not convert string to float: 'Sinker'` alongside `Error: Query Timeout`. That is the normal case, not the exception:

| Date | Change | Effect |
|---|---|---|
| 2017-04-05 | Velocity switched from *at 50 ft* to *out of hand* (~54.5 ft), disclosed only afterward | Semantic break in `release_speed` at the 2016/2017 boundary |
| 2017-04-24 | CSV export **60 → 75 variables**: `start_speed`→`release_speed`, `px`/`pz`→`plate_x`/`plate_z`, `spin_rate`→`spin_rate_deprecated`, **`pitch_id` removed** | Every parser broke; pitch sequencing un-reconstructable |
| 2020 Opening Day | Hawk-Eye replaced the radar/camera hybrid; it now **"directly measure[s] both pitch spin rate and spin axis rather than inferring"** | Distributions shift at the 2019/2020 boundary for non-baseball reasons |

**How this breaks Triton, and why it returns 200.** Savant adds column `foo_bar`; `headers` (`update:117`) picks it up and every row carries it into `upsert(batch)`; PostgREST rejects the batch (`column "foo_bar" ... does not exist`); line 159 falls back to per-row upserts and **all 500 fail**, because it is a schema error rather than a bad row; `inserted` = 0, so line 181's `if (inserted > 0)` skips Stuff+ and leaves `stuffResult.ok` true; the cron sees no failure and **returns 200 with a successful `trackCronRun`**, while `errors = rows.length` is thrown away.

**Detections, cheapest first:**

1. **Assert `errors === 0` and `inserted > 0` on an in-season date.** Two lines; `syncPitches` already counts both, and the cron already picks game types by month, so a regular-season night with zero rows is assertable.
2. **Schema hash.** Store `sha256(sorted(headers))` in `system_metadata`; fail the run on change. It would have fired on 2017-04-24 before anything broke, and it catches *removals* — which the upsert path ignores entirely, a dropped column simply becoming NULL forever (`03-volume-completeness-monitoring.md` is the backstop).
3. **Quarantine, don't discard.** Rows failing validation belong in a `pitches_rejected` table with the raw payload and error, not a `console.error` (`data-quality/09-schema-evolution-contracts.md`).

---

## 6. Upstream restatement, and the caching that makes it visible

**The provider changes history** — not the schema, the values, for games already played. Petti's `delete_and_upload` wipes every record for a `game_year` before appending, because **"BaseballSavant will often times update data from previous seasons."** Savant's note says classifications *"may change as data gets reviewed in the future"* — classification is per-pitcher and learned (**"MLBAM uses an algorithm called a neural network"**), and models get retrained.

Now `cron/pitches:37-38`: `const start = addDaysToYmd(today, -3)`. Every night, forever, three days. The upsert on `(game_pk, at_bat_number, pitch_number)` absorbs restatement *inside* that window automatically. But:

> **Any value Savant revises more than 72 hours after the game is never seen.** `pitches` is a snapshot of what MLBAM believed within 3 days of first pitch.

The second-order damage is worse than a stale column: `pitch_name` joins to `pitch_baselines` (`update:328-330`), so a reclassified pitch keeps its **old** class forever, scored against the wrong baseline — itself built from Triton's stale copy. Reconciliation against Savant then disagrees, and the gap gets blamed on Triton's formula rather than on divergent inputs (`data-quality/06-reconciliation-source-of-truth.md`).

**Grade this carefully.** That MLBAM restates is *documented*; that it is *material for Triton's metrics* is **inferred** — Jo has not measured it. Hence recommendation #1: re-fetch three completed game dates from a prior season, diff against `pitches` on the natural key, report per-column change rates for `pitch_type`, `pitch_name`, `release_speed`, `estimated_woba_using_speedangle`. Under 0.1% and it's a footnote; if `pitch_name` moves on 2%, the Stuff+ history is wrong by a measurable amount.

**If it does:** re-sync backward, one prior date per nightly run, on the existing idempotent upsert path. Do **not** copy Petti's delete-and-reload-by-year onto `pitches` — ~700k deletes against 29 indexes is a bloat event that would also discard Triton's derived columns.

**Caching makes this cheap.** Store **the raw upstream body**, keyed by `(date_range, game_type, fetched_at)`: reproducibility ("here is the exact CSV Savant returned at 09:00 UTC" — an artifact that exists nowhere today), free restatement diffing, re-parsing without re-fetch. Conditional requests (`If-None-Match`/`ETag` → **304 Not Modified**) skip unchanged bodies, but **verify before relying on them**: Jo has not confirmed Savant emits usable validators, and a *weak* one is wrong here — weak validation "considers two versions of the document as identical if the content is equivalent."

---

## 7. What Triton should do, in order

1. **Measure the restatement rate** (§6). Everything there is *inferred* until this runs, and it decides whether #5 and #6 are worth building. Log the queries to `docs/Queries.md`. **Highest-leverage next action.**
2. **Assert on the ingest's own counters.** `syncPitches` computes `errors` and `inserted` and discards both — fail the run when `errors > 0` or `inserted === 0` on a range that contained games. ~10 lines; closes the §5 hole.
3. **Add a truncation detector** (exact-cap row counts) and a **schema-hash guard** on the CSV headers.
4. **Land `fetchWithBackoff` in `lib/`,** migrating `cron/pitches`, `cron/player-stats`, `cron/roster`, `cron/briefs` first, and replace the two silent swallows (`update:55`, `cron/player-stats:72`) with counters reaching `trackCronRun`.
5. **Store the raw upstream artifact** per nightly Savant fetch in Supabase Storage — cheap, making #1 and #6 nearly free thereafter.
6. **Only if #1 shows drift:** the backward-walking re-sync from §6, chunked, with VACUUM discipline.
7. **Write the dependency down in `planning.md`** — two hosts, 91 call sites, unpublished limits, no fallback. A known single point of failure is manageable; an unexamined one is not.

**Anti-recommendation — do not parallelize the Statcast ingest into 1-day chunks the way pybaseball does.** It is wrong on three counts: the 3-day window already finishes well inside `maxDuration`, so there is no latency problem to solve; parallel unthrottled requests are what gets an unauthenticated client throttled by a provider whose limits are unpublished; and it trades Triton's best negotiating position — conspicuous politeness — for a speedup nobody asked for. **Optimize the ingest for not getting cut off, not for finishing 40 seconds sooner.**

**Second anti-recommendation — do not build a Hystrix-style circuit breaker.** At ~2 requests/night there is no cascade to prevent (§3.2): take the logging, skip the state machine.

---

## Sources

1. MLBAM — [Copyright notice](http://gdx.mlb.com/components/copyright.txt) — non-commercial, non-bulk terms.
2. pseudo-r — [Public MLB API docs](https://github.com/pseudo-r/Public-MLB-API) — "No official limits published."
3. MLB — [Stats API reference](https://docs.statsapi.mlb.com/reference) — no terms or changelog.
4. Savant — [robots.txt](https://baseballsavant.mlb.com/robots.txt) — empty `Disallow:`, no `Crawl-delay`.
5. jldbc — [pybaseball statcast docs](https://github.com/jldbc/pybaseball/blob/master/docs/statcast.md) — 30,000-row claim.
6. jldbc — [pybaseball `statcast.py`](https://github.com/jldbc/pybaseball/blob/master/pybaseball/statcast.py) — 1-day chunks, no sleep.
7. saberpowers — [`download_baseballsavant`](https://saberpowers.com/sabRmetrics/reference/download_baseballsavant.html) — 25,000-row cap; exact-cap warning.
8. Bill Petti — [Statcast Database v2.0](https://billpetti.github.io/2020-05-26-build-statcast-database-rstats-version-2.0/) — the restatement quote.
9. pybaseball — [Issue #20](https://github.com/jldbc/pybaseball/issues/20) — the 2018 break.
10. Petti / THT — [New Statcast Export Format](https://tht.fangraphs.com/research-notebook-new-format-for-statcast-data-export-at-baseball-savant/) — the 2017-04-24 schema change.
11. Tom Tango — [New velocity measurement](https://tangotiger.com/index.php/site/comments/pitch-velocity-new-measurement-process-new-data-points) — the 2017 semantics change.
12. Baseball Prospectus — [Pitch Classification](https://www.baseballprospectus.com/news/article/53712/baseball-proguestus-a-potential-alternative-for-public-pitch-classification/) — per-pitcher neural nets.
13. MLB Tech Blog — [Statcast 2020](https://technology.mlblogs.com/introducing-statcast-2020-hawk-eye-and-google-cloud-a5f5c20321b8) — Hawk-Eye; direct spin.
14. AWS — [Backoff and Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/) — jitter formulas.
15. Google SRE — [Handling Overload](https://sre.google/sre-book/handling-overload/) — 3 attempts; 10% budget.
16. Fowler — [CircuitBreaker](https://martinfowler.com/bliki/CircuitBreaker.html) — states; log state changes.
17. MDN — [Retry-After](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Retry-After) — 503/429/301.
18. MDN — [429](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/429) — RFC 6585 §4.
19. MDN — [Conditional requests](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Conditional_requests) — ETag/304; weak validators.
20. Slack — [Evolving API Pagination](https://slack.engineering/evolving-api-pagination-at-slack/) — window paging skips rows.
21. Vercel — [Function duration](https://vercel.com/docs/functions/configuring-functions/duration) — Hobby max 300s.
22. undici — [Issue #4215](https://github.com/nodejs/undici/issues/4215) — 10s `connectTimeout`.
23. loke.dev — [fetch timeouts](https://loke.dev/blog/node-fetch-timeout-connection-leak/) — aborting is not closing.
24. Jenner & Block — [hiQ v. LinkedIn](https://www.jenner.com/en/news-insights/publications/client-alert-data-scraping-in-hiq-v-linkedin-the-ninth-circuit-reaffirms-narrow-interpretation-of-cfaa) — 2022 CFAA ruling; contract outcome in the [case summary](https://en.wikipedia.org/wiki/HiQ_Labs_v._LinkedIn).

**Triton-internal evidence (measured 2026-08-11):** 91 call sites across 50 files via `grep -rn --include="*.ts" -e statsapi.mlb.com -e baseballsavant.mlb.com`; retry/timeout/parsing inventory from `app/api/update/route.ts:50-90,117-172,306-352`, `app/api/cron/pitches/route.ts:36-86`, `app/api/cron/player-stats/route.ts:62-107`, `app/api/pitch-video/route.ts:88-111`, `scripts/backfill-pitch-videos.ts:57-75,150-154`. Siblings: `01-pipeline-observability-fundamentals.md`, `03-volume-completeness-monitoring.md`, `05-orchestration-scheduling.md` §4, `11-serverless-cron-reliability.md`.
