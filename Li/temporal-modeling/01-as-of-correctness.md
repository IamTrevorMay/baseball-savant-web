---
title: As-Of Correctness — What Did We Know Then, and Can We Still Get It Back
domain: temporal-modeling
tags:
  - as-of-correctness
  - point-in-time
  - lookahead-bias
  - transaction-time
  - valid-time
  - temporal-joins
  - snapshotting
  - reproducibility
sources_reviewed: 17
last_updated: 2026-08-12
---

# As-Of Correctness — What Did We Know Then, and Can We Still Get It Back

## TL;DR

- **"What did we know on July 3?" is a different question from "what happened on July 3," and Triton can only answer the second.** Event time is on every pitch; transaction time is on none — `pitches` carries `game_date` and `game_year`, and no ingest or load timestamp. **(computed)**
- **An `updated_at` column is a transaction-time *stamp*, not a *history*.** Five Triton tables carry one; all five overwrite in place, so it records when the previous answer was destroyed, not what it was. **(computed)**
- **`refresh_league_averages` is the sharpest case — `DELETE … WHERE season = p_season`, then re-INSERT with `now()`.** The denominator behind every plus-stat keeps one vintage: 1,806 rows, all "current." **(computed — `create-refresh-league-averages.sql:49,239`)**
- **The standard remedy for baseline drift *is* deliberate lookahead — a trade, not a bug.** A season-close rescore maximizes comparability across the season and destroys as-of reproducibility; one column cannot carry both. **(estimated)**
- **The fact table is Type-1 too, not just the baselines.** The re-sync upserts on `(game_pk, at_bat_number, pitch_number)` with `ignoreDuplicates: false`, overwriting `pfx_x`, `pitch_name`, and `events` in place — yesterday's *inputs* are as gone as yesterday's baseline. **(computed — `app/api/update/route.ts:148`)**
- **Even with frozen data some queries are non-deterministic by construction:** `CURRENT_DATE` predicates, plus a 6-hour cache that a rescore never invalidates. **(computed — `lib/queryCache.ts:32`, `app/api/cron/pitches/route.ts:68`)**
- **The only genuine record of what Triton *published* is `daily_cards`/`briefs` — scene JSON with values already resolved — and a cron deletes both after 5 days.** **(computed — `app/api/cron/cleanup/route.ts:23–27`)**
- **Rung 0 of the ladder — publish the horizon — is free and undone.** A known-unanswerable question is a managed risk; an unknowingly-unanswerable one is a wrong answer with a confident face. **(estimated)**

---

## 1. Four clocks, not two

Temporal theory gives two time axes; a working platform needs four. Confusing any pair is how lookahead gets in.

| Clock | Question it answers | Triton's carrier |
|---|---|---|
| **Event time** | When did it happen? | `pitches.game_date` (day, ET calendar), `game_year`, `game_pk` |
| **Valid time** | Over what interval was the fact true? | implicit — a season row is `[season, season+1)` |
| **Transaction time** | When did the DB believe it? | **absent on `pitches`**; `updated_at` on 5 tables |
| **Decision time** | When did a human or broadcast act on it? | `daily_cards.date`, `briefs.date` — 5-day retention |

Snodgrass's split is *valid time* (when the fact was true of the world) vs *transaction time* (when the row was current in the database); both together is **bitemporal** (established). Baseball adds an event/valid distinction the theory usually collapses: a pitch's event time is instantaneous and immutable, but facts *derived* from it — `pitch_name`, Stuff+, the league mean it is compared against — have valid intervals that move. Decision time is what operators ask about: *"the overlay said 112 on July 3 — why does the dashboard say 109?"*

**The load-bearing asymmetry:** valid time can be reconstructed from the domain (a season is a season); transaction time cannot be reconstructed from anything. If it was not written when the row was written, it is gone. That is why this is a Li domain and not a Jo one — Jo can say the data is there and fresh, but only a recorded transaction axis says what it *used to say*.

### 1.1 Stamp versus history

The commonest mistake here is believing `updated_at` buys as-of correctness. A stamp answers "when was this last written?" and is Kimball **SCD Type 1** — one row per key, prior states overwritten. A history answers "what did it say at time *T*?" and costs one row per change. Only the second supports an as-of join.

Triton has five stamps and zero histories (computed): `players`, `player_season_stats`, and `league_averages` carry Type-1 stamps on destructively rewritten tables, while `compete_pitches.created_at` and `compete_pitch_sessions.uploaded_at` are *creation* timestamps on append-mostly tables — a far more useful thing (§4.3). `pitch_baselines` has no timestamp at all. SCD mechanics: `06-slowly-changing-dimensions.md`.

---

## 2. Lookahead bias, in four flavours

Finance calls it look-ahead; ML calls it leakage. Kaufman et al. generalize it: *information about the target that would not legitimately be available at prediction time* (established). Baseball analytics has the same failure with none of the guardrails — nothing crashes, the query returns a number.

| Flavour | Mechanism | Triton instance | Grade |
|---|---|---|---|
| **Value** | scored with inputs that did not exist yet | an April pitch z-scored against near-complete-season baselines, per the 2026-08-11 repair (≈249k rows) | computed |
| **Population** | comparison set chosen using later information | qualification `IP >= max(5, 0.20 × IP_leader)` — August's leader is not July's, so July's benchmark is unrecoverable | computed |
| **Definition** | today's formula/constants applied to yesterday's number | wRC+ restated 5–6 points for every 2026 hitter on 2026-05-08, when `SEASON_CONSTANTS[2026]` landed | computed |
| **Selection** | only entities surviving to today are visible | `players` is insert-on-the-fly, so an "as of July" leaderboard built today includes August debutants | computed |

Value and definition lookahead move a number, and a careful reader can catch them. **Population and selection lookahead move the *denominator*, silently:** the plus-stat still reads 112, and 112 now means something else.

### 2.1 The trade nobody names

`metric-governance/02-metric-versioning-reproducibility.md` recommends a full rescore against final baselines at season close, and is right — it is the only way to make a season's `stuff_plus` internally comparable. State the cost:

> **A rescore is lookahead performed deliberately.** It makes the column comparable *across* the season and permanently unable to answer "what did we say in April?"

Three products of the same data. Name them:

| Product | Question | Correct policy | Owner |
|---|---|---|---|
| **Research view** | who was better over the season? | one vintage everywhere; rescore freely | Li + Soto |
| **As-of view** | what did we know on date *D*? | pinned inputs, never rewritten | Li |
| **Published record** | what did the overlay show on *D*? | immutable snapshot of the rendered value | Cas |

They coexist only if the as-of and published views live in tables the rescore does not touch. Today one column serves all three, which is why every answer is contestable. Restatement is `09-retroactive-restatement.md`; snapshot economics `07-snapshotting-vs-recompute.md`.

---

## 3. Triton's temporal surface, and what is permanently gone

Honest as-of work starts with an inventory of what is recoverable. Figures from the 2026-08-12 pass.

| Table | Event/valid axis | Txn axis | Rewrite behavior | As-of answerable? |
|---|---|---|---|---|
| `pitches` (~8.88M rows, 2015–2026) | `game_date` (`date`), `game_year` | **none** | upsert on `(game_pk, at_bat_number, pitch_number)`, `ignoreDuplicates: false` | **No — permanently** |
| `milb_pitches` (~2.51M, 2023–2026) | `game_date`, `game_year` | **none** | same shape | **No — permanently** |
| `pitch_baselines` (206) | `game_year` | **none** | `ON CONFLICT … DO UPDATE` | **No — permanently** |
| `league_averages` (1,806) | `season` | `updated_at` | `DELETE … WHERE season = p_season` + re-INSERT | No (stamp only) |
| `player_season_stats` | `season` | `updated_at` | nightly upsert | No (stamp only) |
| `players` | — | `updated_at` | upsert `onConflict: 'id'` | No (stamp only) |
| `compete_pitches` / `compete_pitch_sessions` | session date | `created_at` / `uploaded_at` | insert | **Partially — yes** |
| `daily_cards` / `briefs` | `date` | — | insert, **deleted at 5 days** | Yes, for 5 days |

Three conclusions, none negotiable by cleverness:

1. **Historical transaction time on the fact tables is unrecoverable.** No `created_at` was ever written across 11.4 seasons and ~11.4M combined rows, and `xmin` is no substitute — tuple versions are vacuumed and `xid` wraps (established). Any scheme claiming to recover pre-2026-08-12 vintages is fabricating.
2. **The mutable-input problem is deeper than the mutable-baseline problem.** `metric-governance/02` focuses on baseline vintage, but the pitch row is Type-1 too: the 3-day re-sync overwrites `pfx_x`, `pitch_name`, and `events` in place, so even a perfect baseline-version ledger yields *today's inputs under a past baseline* — a hybrid, not a true as-of value. Late arrival: `03-late-arriving-data.md`; relabeling: `09-retroactive-restatement.md`.
3. **The one asset that answers a decision-time question is on a timer.** `daily_cards` stores `scene: s.populated`, the numbers already resolved into it; `/api/cron/cleanup` deletes it and `briefs` at `today − 5 days`.

---

## 4. As-of joins: the mechanics, and why they don't apply yet

### 4.1 The pattern

An as-of join matches each probe row to the **most recent** dimension row at or before its timestamp — `merge_asof` in pandas, `ASOF JOIN` in DuckDB and ClickHouse, `versionAsOf` in Delta Lake, `AT (TIMESTAMP => …)` in Snowflake (established). Postgres has no `ASOF` keyword; two idiomatic forms:

```sql
-- A: LATERAL — latest dimension row at or before, one per fact row.
SELECT f.game_date, v.baseline_version_id FROM fact f CROSS JOIN LATERAL (
  SELECT bv.baseline_version_id FROM pitch_baseline_versions bv
  WHERE  bv.game_year = f.game_year
    AND  bv.computed_at <= f.scored_at      -- the axis that does not exist yet
  ORDER  BY bv.computed_at DESC LIMIT 1) v;

-- B: range containment; an exclusion constraint makes overlap impossible.
SELECT f.*, d.value FROM fact f
JOIN   dim_versioned d ON d.key = f.key AND d.effective @> f.as_of_ts;
```

B is better where available: `tstzrange` plus `EXCLUDE USING gist (key WITH =, effective WITH &&)` turns overlap into a *constraint violation* rather than a query bug, and containment is index-searchable. A degrades on large dimensions, but at 206 baseline and 1,806 league-average rows both are fine — so the constraint, not the plan, is the reason to prefer B. One semantic call either way: `<=` vs `<` at a tie — write it into the definition.

### 4.2 The blocker

Both patterns need a timestamped dimension, and Triton has none for any metric input (computed). So the reading is not "write as-of joins" but:

> **An as-of join is the *consumer* of a versions table. Ship the producer first.**

The producer is specified in `metric-governance/02` §5 (`pitch_baseline_versions` + `pitch_baseline_values`) and `10` §7 (the day-grain `stuff_plus_scoring_runs` ledger). One design note for both: **the version row needs an as-of watermark, not just a wall clock.** `computed_at` says when the job ran; `source_max_game_date` says what the world had done by then. They diverge whenever a job is late, and the second is what a reader means by "as of."

### 4.3 Where it already works: Compete

`compete_pitches.created_at` and `compete_pitch_sessions.uploaded_at` are real transaction-time columns on insert-only tables (computed), so "what did this athlete's sessions look like as of last Tuesday" is answerable *today* — Pattern A, no migration. Nobody has asked — but it is the template, and it makes the fix a convention, not a research problem: **every new table gets `created_at timestamptz NOT NULL DEFAULT now()`; every table rewritten in place gets a version row or a written statement that it is Type-1.** Retention is `10-time-series-storage.md`.

---

## 5. The query is non-deterministic even when the data is not

| Hazard | Where | Effect |
|---|---|---|
| `CURRENT_DATE` in a predicate | `lib/pitchVideos.ts:72`, `lib/dataIntegrity.ts:279` | identical SQL returns a different row set tomorrow, and never says which day produced it |
| Cache TTL with no version dimension | `lib/queryCache.ts:32` — 6h default, keyed on `cache_key` only | a cached response serves pre-rescore numbers for up to 6h |
| Invalidation gated on inserts | `app/api/cron/pitches/route.ts:68` — `totalInserted === 0 ? skip : invalidateBySource('pitches')` | a **pure rescore changes values without inserting rows**, so nothing invalidates; `/api/admin/backfill-stuff-plus` calls no invalidator |

The rule: **bind the as-of instant once, at the request edge, and pass it down** — resolve `as_of` (default `ymdInTimeZone()`), echo it in the response, include it in the cache key. Postgres makes the argument: `now()` is transaction-stable while `clock_timestamp()` is not, so even inside one statement "now" is a choice (established). A fourth hazard, `pitches.game_date` being a bare `date` so "today" depends on the reader's zone, belongs to `04-timezone-calendar-handling.md` along with doubleheaders; season boundaries `05-season-structure-modeling.md`; in-game ordering `08-event-sequencing-integrity.md`. Showing the stamp beside a number that can move is **Cas**.

---

## 6. The ladder of as-of guarantees

Four questions, in ascending difficulty. **Q1** what happened on 2026-07-03 (event time — yes). **Q2** what the database *held* then (transaction-time history — no). **Q3** what we would have *computed* then (Q2 + definition versions + the population as it stood — no). **Q4** what we actually *said* then (an immutable snapshot — 5 days only). Q1 is a filter; Q4 is the one asked in public, and it needs the cheapest mechanism here — not bitemporality, just a row you never delete. **Climb only as far as a real question requires.**

| Rung | Mechanism | Answers | Cost | Specified in |
|---|---|---|---|---|
| **0** | **Publish the horizon** — which questions are unanswerable, from when | stops wrong answers | free | `11-reproducible-historical-queries.md` |
| **1** | Stamp outputs: code SHA, constants year, `as_of` | which build produced this screenshot | one line | `metric-governance/10` §8 |
| **2** | Run ledger + versioned baselines (append, never upsert) | Q3, for rows scored after ship date | ~3,600 rows/season | `metric-governance/02` §5 |
| **3** | Snapshot published values, immutably | Q4 forever | a few hundred rows/season | `07-snapshotting-vs-recompute.md` |
| **4** | Bitemporal fact table | Q2 fully, restated inputs included | 8.9M rows × versions | `02-bitemporal-modeling.md` |

**Li's pick: 0 now, 3 next, 1 and 2 as `metric-governance` already specifies, 4 never for `pitches`.** Rung 4 is the textbook answer and the wrong one here: the fact table is ~9,711 MB across ~8.88M rows *before* any version dimension, while the questions actually asked are Q3 and Q4 — rungs 2 and 3, at a tiny fraction of the cost.

---

## 7. What Triton should do, in order

1. **Stop deleting the published record.** Make `/api/cron/cleanup` archive instead of `DELETE`, keeping `daily_cards` and `briefs` indefinitely — a few hundred rows a season, and the only Q4 evidence that exists.
2. **Write the as-of horizon into `docs/VARIABLES.md`** — §3's table as one sentence per table. Rung 0: free, and it converts an unknown unknown into a caveat.
3. **Bind `as_of` at the request edge** — resolve once, echo it in every stats response, add it to the `query_cache` key, and replace the `CURRENT_DATE` predicates in `lib/pitchVideos.ts` and `lib/dataIntegrity.ts`.
4. **Fix the invalidation gate:** fire `invalidateBySource('pitches')` on *value changes*, not on `totalInserted > 0`, and call it from `/api/admin/backfill-stuff-plus` — a rescore leaving stale numbers in the cache manufactures a Q1-vs-Q4 disagreement out of nothing.
5. **Adopt `created_at timestamptz NOT NULL DEFAULT now()` on every new table** (patterned on `compete_pitches`), then **ship rung 2** per `metric-governance/02` §5 and `10` §7, with `source_max_game_date` required and history seeded `mode='unknown'`.
6. **Declare the research / as-of / published split (§2.1) as policy**, so the next rescore is a decision with a named cost rather than an accident. Then write as-of joins (Pattern B) against (5).

Steps 1–5 change schema, a cron, or a query surface, so they **update `docs/VARIABLES.md` in the same commit**; any ad-hoc query run to size them goes in `docs/Queries.md`.

**Anti-recommendation — do not add `created_at`/`ingested_at` to `pitches` and start writing `WHERE created_at <= '2026-07-03'`.** It fails three independent ways. **(i) Wrong question:** almost nothing that moves a Triton number lives on the pitch row — wRC+ restated every 2026 hitter by 5–6 points with no change to `pitches` at all, and Stuff+ drift comes entirely from `pitch_baselines`. **(ii) Nothing true to backfill:** no transaction time exists for 2015 → 2026-08-12, so ~8.88M rows get NULL (useless) or a guess (fabrication) — and a filter over a fabricated column returns a *confidently wrong* answer, worse than refusing. **(iii) Cost on both sides:** an ~8.88M-row / 9,711 MB table under an 8s statement cap needs a chunked backfill plus an index, after which every historical query carries a predicate that is a lie for 11 of 12 seasons. Two smaller don'ts: **`pitches` should not be bitemporal** (§6 rung 4), and **`xmin`/MVCC is not time travel**.

**Single highest-leverage next action:** change `/api/cron/cleanup` to stop deleting `daily_cards` and `briefs`. One line, a few hundred rows a season, and the difference between permanently having and permanently losing the only record of what Triton told people — accruing value from the day it ships, unlike every other item here, which merely starts a clock.

---

## Sources

1. Snodgrass — [*Developing Time-Oriented Database Applications in SQL*](https://www2.cs.arizona.edu/~rts/tdbbook.pdf) — the valid/transaction/bitemporal vocabulary of §1.
2. Kulkarni & Michels — [Temporal features in SQL:2011](https://sigmodrecord.org/publications/sigmodRecord/1209/pdfs/07.industry.kulkarni.pdf) — `PERIOD FOR`/`AS OF`, which Postgres omits.
3. Fowler — [Bitemporal History](https://martinfowler.com/articles/bitemporal-history.html) — the "two dates on every question" framing.
4. Fowler — [Temporal Patterns](https://martinfowler.com/eaaDev/timeNarrative.html) — Audit Log / Effectivity / Snapshot as separable patterns; §6 prices them.
5. Kaufman, Rosset & Perlich — [Leakage in Data Mining](https://doi.org/10.1145/2382577.2382579) — the leakage definition in §2.
6. Feast — [Point-in-time joins](https://docs.feast.dev/getting-started/concepts/point-in-time-joins) — as-of correctness as a *join* problem.
7. Google — [Rules of Machine Learning](https://developers.google.com/machine-learning/guides/rules-of-ml) — log what you served; don't reconstruct it.
8. Brown, Goetzmann, Ibbotson & Ross — [Survivorship Bias in Performance Studies](https://doi.org/10.1093/rfs/5.4.553) — the selection-lookahead row of §2.
9. PostgreSQL — [LATERAL](https://www.postgresql.org/docs/current/queries-table-expressions.html) — the per-row correlated subquery (Pattern A).
10. PostgreSQL — [Range Types](https://www.postgresql.org/docs/current/rangetypes.html) — `tstzrange`, `@>`, `EXCLUDE`; Pattern B.
11. PostgreSQL — [btree_gist](https://www.postgresql.org/docs/current/btree-gist.html) — what makes Pattern B's exclusion constraint possible.
12. PostgreSQL — [Date/Time Functions](https://www.postgresql.org/docs/current/functions-datetime.html) — `now()` vs `clock_timestamp()`; `CURRENT_DATE` in §5.
13. DuckDB — [ASOF Joins](https://duckdb.org/2023/09/15/asof-joins-fuzzy-temporal-lookups.html) — as-of join semantics and cost.
14. ClickHouse — [JOIN clause](https://clickhouse.com/docs/en/sql-reference/statements/select/join) — `ASOF`'s strict-inequality rule; the `<=` vs `<` call.
15. pandas — [`merge_asof`](https://pandas.pydata.org/docs/reference/api/pandas.merge_asof.html) — `tolerance`: how to refuse a stale match.
16. Snowflake — [Time Travel](https://docs.snowflake.com/en/user-guide/data-time-travel) — a retention horizon is a *date*, not a promise.
17. Baseball Savant — [CSV field docs](https://baseballsavant.mlb.com/csv-docs) — the upstream that restates fields after publication.

**Triton-internal evidence.** Measured 2026-08-12 (central pass, not re-queried here): `pitches` ~8,877,621 rows / 9,711 MB, 2015-03-03 → 2026-08-10, `game_date` typed `date`, **no** ingest/load timestamp; `milb_pitches` ~2,508,422 rows / 2,366 MB, 2023-03-31 → 2026-08-11; `pitch_baselines` 206 rows keyed `(pitch_name, game_year)`, no timestamp; `league_averages` 1,806 rows keyed `(season, level, role, metric)` with `updated_at`; `player_season_stats` ~79,061 and `players` ~16,924, both with `updated_at`; `compete_pitches.created_at` and `compete_pitch_sessions.uploaded_at` present. Code-verified 2026-08-12: `app/api/update/route.ts` — pitch upsert key + `ignoreDuplicates: false` (`:148`), destructive baseline upsert (`:269–277`), per-`game_date` scoring UPDATE (`:318–333`); `DELETE FROM league_averages WHERE season = p_season` then re-INSERT with `now()` (`scripts/create-refresh-league-averages.sql:49,239,445,580,725`) against its DDL (`scripts/create-league-averages.sql:15–40`); 3-day re-sync and `totalInserted`-gated invalidation (`app/api/cron/pitches/route.ts:36–38,68`); 6h cache TTL keyed on `cache_key` alone (`lib/queryCache.ts:20,32,42`), no invalidator in `app/api/admin/backfill-stuff-plus/route.ts`; `CURRENT_DATE` predicates (`lib/pitchVideos.ts:72`, `lib/dataIntegrity.ts:279`); `ymdInTimeZone` (`lib/dateTz.ts:10`); populated-scene snapshot (`app/api/cron/daily-cards/route.ts:281`) and its 5-day deletion (`app/api/cron/cleanup/route.ts:23–27`). Carried from `metric-governance/02` §3: the ≈249,000-row two-vintage rescore of 2026-08-11 and the 2026-05-08 wRC+ restatement of 5–6 points.
