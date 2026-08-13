---
title: Snapshotting vs Recompute — Keeping What the Leaderboard Said on a Date
domain: temporal-modeling
tags:
  - snapshots
  - as-of-queries
  - leaderboards
  - retention
  - reproducibility
  - storage-arithmetic
  - destructive-refresh
sources_reviewed: 19
last_updated: 2026-08-12
---

# Snapshotting vs Recompute — Keeping What the Leaderboard Said on a Date

## TL;DR

- **Snapshot-vs-recompute is not store-vs-compute, and Triton keeps answering the second when asked the first.** `04-materialize-vs-compute-time.md` decides where *a* value lives; this decides what it *was* on 3 July. A metric can be materialized and have no history. **(established)**
- **Recompute is only available when three things survive: the input rows as of D, the parameters as of D, and the code as of D. Triton has the third.** Even with baselines preserved it would still fail, because `pitches` has no load timestamp — "which rows existed on D" is unanswerable. **(computed)**
- **You cannot choose "recompute" for `stuff_plus` — the choice was made the night the baseline was overwritten.** `pitch_baselines` is 206 rows / 72 kB, destructively upserted, with **no timestamp column at all** (`app/api/update/route.ts:251,269`). **(computed)**
- **A daily snapshot of `league_averages` costs ~616 kB/day ≈ 225 MB/season — 2.3% of the 9,711 MB `pitches` table**, and the *baselines* cost ~26 MB/season, **0.27%**; the storage objection is quantitatively unserious. But the same arithmetic kills daily snapshots one grain down — `player_season_stats` at 13 MB/day is 4.6 GB/season, half of `pitches` — so cadence must vary by object. **(computed)**
- **A leaderboard snapshot storing only ranks is nearly worthless.** Rank is a whole-population function of a qualification rule; without `n_qualified`, `leader_value` and `qual_floor` alongside, a threshold change looks like a performance change. **(established)**
- **`league_averages` is one column short of being a snapshot table** — it already carries `updated_at`, `n_qualified`, `leader_value`, `qual_floor`, `stddev`. Missing: an as-of key and an append instead of the `DELETE` (`create-refresh-league-averages.sql:49`). **(computed)**
- **Three known incidents would have been a query, not an investigation:** the 2026-08-11 two-vintage `stuff_plus` rescore (≈249k rows), the 2026-05-08 wRC+ restatement of 5–6 points, and 46 days of stale `league_averages`. **(computed)**
- **Retention is set by accident:** `daily_cards` and `briefs`, the only true point-in-time artifacts here, die after 5 days (`app/api/cron/cleanup/route.ts:23,27`), so published numbers outlive their evidence. **(computed)**
- **Snapshot the small, mutable, whole-population objects; recompute the big immutable facts** — that rule assigns every Triton table without further argument. **(estimated)**

---

## 1. The axis this doc adds

`04-materialize-vs-compute-time.md` answers *where a derived number should live* — store inputs, compute outputs, materialize the read grain: a **spatial** decision whose four cells all describe a *current* value. Snapshot-vs-recompute is the **temporal** decision; the two are independent:

| | **Recompute history on demand** | **Snapshot history as it happens** |
|---|---|---|
| **Value computed at read** | wRC+ today — reproducible only if constants are versioned | wRC+ with a vintage table + a rendered-value log |
| **Value stored** | `stuff_plus` today — stored, past not re-derivable | `stuff_plus` + versioned baselines + a scoring ledger |

The diagonal is the trap: **materializing feels like keeping history and is not.** `pitches.stuff_plus` sits on 8.88M rows and still cannot answer "what was his Stuff+ on 3 July, as we knew it on 3 July." Storing preserves *a* value; snapshotting preserves *which* value was true when. In bitemporal terms (`02-bitemporal-modeling.md` owns the model), recompute claims transaction time is regenerable from valid time — true only when every input is immutable and every parameter versioned.

---

## 2. The three preconditions for recompute — and Triton's status

"Recompute the leaderboard as of D" is `f(inputs_as_of_D, parameters_as_of_D, code_as_of_D)`. All three must survive.

| Precondition | Requires | Triton | Evidence |
|---|---|---|---|
| **Inputs as of D** | Filtering fact rows to those loaded on or before D | ❌ | no load timestamp on `pitches`; the 3-day Savant re-sync is invisible afterwards |
| **Parameters as of D** | Baselines / constants / thresholds at the D vintage | ❌ | `pitch_baselines` upserted destructively; `league_averages`/`league_percentiles` `DELETE`d and rebuilt per season |
| **Code as of D** | Formula and weights addressable by commit | ✅ (unstamped) | formula in git; nothing records which SHA scored a row (`10-audit-trails-provenance.md`) |

**(a) The hinge.** For `stuff_plus`, recompute is not a worse option — it is not an option. The April baselines that z-scored an April pitch no longer exist in any form, so any "recomputation" of April Stuff+ yields August numbers wearing April dates: the definition of lookahead (`01-as-of-correctness.md`).

**(b) Preserving baselines alone is insufficient.** Make `pitch_baselines` append-only tomorrow and a recompute of D still scans whichever rows exist *now* for game dates ≤ D — rows Savant delivered on D+2, rows whose `pfx_x` or `pitch_name` it later restated (`09-retroactive-restatement.md`). The population is uncontrolled.

**(c) Parameters include the rules.** `create-league-averages.sql:9` documents an SP/RP rule ("first-inning game share > 0.5") the function populating the table does not implement — it uses ≥3 games with 50+ pitches. Freeze the **rule identifier**, not only the outputs (`07-qualification-thresholds.md`).

---

## 3. What "a snapshot" means — three artifacts

Conflating these is why snapshot proposals get priced wrong.

| Artifact | Grain | Certifies | Cost driver | Triton instance |
|---|---|---|---|---|
| **Fact snapshot** | source rows, as loaded | which observations existed | fact size × cadence | none — no load timestamp |
| **Derived-value snapshot** | the read grain | what the number was | read-grain size × cadence | none; `league_averages` is current-state |
| **Rendered-artifact snapshot** | the published output | what was said | tiny | `daily_cards`, `briefs`, `imagine_history.thumbnail_url` |

Kimball's vocabulary fits the middle row: a **periodic snapshot fact table** photographs a state at a fixed grain — the standard answer for mutable state and "as of" questions. The alternative, a **transaction fact** table, needs immutable events, precisely what Triton's parameter tables are not.

The rendered layer is instructive. `imagine_history` stores `filters JSONB` plus a `thumbnail_url` — a query spec and pixels; pixels are a legal record and a useless analytical one, and the spec re-executed today returns today's numbers. `daily_cards`/`briefs` do record what the newsletter published, then die after **5 days** — storage hygiene doing reproducibility policy by accident.

---

## 4. The cost arithmetic

All figures from the 2026-08-12 measurements; percentages are against `pitches` at **9,711 MB**.

| Candidate object | Rows | Size | Daily ×365 | % of `pitches` | Weekly ×52 | Verdict |
|---|---|---|---|---|---|---|
| `pitch_baselines` | 206 | 72 kB | **26 MB** | **0.27%** | 3.7 MB | **Daily** — cheapest, highest value |
| `league_averages` | 1,806 | 616 kB | **225 MB** | **2.3%** | 32 MB | **Daily**, in-season |
| `pitcher_season_deception` | 17,386 | 4,776 kB | 1,743 MB | 18% | 248 MB | Weekly at most |
| `pitcher_season_command` | 27,119 | 9,488 kB | 3,463 MB | 36% | 481 MB | Weekly at most |
| `player_season_stats` | 79,061 | 13 MB | **4,745 MB** | **49%** | 676 MB | **Never daily** — monthly + on-restatement |
| `pitches` / `milb_pitches` | 8.88M / 2.51M | 9,711 / 2,366 MB | absurd | — | absurd | Never. Recompute from them |

(`league_percentiles`, ~1,800 rows of 99-element arrays, sits between rows two and three: weekly.)

**The order-of-magnitude gap is the whole argument.** `pitch_baselines` is **0.0007%** of `pitches` by size, so a year of daily baseline snapshots is smaller than one day's pitch ingest; "we can't afford history" is false at this grain by four orders of magnitude. (`10-audit-trails-provenance.md` prices the append-only version at ~3,600 rows/season, under the pessimistic 206 × 365 = 75,190 assumed here; both are affordable, so the disagreement does not matter.) `player_season_stats` at 49% disciplines the rule the other way: daily snapshots of a 79k-row table look cheap until you multiply.

**A check on the packet.** 623,662 pages × 8 KiB = 4,872 MiB of heap, so 9,711 − 4,872 = **4,839 MB** non-heap against Jo's independently measured 4,833 MB of `pitches` indexes — 0.1% agreement, at 14.2 rows per page. **(computed)**

### 4.1 Two cheap reductions, before arguing about storage

| Technique | Mechanism | Saving on `league_averages` |
|---|---|---|
| **Change-detection (SCD2)** | Write only when the tuple's value changes; `valid_from`/`valid_to` as a `tstzrange` | Large and *growing* — late-season means move fractionally per day, so most nights write nothing |
| **In-season windowing** | Snapshot only on live days (~215/yr) | 225 MB → 132 MB (2.3% → 1.4%) |

Change-detection is strictly better information — *when the value changed*, not *when we looked*. Same Type-2 pattern `06-slowly-changing-dimensions.md` owns, and the default for slow-moving parameter tables; snapshot periodically only where the object is too small to justify the comparison logic (`pitch_baselines`, 206 rows). Partitioning and retention are **Jo's**, but one caveat belongs here: `last_analyze`/`last_autoanalyze` are NULL on every table inspected, so a new append-only table needs statistics targeted deliberately.

---

## 5. Leaderboards are a special case

A leaderboard is not a set of values but a **ranking over a selected population**. Four things move independently between two dates:

| What moved | Value snapshot detects? | Rank-only snapshot detects? |
|---|---|---|
| The player's own performance | yes | no |
| Others' performance (rank shifts, no personal change) | yes, by re-ranking | no |
| The **population** (`qual_floor` rises with `leader_value`) | only if qualification parameters captured | no |
| The **baseline** the plus-stat divides by | only if the vintage captured | no |

So a leaderboard snapshot must store, per row: value, rank, `n_qualified`, `leader_value`, `qual_floor`, the baseline vintage id, and the SP/RP rule id. Triton already computes five of those seven as columns — closer to done than it looks. The floor especially: `qual_floor = max(0.20 × leader_value, hard_floor)` is **single-observation-leveraged**, so one pitcher's extra start raises the bar for everyone, it climbs almost daily early in a season, and a player can leave a leaderboard without throwing a pitch. Omit it and that reads as a mysterious disappearance (`07-qualification-thresholds.md`).

**A cache is not a snapshot, and the read path has no as-of parameter.** The 30-minute in-memory `lbCache` (`app/api/leaderboard-triton/route.ts:9–10`) has the shape of a snapshot and none of the properties — not keyed by as-of date, not durable, not queryable. `app/api/league-baseline/route.ts:63–69` always selects the current row, so a heatmap rendered in May and the same heatmap today are centred on different means with nothing distinguishing them. Keying the table is half the work; the read path needs the parameter and the surface must declare its vintage (**Cas** owns "as of" and "not comparable within season" displays).

---

## 6. What snapshots buy — the three incidents, replayed

| Incident | What happened | With daily parameter snapshots |
|---|---|---|
| **2026-08-11 two-vintage `stuff_plus`**, ≈249k rows rescored, Feb–May kept original vintages | Found by investigation; the mixture is now permanent and undiscriminable | `WHERE baseline_snapshot_date` separates the populations — a predicate, not a defect |
| **2026-05-08 wRC+ restated 5–6 points** for every 2026 hitter | Noticed after the fact; no record of the prior constants | A diff of consecutive constants snapshots names the day, size, and affected rows |
| **`league_averages` stale 46 days** (2026-06-26 → 2026-08-11) | Found by a human running `MAX(updated_at)` | 46 consecutive **identical** daily rows — staleness visible as duplication, no freshness marker needed |

The third cuts both ways: a June 26 vintage still exists to look at only because the destructive rebuild that would have erased it had stopped running — Triton's only surviving parameter history was produced by a bug, not a strategy. The principle: **a snapshot table converts an incident into a query**, and neither detection-by-duplication nor detection-by-diff requires anticipating the specific failure. That is what distinguishes snapshots from monitoring.

---

## 7. The reproducibility ladder — what you owe, per number

| Rung | Requires | Which Triton numbers |
|---|---|---|
| **1. Bit-identical** | Fact + parameter snapshots + code pin | Anything published: newsletter, overlay, a number said to a player |
| **2. Re-derivable** | Immutable inputs + versioned parameters | Season leaderboards, `league_averages` |
| **3. Explainable** | Parameter snapshots only | In-season Stuff+ trend views |
| **4. Labelled-unreproducible** | A published provenance horizon | Everything before the ledger ships |

Rung 4 is correct for 2015 → the horizon date; fabricating a vintage to reach rung 3 converts a known unknown into a confident wrong grouping (`11-reproducible-historical-queries.md` owns the labelling). **Rung 1 is required exactly where a number leaves the building** — a small set, which Triton's rendered layer already occupies at a 5-day retention.

---

## 8. What Triton should do, in order

1. **Extend retention on `daily_cards` and `briefs` from 5 days to the end of the following season** (`app/api/cron/cleanup/route.ts:23`) — one constant, and the only place a published number loses its evidence.
2. **Convert `refreshPitchBaselines` from `ON CONFLICT DO UPDATE` to an append**, with a `pitch_baselines` view over the newest vintage so no consumer changes (`app/api/update/route.ts:251,269`). 26 MB/season worst case, and the one action that makes as-of Stuff+ *possible at all*.
3. **Add `as_of_date` to the `league_averages` primary key and replace `DELETE`-and-reinsert with an append** (`create-refresh-league-averages.sql:49`), with a `league_averages_current` view for existing readers. ~225 MB/season; the snapshot columns already exist.
4. **Add a load timestamp to `pitches`/`milb_pitches` going forward** (`created_at timestamptz DEFAULT now()`, no backfill; NULL = pre-instrumentation). Without it §2's precondition (a) stays broken and rung 2 is unreachable however well parameters are versioned. Sequencing → **Jo**.
5. **Use SCD2, not periodic snapshots, for `league_percentiles`, `pitcher_season_command`, `pitcher_season_deception`**, and **freeze rule identifiers alongside values** (SP/RP and qualification-rule versions as columns), fixing the stale docblock at `create-league-averages.sql:9` in the same commit as `docs/VARIABLES.md`.
6. **Add one integrity check that reads snapshot history**: alert when the newest `league_averages` as-of row is byte-identical to the prior day's across the full season × level × role set — the 46-day outage as a query.

**Anti-recommendation — do not build a daily snapshot of `player_season_stats`, or a general "snapshot every derived table nightly" job.** It is the natural generalization of step 3 and wrong three independent ways. **(i) Arithmetic:** 13 MB × 365 = 4,745 MB/season, **49% of the entire `pitches` table**, for numbers that move for a handful of players on a handful of days — over 99% duplication by construction. **(ii) Wrong artifact:** the source API *restates*; capture the restatement event, not 365 copies of the unchanged rows around it — SCD2 records strictly more for ~1% of the storage. **(iii) It does not deliver what it appears to:** as-of `player_season_stats` cannot be reconciled against pitch-level facts while precondition (a) is unmet — §1's trap one level up.

Two smaller don'ts. **Do not backfill snapshot history** for any object: there is nothing true to write. **Do not treat `lbCache` or a matview as history** — a cache with no as-of key answers "recently," never "then."

**Single highest-leverage next action:** ship step 2 today. Appending `pitch_baselines` instead of overwriting it costs one `ON CONFLICT` clause and a view, and it is the difference between as-of Stuff+ being *a feature to build* and *permanently impossible*. Every night it does not ship, another day joins the unreproducible side of the horizon.

---

## Sources

1. Snodgrass — [*Developing Time-Oriented Database Applications in SQL*](https://www2.cs.arizona.edu/~rts/tdbbook.pdf) — §3's state- vs event-table split; why transaction time cannot be rebuilt from valid time.
2. Kulkarni & Michels — [Temporal Features in SQL:2011](https://sigmodrecord.org/publications/sigmodRecord/1209/pdfs/07.industry.kulkarni.pdf) — system-versioned tables, the model an append-only `pitch_baselines` imitates.
3. Martin Fowler — [Bitemporal History](https://martinfowler.com/articles/bitemporal-history.html) — §1's two-axis framing, separating this question from `04-materialize-vs-compute-time.md`'s.
4. Kimball Group — [Dimensional Modeling Techniques](https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/) — periodic-snapshot vs transaction fact tables; §3's taxonomy.
5. Kimball Group — [Design Tip #152: SCD Types 0–7](https://www.kimballgroup.com/2013/02/design-tip-152-slowly-changing-dimension-types-0-4-5-6-7/) — Type 2 change-detection, §4.1's cheaper alternative.
6. dbt — [Snapshots](https://docs.getdbt.com/docs/build/snapshots) — capturing mutable source state; `check` vs `timestamp` strategies are §4.1's two options.
7. dbt — [Incremental models](https://docs.getdbt.com/docs/build/incremental-models) — append-with-watermark, the write pattern steps 2–3 adopt.
8. Feast — [Point-in-time joins](https://docs.feast.dev/getting-started/concepts/point-in-time-joins) — why a missing load timestamp (§2b) leaks regardless of parameter versioning.
9. Apache Iceberg — [Time travel queries](https://iceberg.apache.org/docs/latest/spark-queries/#time-travel) — snapshot-per-commit; the as-of read syntax Triton must hand-roll.
10. Snowflake — [Time Travel](https://docs.snowflake.com/en/user-guide/data-time-travel) — retention priced as a product decision (1–90 days); the `daily_cards` 5-day analogue.
11. Nathan Marz — [How to beat the CAP theorem](http://nathanmarz.com/blog/how-to-beat-the-cap-theorem.html) — the immutable master dataset a destructive nightly upsert forfeits.
12. PostgreSQL — [Table Partitioning](https://www.postgresql.org/docs/current/ddl-partitioning.html) — date partitions so retention is `DETACH`, not a mass `DELETE`.
13. PostgreSQL — [BRIN Indexes](https://www.postgresql.org/docs/current/brin.html) — the near-free index for a monotonic `snapshot_date`.
14. PostgreSQL — [Range Types](https://www.postgresql.org/docs/current/rangetypes.html) — `tstzrange` and exclusion constraints for §4.1's `valid_from`/`valid_to`.
15. PostgreSQL — [Database Page Layout](https://www.postgresql.org/docs/current/storage-page-layout.html) — the 8 kB page size behind §4's heap-vs-index cross-check.
16. PostgreSQL — [Monitoring Statistics](https://www.postgresql.org/docs/current/monitoring-stats.html) — `last_analyze`/`last_autoanalyze`, measured NULL platform-wide.
17. PostgreSQL — [Routine Vacuuming](https://www.postgresql.org/docs/current/routine-vacuuming.html) — why `DELETE`-and-reinsert costs more than an append.
18. Baseball Savant — [Statcast CSV documentation](https://baseballsavant.mlb.com/csv-docs) — the fields (`pfx_x`, `pitch_name`) restated upstream, making §2b live.
19. FanGraphs — [Guts! league constants](https://www.fangraphs.com/guts.aspx?type=cn) — the revised constants behind the 2026-05-08 wRC+ restatement.

**Triton-internal evidence.** Code read 2026-08-12. Destructive refreshes: `app/api/update/route.ts:251`/`:269` (`INSERT INTO pitch_baselines … ON CONFLICT (pitch_name, game_year) DO UPDATE`); `scripts/create-refresh-league-averages.sql:49` and `scripts/create-refresh-league-percentiles.sql:37` (`DELETE … WHERE season = p_season`, then reinsert). Snapshot-ready columns: `scripts/create-league-averages.sql:15–27` (PK `(season, level, role, metric)` plus `updated_at`, `stddev`, `n_qualified`, `leader_value`, `qual_floor`), `:35–40`, superseded SP/RP docblock at `:9`; `scripts/create-league-percentiles.sql:10–20`. No as-of parameter on the read path: `app/api/league-baseline/route.ts:63–69`. Non-durable cache: `app/api/leaderboard-triton/route.ts:9–10`. Rendered layer and retention: `scripts/create-imagine-history.sql:8–17`; `app/api/cron/cleanup/route.ts:23,27`. The 46-day staleness (`league_averages` last updated 2026-06-26 19:48, observed 2026-08-11): `docs/reliability-findings-2026-08-11.md:27`, `docs/Queries.md:969`. Sizes measured centrally 2026-08-12: `pitches` 8,877,621 rows / 9,711 MB / 623,662 pages; `milb_pitches` 2,508,422 / 2,366 MB / 122,702 pages; `league_averages` 1,806 / 616 kB; `player_season_stats` ~79,061 / 13 MB; `pitcher_season_command` 27,119 / 9,488 kB; `pitcher_season_deception` 17,386 / 4,776 kB; `pitch_baselines` 206 / 72 kB, no timestamp column; `last_analyze`/`last_autoanalyze` NULL everywhere. §4 multiplies those by 365, 215 or 52 over 9,711 MB; the heap check is 623,662 × 8 KiB = 4,872 MiB vs Jo's 4,833 MB of `pitches` indexes. Incident figures carry from `metric-governance/02-metric-versioning-reproducibility.md` and `10-audit-trails-provenance.md`.
