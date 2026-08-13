---
title: Late-Arriving Data — Whether Yesterday's Number Is Still Defensible Today
domain: temporal-modeling
tags:
  - late-arriving-data
  - watermarks
  - grace-windows
  - restatement
  - transaction-time
  - savant-resync
  - downstream-invalidation
sources_reviewed: 17
last_updated: 2026-08-12
---

# Late-Arriving Data — Whether Yesterday's Number Is Still Defensible Today

> Grades: **(established)** published/replicated; **(computed)** from Triton source at the cited line
> or the 2026-08-12 measurement packet, read not queried; **(estimated)** from theory.
>
> **Scope.** Li owns what late arrival does to a number's *correctness and comparability*.
> Retries, freshness alerts, and provider SLAs are Jo's
> (`Jo/data-reliability/02-data-freshness-slos.md`, `Jo/data-reliability/09-external-api-ingestion.md`).
> Rewriting history once you've decided to is `temporal-modeling/09-retroactive-restatement.md`.

## TL;DR

- **`pitches` and `milb_pitches` carry no arrival timestamp, so lateness is unfalsifiable after the fact.** No `created_at`, `updated_at`, or version: a row three days late is indistinguishable from one on time. Lateness is measurable only on the facility path (`compete_pitches.created_at`) — the one nobody worries about. **(computed)**
- **The "3-day Savant re-sync" is a request window of four calendar dates and exactly three post-game looks.** The run on a game's own date fires at 05:00 ET, before its games; the last look at G is ~55–64 h after first pitch — not 72, not the 96 four dates imply. **(computed)**
- **Ordinary publication lag already spends two of those looks.** On 2026-08-12 `pitches` reached 2026-08-10, `milb_pitches` 2026-08-11, on identical windows and cron times — slack for genuine lateness is ≈1 look. **(computed)**
- **The grace window is also a re-scoring window, and nobody designed it that way.** The Stuff+ UPDATE has no `stuff_plus IS NULL` guard, so every night re-scores the whole ingested span; a row's surviving baseline vintage is `game_date + 3`. That accidentally removes within-window jitter, but `mode=repair` backfills use the opposite predicate, so the column mixes both regimes. **(computed)**
- **Late arrival, provider restatement, and internal correction are three events with three obligations; Triton treats all three as a silent overwrite** — `ignoreDuplicates: false`, no diff, no log. **(computed)**
- **Nothing outside the window is ever fetched, so a Savant revision to a closed date is invisible forever** — `pitches` freezes what MLBAM believed within ~60 h of first pitch, and Statcast demonstrably restates prior seasons. **(established / computed)**
- **The volume signal that would detect lateness is broken by construction.** `inserted += batch.length` counts no-op upserts, so `totalInserted` is ~12k every in-season night regardless; Triton counts genuinely new rows nowhere. **(computed)**
- **Every published artifact is built from inside the provisional zone** — daily-cards runs 60 minutes after ingest, on game dates with looks outstanding, and never re-renders. **(computed)**
- **The fix is one row in `system_metadata`, not a migration:** a published completeness watermark turns "is this number final?" from unanswerable into a comparison. **(estimated)**

---

## 1. What "late" means when the row has no arrival time

**Valid time** is when the fact was true — `game_date`; **transaction time** is when the database learned it. Late arrival is the gap; a restatement is a *second* transaction-time entry for one valid time. Triton keeps the first everywhere, the second almost nowhere:

| Table | Transaction time | Lateness measurable? |
|---|---|---|
| `pitches` (~8.88M rows, 9,711 MB, 2015-03-03→) | **none** | no |
| `milb_pitches` (~2.51M rows, 2,366 MB, 2023-03-31→) | **none** | no |
| `pitch_baselines` (206 rows) | **none** | no — a rebaseline leaves no trace |
| `league_averages` (1,806) / `player_season_stats` (~79,061) / `cron_runs` | `updated_at`, `started_at` | run grain only |
| `compete_pitches` (443) / `compete_pitch_sessions` | `created_at` / `uploaded_at` | **yes** |

Where Triton controls ingestion it records arrival; where it depends on a third party — the path where lateness is an actual risk — it records nothing; `last_analyze`/`last_autoanalyze` are NULL everywhere, so Postgres' incidental timestamps are no proxy. A measurement defect: "was this leaderboard computed before the missing games landed?" answers *unknown*, and an unmeasurable error term can be neither bounded nor excluded from an interval (`statistical-inference/04-uncertainty-quantification.md`). **(computed)**

---

## 2. Triton's real grace window, corrected

The manifest, context doc, and source comment all say "3 days." What runs:

| Element | Value | Source |
|---|---|---|
| Requested window | `[today − 3, today]` — **four** calendar dates | `app/api/cron/pitches/route.ts:36-38` |
| `today` | ET calendar date, not UTC | `lib/dateTz.ts:10-18` |
| Cron time | `0 9 * * *` UTC = 05:00 ET | `vercel.json` |
| Savant params | `game_date_gt`/`game_date_lt` | `app/api/update/route.ts:72` |

A game on date **G** falls in the window for runs on G, G+1, G+2, G+3. The run *on* G fires before any of that day's games and contributes nothing, leaving **three post-game looks**, the last at 05:00 ET on G+3: ~63.8 h after a 13:10 ET first pitch, ~57.8 h after 19:10 ET, ~54.8 h after a 22:10 ET west-coast start. §6d of `docs/reliability-findings-2026-08-11.md` says "72 hours"; correctly, **Triton sees any Savant revision published within ~55–64 hours of first pitch, and none after.**

**Normal lag eats the window.** On 2026-08-12, same clock and window (MiLB mirrors it exactly), `pitches` reached 2026-08-10 and `milb_pitches` 2026-08-11 — MLB's trailing edge two days behind the observation date. If typical, the first two of three looks land before Savant has published G at all, leaving ≈1 look of margin. Monitoring is `Jo/data-reliability/03-volume-completeness-monitoring.md`; it is Li's problem the moment a season number includes the trailing edge.

---

## 3. The grace window is also a re-scoring window

The span actually scored is `min…max` of *ingested* `game_date`, not the request window (`app/api/update/route.ts:189-193`) — correct, but it lets the provider set the width. Within it `applyStuffPlusForDateRange` issues one UPDATE per day predicated only on `p.game_date` and `release_speed IS NOT NULL` — **no `stuff_plus IS NULL` guard** (`:318-333`). Every pitch is re-scored every night it stays in span.

| Night | Pitch on game date G | Baseline used |
|---|---|---|
| G+1 | inserted, scored | built 09:10 UTC on G |
| G+2 | re-upserted, **re-scored** | built 09:10 UTC on G+1 |
| G+3 | re-upserted, **re-scored — final** | built 09:10 UTC on G+2 |

1. **A row's Stuff+ vintage is `game_date + 3`.** Scoring (09:00) precedes the baseline rebuild (09:10), so the surviving value used a baseline whose as-of date is G+2 — reconstructing "which baseline scored this row?" means offsetting three days, not zero. **(computed)**
2. **It makes the last three game dates structurally provisional.** Any `stuff_plus` read for `game_date > today − 4` is a value still being rewritten, and nothing in the API, glossary, or UI says so.

**What it does not fix.** April rows are still z-scored against a three-week population, August rows against a five-month one — and `mode=repair` touched only `stuff_plus IS NULL`, leaving ≈249k Apr–Aug rows on one 2026-08-11 vintage while neighbours kept theirs. **Late-arrival and backfill re-scoring use opposite predicates, and the column now mixes both regimes** (`metric-governance/02-metric-versioning-reproducibility.md` §3).

---

## 4. Late arrival vs restatement vs correction

Financial reporting separates a scheduled *revision* from a *restatement*; Triton collapses all three into one `ON CONFLICT DO UPDATE`.

| | **Late arrival** | **Provider restatement** | **Internal correction** |
|---|---|---|---|
| What moved | a row appears that should have been there | an existing row's value changes upstream | our code was wrong; the input never moved |
| Example | suspended game resumed on G+2 | `pitch_type` reclassified; velocity re-referenced to release | the 8s-timeout Stuff+ gap |
| Detected? | only inside ~60 h, only as a row count | **no** | only if a monitor exists |
| Obligation | recompute; usually no announcement | announce — the population changed | announce and rescore; the old value was never defensible |
| Artifact | grace window + watermark | vintage archive / bitemporal row | changelog + rescore ledger |

**The `pitch_name` case deserves its own line.** Savant re-applied a modern classifier to history — `ST` (sweeper) and `SV` (slurve) both show `MIN(game_year) = 2015` in `pitches`, classifications that did not exist then. Since Stuff+ joins baselines on `(pitch_name, game_year)`, a reclassified pitch **changes which population normalizes it**: a definitional change in the costume of a data update, arriving through the ingest pipe (`metric-governance/08-cross-level-comparability.md`). **Li's test:** a row appearing changes *n*; a value changing changes the *estimate*; a row's **class** changing changes the denominator's *membership*, and only the third forces re-examining every comparison drawn from that column.

---

## 5. Downstream invalidation: what actually recomputes

| Consumer | Recomputes on late arrival? | Where |
|---|---|---|
| `pitches.stuff_plus` | **yes**, whole ingested span | `app/api/update/route.ts:318-333` |
| `pitch_baselines`, `league_averages` | yes, **current season only** | `app/api/cron/refresh/route.ts:59` |
| matviews, `queryCache` | yes, on any non-zero ingest | `app/api/update/route.ts:182-183` |
| `player_season_stats` | yes — from the MLB API, not `pitches` | `player-stats/route.ts:39-57` |
| `pitcher_season_command` / `_deception` | current season, gated on `skipDownstream` | `refresh/route.ts:47-49` |
| **Prior seasons, anything** | **no** — every refresh is `[year]`-scoped | — |
| `daily_cards`, newsletter, overlays | **no** — published, then frozen | separate crons |

**(a) Healing is season-scoped**, so a 2019 backfill would leave `pitch_baselines`, `league_averages`, and the command/deception tables describing a population that no longer matches `pitches`. **(b) The efficiency gate can essentially never fire.** `skipDownstream = totalInserted === 0`, but `inserted += batch.length` counts no-op upserts (`:154`) and ~8k of each night's ~12k rows already exist. Operationally benign — downstream always runs; diagnostically severe: with no new-row count, the natural late-arrival signal — a spike in new rows for an old date — does not exist as data.

**(c) Published artifacts come from the provisional zone by construction.** Daily-cards at 10:00 UTC (60 min after ingest), graphics 12:30, briefs 14:00, emails 15:00 — all reading game dates with looks outstanding, none re-rendering. A card published on G+1 disagrees with the database by G+3 whenever anything moved, and the card is what the audience keeps.

---

## 6. Detecting lateness you never recorded

History is unrecoverable; measurement can start tomorrow. **For a human; log results to `docs/Queries.md`.**

**6.1 Commit timestamps (forward-only, no schema change).** If `SHOW track_commit_timestamp` is on, `min/max(pg_xact_commit_timestamp(xmin))` by `game_date` is a real arrival clock, no column added. Two caveats: it is **not retained past transaction-ID freezing**, a rolling window, not an archive; and since the ingest re-upserts unchanged rows nightly, `xmin` records the last *touch*, reading ≈G+3 almost universally — a good anomaly detector, a poor lateness meter.

**6.2 Re-fetch and diff — the only test for restatement.** Re-request three dates from a **closed prior season** through the same Savant path into a staging table, then diff.

```sql
-- Staging table only. Never overwrite pitches with this.
SELECT count(*) AS matched,
       avg((s.pitch_name    IS DISTINCT FROM p.pitch_name)::int)    AS pitch_name_chg,
       avg((s.release_speed IS DISTINCT FROM p.release_speed)::int) AS velo_chg
FROM pitches_restatement_probe s
JOIN pitches p USING (game_pk, at_bat_number, pitch_number);
```

**Decision rule, committed in advance so results cannot be rationalized:** `pitch_name_chg` < 0.1% ⇒ a footnote in `docs/VARIABLES.md`. 0.1–1% ⇒ caveat cross-season comparisons. > 1% ⇒ closed-season `stuff_plus` is scored against the wrong baseline row often enough that a re-pull-and-rescore is the honest response, and cross-season Stuff+ trends come down until it happens. Count unmatched staging rows separately: a restated row *count* is a different failure from a restated *value*.

---

## 7. Watermarks, and when an old number is still defensible

A **watermark** promises completeness: all data with valid time ≤ W has arrived. Beam, Flink, and Spark pair one with a bounded allowed-lateness. Triton has the allowed lateness but not the promise — the half consumers need. One row in an existing table, no migration:

```sql
-- Written by /api/cron/pitches at the end of a successful run.
INSERT INTO system_metadata (key, value, updated_at) VALUES ('pitches_watermark',
  jsonb_build_object('closed_through', (current_date - 4)::text,  -- last look at G is G+3
                     'max_game_date',  (SELECT max(game_date)::text FROM pitches)), now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
```

| Zone | Dates | Obligation |
|---|---|---|
| **Closed** | `≤ closed_through` | stable modulo provider restatement (§6.2); cite normally |
| **Provisional** | `closed_through < g ≤ max` | still re-upserted and re-scored; label as-of, never alone for a claim about change |
| **Missing** | `> max_game_date` | absent, **not zero** |

**The comparability rule this doc exists to state.** A number computed before late data landed is still defensible **iff** both sides come from the closed zone, or both from the provisional zone *at the same as-of date*. A closed-zone May figure against a provisional-zone August figure adds an unbounded completeness difference atop the vintage-seam bias in `statistical-inference/07-trend-detection-changepoints.md`. At ~3 game dates the provisional zone is small enough that the honest move is to **exclude it from trends and leaderboards**, not caveat it.

**Missing is not zero.** Games that have not landed read as a real zero in every `AVG()`/`SUM()` that ignores coverage — the failure that let the 2026 Stuff+ outage look plausible for months (`Cas/analytics-ux/02-null-zero-unknown-ui.md`).

---

## 8. What Triton should do, in order

1. **Publish the watermark** — one `system_metadata` upsert at the end of `/api/cron/pitches` (§7). ~10 lines; nothing below works without it.
2. **Correct the documented window everywhere** — `Li/context/triton-context.md`, `Li/README.md`, the `// Sync last 3 days` comment at `app/api/cron/pitches/route.ts:36`, §6d's "72 hours" → **four requested dates, three post-game looks, last look ~55–64 h after first pitch.**
3. **Give `stuff_plus` a `docs/VARIABLES.md` entry with a time-basis clause** — stored vintage is `game_date + 3`, values above `closed_through` are provisional. The glossary has no `stuff_plus` entry, so this is the cheapest moment to add one.
4. **Count new rows separately from upserted rows.** Split `inserted`/`updated` at `app/api/update/route.ts:150-169`, record both in `cron_runs.counts` — the only change that makes late arrival *detectable* rather than merely survivable; it repairs `skipDownstream` as a side effect.
5. **Run the §6.2 restatement probe** and apply the pre-committed rule — the one open question that changes what Triton may claim about cross-season Stuff+. Turn on `track_commit_timestamp` (§6.1) while you are there.
6. **Exclude the provisional zone** from leaderboards and trend views (`game_date <= closed_through`), hand the provisional affordance to **Cas**, and snapshot value + as-of date into `daily_cards` and newsletter payloads.

**Anti-recommendation — do not widen the re-sync window to 7 or 14 days.** The obvious response to "we might be missing late data," wrong on three independent grounds. **(i) Wrong failure mode:** Statcast's documented restatements are *seasons* late, so 14 days catches nothing 4 days misses — and the observed problem is a 2-day publication lag belonging to Jo's freshness alerting. **(ii) It multiplies writes against a measured ceiling:** each extra date re-upserts ~4k unchanged rows through a statement already at 94.8% of the 8s `statement_timeout`, on a table with 29 indexes and ~4% HOT — and an ingest timeout is exactly how Stuff+ coverage silently reached zero in 2026. **(iii) It widens §3's re-scoring span**, rewriting more rows nightly against a moving baseline, so the vintage story worsens while coverage appears better. Real cost, undemonstrated benefit — §6.2 is how you would demonstrate it.

**Single highest-leverage next action:** ship the `pitches_watermark` upsert (1) and the `inserted`/`updated` split (4) in one PR. Under 30 lines together; they turn the two questions this doc cannot answer — *is this game date final?* and *did anything arrive late?* — into a column lookup for every number the platform produces from here on.

---

## Sources

1. Akidau et al. (2015), [*The Dataflow Model*](https://www.vldb.org/pvldb/vol8/p1792-Akidau.pdf) — watermarks as an explicit completeness estimate; §1/§7's vocabulary.
2. Akidau, [*Streaming 101*](https://www.oreilly.com/radar/the-world-beyond-batch-streaming-101/) — why "wait forever" and "trust immediately" are both wrong.
3. Apache Beam — [Programming guide](https://beam.apache.org/documentation/programming-guide/) — allowed lateness as a configured bound; Triton's four-date window.
4. Apache Flink — [Timely stream processing](https://nightlies.apache.org/flink/flink-docs-stable/docs/concepts/time/) — watermark generation and the late-record drop policy §7 borrows.
5. Apache Spark — [Structured Streaming watermarking](https://spark.apache.org/docs/latest/structured-streaming-programming-guide.html) — the batch-shaped form of the guarantee; closest to Triton's cron model.
6. Fowler, [*Bitemporal History*](https://martinfowler.com/articles/bitemporal-history.html) — the valid-time/transaction-time split §1's table is built on.
7. Snodgrass, [*Time-Oriented Database Applications in SQL*](https://www2.cs.arizona.edu/~rts/tdbbook.pdf) — transaction-time tables; why an overwrite destroys the question.
8. Kimball Group — [SCD types 0–7](https://www.kimballgroup.com/2013/02/design-tip-152-slowly-changing-dimension-types-0-4-5-6-7/) — Type 2 effective-dating; the alternative to §4's overwrite.
9. apXml — [Handling late-arriving data](https://apxml.com/courses/building-scalable-data-warehouses/chapter-3-high-throughput-ingestion/late-arriving-data) — grace vs reprocessing windows and their cost; §8's anti-recommendation.
10. dbt — [Incremental models](https://docs.getdbt.com/docs/build/incremental-models) — the lookback-window pattern `applyStuffPlusForDateRange` implements by hand.
11. dbt — [Snapshots](https://docs.getdbt.com/docs/build/snapshots) — capturing a mutable source's history; what §5(c) lacks.
12. Delta Lake — [Batch reads/writes](https://docs.delta.io/latest/delta-batch.html) — `versionAsOf`, the storage-layer form of "what did we know then?"
13. PostgreSQL — [System columns](https://www.postgresql.org/docs/current/ddl-system-columns.html) — `xmin`, the row handle §6.1 exploits.
14. PostgreSQL — [System information functions](https://www.postgresql.org/docs/current/functions-info.html) — `pg_xact_commit_timestamp` and its `track_commit_timestamp` dependency.
15. PostgreSQL — [INSERT … ON CONFLICT](https://www.postgresql.org/docs/current/sql-insert.html) — the upsert at `app/api/update/route.ts:148` that overwrites without a diff.
16. Petti, [*Building a Statcast database*](https://billpetti.github.io/2020-05-26-build-statcast-database-rstats-version-2.0/) — the working assumption that Savant "will often times update data from previous seasons."
17. Tango, [*Pitch velocity: new measurement process*](https://tangotiger.com/index.php/site/comments/pitch-velocity-new-measurement-process-new-data-points) — velocity re-referenced from 50 ft to release with no restatement of history; §4's third column.

**Triton-internal evidence (read 2026-08-12; no database queries run).** Window and clock: `app/api/cron/pitches/route.ts:27, 36-38` (`ymdInTimeZone()`; `start = addDaysToYmd(today, -3)`, `end = today`; comment "Sync last 3 days"), `lib/dateTz.ts:10-18, 27-32`, MiLB mirror `app/api/cron/milb-pitches/route.ts:13-23`; cron times `0 9` (pitches, milb-pitches), `10 9` (refresh), `0 10`/`30 12`/`0 14`/`0 15` (cards, graphics, briefs, emails) in `vercel.json`. Ingest, all in `app/api/update/route.ts`: Savant params `:72`; upsert with `ignoreDuplicates: false` `:148`; `inserted += batch.length` counting no-ops `:154, :166`; scoring span from ingested dates `:189-193`; per-day Stuff+ UPDATE, **no `stuff_plus IS NULL` predicate** `:318-333`; `refreshPitchBaselines` `ON CONFLICT DO UPDATE` `:269-277`. Downstream: `app/api/cron/refresh/route.ts:47-49, 59`; `app/api/cron/player-stats/route.ts:39-57`; `lib/cronTracker.ts:15-60`. **Packet, measured centrally 2026-08-12** (§1's table): no `created_at`/`updated_at` on `pitches` or `milb_pitches`; max `game_date` **2026-08-10** vs `milb_pitches` **2026-08-11**; `pitch_baselines` 206 rows, no timestamp; `compete_pitches` 443 rows with `created_at`; `last_analyze` NULL everywhere. **Quoted, not re-derived** (`docs/reliability-findings-2026-08-11.md` §6d, §7, §8, §12k; `Li/metric-governance/02-metric-versioning-reproducibility.md` §3): the 2026-08-11 two-vintage `stuff_plus` event (≈249k rows) and the 09:00/09:10 inversion; the ingest upsert at 94.8% of the 8s `statement_timeout`; 29 indexes / ~4% HOT; `ST`/`SV` at `MIN(game_year) = 2015`.
