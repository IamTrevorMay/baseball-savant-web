---
title: Event Sequencing Integrity — The Order Nobody Verified, Under Five Metrics That Assume It
domain: temporal-modeling
tags:
  - event-sequencing
  - at-bat-number
  - pitch-number
  - gap-detection
  - ordering-keys
  - denominators
  - clustering
sources_reviewed: 17
last_updated: 2026-08-12
---

# Event Sequencing Integrity — The Order Nobody Verified, Under Five Metrics That Assume It

> Grades: **(established)** standard; **(computed)** from repo source or the 2026-08-12 packet, with
> `file:line`; **(estimated)** from theory. §5's queries are written to be run by a human.
> **None has been run. No gap rate is claimed.**

## TL;DR

- **Neither fact table has a timestamp column, so `(game_pk, at_bat_number, pitch_number)` is not *a* way to order a game — it is the *only* way.** No fallback when the integers disagree. **(computed)**
- **The uniqueness guarantee everything rests on is not in the repo's DDL** — no `scripts/*.sql` creates `pitches`, and the unique index on the triple is only *described* in a comment and *required* by the upsert. **(computed — `create-tier2-indexes.sql:38`)**
- **The two tables' `at_bat_number` columns come from different generators and are not the same quantity** — Savant's CSV counter vs the Stats API's `about.atBatIndex + 1`: one name, two definitions. **(computed — `app/api/update/milb/route.ts:186`)**
- **A falsy `pitchNumber` in the MiLB feed silently becomes `1`, and `1` is part of the upsert conflict key** — a defective record doesn't fail, it *overwrites the real first pitch*. **(computed — `app/api/update/milb/route.ts:223,357`)**
- **The pitch-sequencing transition matrix drops every pair straddling a pickoff or intentional ball.** `/api/sequencing` joins `pitch_number + 1` and *then* filters `PO`/`IN` from both sides, so the k → k+2 transition is never formed. **(computed — `app/api/sequencing/route.ts:47–51`)**
- **A NULL `at_bat_number` does not shrink a denominator, it deletes a plate appearance.** PA/AB/IP/K%/BB%/OBP count `DISTINCT game_pk::bigint * 10000 + at_bat_number`; NULL propagates and is skipped. No error, smaller n, *larger* rate. **(computed — `lib/sql.ts:19,26`)**
- **Sequence integrity is a precondition for `statistical-inference/01`.** Its design effect needs `k` and `m̄`, both counted off these keys; a wrong `m̄` moves every `n_eff`, SE and MDE there. **(computed / established)**
- **The nightly integrity cron runs eight checks and none looks at sequence.** Harness, audit table and alerting already exist; a ninth check is an afternoon. **(computed — `app/api/cron/integrity/route.ts:26–35`)**

---

## 1. Four grains, four keys, one enforced guarantee

| Grain | Identified by | Ordered by | Guaranteed by |
|---|---|---|---|
| Game | `game_pk` | `game_date` (day only) | MLBAM; unique |
| Half-inning | `game_pk, inning, inning_topbot` | `inning` asc, `Top` then `Bot` | convention only |
| Plate appearance | `game_pk, at_bat_number` | `at_bat_number` asc | upstream counter |
| Pitch | `game_pk, at_bat_number, pitch_number` | `pitch_number` asc | counter + unique index |

**Only the pitch triple has a database-enforced guarantee**; half-inning and PA ordering are conventions
nothing checks. And `game_date` is a `date`: it cannot order two games on one day, a doubleheader,
or an early game against a late West-Coast one. The repo's de facto sort —
`game_date, game_pk, at_bat_number, pitch_number` — appears verbatim in
`app/api/sequencing-atbats/route.ts:35`, `app/api/pitch-video/route.ts:340` and
`__tests__/integration/savantValidation.test.ts:63`, correct and with no fallback term: ties resolve to
whatever the plan produced that day. (computed)

**The clock that does not exist.** No `created_at`, no ingest stamp, no pitch instant on either table, so
ordering two same-day games, "did the re-sync restate this row," and anything
needing elapsed time (tempo, pace) are all unanswerable — which is why
`metric-governance/10-audit-trails-provenance.md` proposes a run-grain ledger. **Sequence integers are
Triton's logical clock** in Lamport's sense: they order events without measuring them, and a logical clock
with gaps is a clock that skips. (established)

---

## 2. Two generators, two `at_bat_number`s

| | `pitches` (MLB) | `milb_pitches` |
|---|---|---|
| Source | Savant CSV export | MLB Stats API game feed |
| `at_bat_number` | Savant's PA counter, verbatim | `(about.atBatIndex ?? 0) + 1` |
| `pitch_number` | Savant's within-PA counter | `ev.pitchNumber \|\| 1` |
| Non-pitch rows | `PO`/`IN` present, occupying numbers | `if (!ev.isPitch) continue` — skipped |

**2.1 The `+1` convention is unwritten and appears twice.** `app/api/update/milb/route.ts:186` converts
the 0-indexed `atBatIndex`; `app/api/umpire/route.ts:191` re-derives it in the *other* direction, joining
`umpire_challenges.at_bat_index + 1 = pitches.at_bat_number` against the **MLB** table — asserting
Savant's counter equals the Stats API's play index plus one, for every game. If the feeds ever disagree
about whether a non-PA play consumes an index, that join attaches the wrong pitch, confidently.

**2.2 A gap means different things in the two tables.** In `pitches` it is *usually a filtered pickoff*;
in `milb_pitches`, where non-pitch events never become rows, *usually a defect*. One threshold cannot
serve both.

**2.3 `ev.pitchNumber || 1` is a silent data-loss path.** `0`, `null` and `undefined` all collapse to `1`;
with the conflict target at `:357`, the malformed row upserts *over* the genuine first pitch. The MLB path
at least logs the offending key on failure (`app/api/update/route.ts:164`). Dedup machinery is **Jo's**
(`Jo/data-quality/08-duplicate-detection-idempotency.md`); Li owns that the overwrite changes a
denominator without changing a row count. (computed)

---

## 3. What actually depends on these integers

| Consumer | `file:line` | Assumption | Failure mode |
|---|---|---|---|
| PA/AB/OBP/K%/BB% | `lib/sql.ts:26`, `create-refresh-league-percentiles.sql:126` | `at_bat_number` non-NULL, unique per PA | NULL → PA vanishes → **rates inflate** |
| IP estimate | `lib/sql.ts:19` | same key + one `events` row per PA | IP low → **qualification and per-IP rates move** |
| Times-through-order | `SplitsTab.tsx:119–122` | `n_thruorder_pitcher`, Savant-derived | Inherited; never validated |
| Sequencing / tunneling | `app/api/sequencing/route.ts:47–51` | dense `pitch_number`, nothing excluded between k and k+1 | Straddling pairs dropped (§3.1) |
| Count-state splits | `app/api/sequencing/route.ts:24–34` | `balls`/`strikes` follow the prior pitch | Unchecked; §5.3 is the test |
| Outing clustering | `statistical-inference/01` §4 | `k`, `m̄` from these keys | `deff = 1 + (m̄−1)ρ` wrong → SEs too narrow |

**3.1 The transition-matrix defect, worked.** `/api/sequencing` joins on
`b.pitch_number = a.pitch_number + 1` (`:47–48`) and *then* requires `a.pitch_type NOT IN ('PO','IN') AND
b.pitch_type NOT IN ('PO','IN')` (`:51`). Take pitch, pickoff, pitch at k, k+1, k+2: pair (k, k+1) dies on
the `b` filter, (k+1, k+2) on the `a` filter, and **(k, k+2) is never formed, because the join only looks
at +1**. The transition a coach asks about — what he threw *after* holding the runner — is
absent, and pickoffs concentrate in the runner-on states the matrix is read for. **Non-random deletion
from a conditional distribution, not noise in a rate.** (computed)

**3.2 Inherited sequence assumptions.** `pitches` carries Savant's `n_thruorder_pitcher`,
`n_priorpa_thisgame_player_at_bat` and four `*_days_since/until_*_game` columns. Triton splits on them and
never validates them; they encode *Savant's* view of the sequence. The MiLB ingest writes none of them
while `app/api/milb/player-data/route.ts:4` selects `n_thruorder_pitcher` and `SplitsTab` filters
`.filter(Boolean)`: **the MiLB times-through-order split is structurally empty, not "no data
yet."** (computed)

---

## 4. Taxonomy of sequence defects

| Defect | Signature | Plausible cause |
|---|---|---|
| **Gap** | `MAX(pitch_number) > COUNT(*)` in a PA | filtered `PO`/`IN`, dropped row, bad upsert |
| **Restart** | `MIN(pitch_number) <> 1` | partial ingest, suspended-game resumption |
| **Overwrite** | row count flat, values changed | `\|\| 1` coercion (§2.3), re-sync restatement |
| **Out-of-order** | `inning` falls as `at_bat_number` rises | mis-derived PA index, reordering |
| **Off-by-one** | joins land one PA away | `+1` convention drift (§2.1) |
| **Orphan key** | `at_bat_number IS NULL` | CSV parse nulls empties (`update/route.ts:128`) |

Duplication is the only one the database catches; the rest are silent. (estimated)

---

## 5. The probes to run — none have been run

Scope each by `pitcher = $1 AND game_year = $2`: index-only against `idx_pitches_seq (pitcher, game_year,
game_pk, at_bat_number, pitch_number)` (`create-tier2-indexes.sql:43`). **Scope by
pitcher, never by game:** `pitches` is ~8,877,621 rows / 623,662 pages / 9,711 MB and documented
indexes are pitcher, batter, game_date (`CLAUDE.md`); **there is no `game_pk` index**. Expect one false
positive at that scope: `COUNT(DISTINCT at_bat_number) < MAX(at_bat_number)` is normal, since a
per-pitcher query sees only that pitcher's at-bats. **Run `ANALYZE pitches;` first** — `last_analyze`
and `last_autoanalyze` are NULL everywhere inspected, so a `LAG` window costed off default selectivity can
be planned as a sequential scan. Log to `docs/Queries.md`.

### 5.1 Pitch-number density within a PA (cheap; start here)

```sql
SELECT COUNT(*) FILTER (WHERE mx <> c) AS pa_with_gaps,
       COUNT(*) FILTER (WHERE mn <> 1) AS pa_not_starting_at_1,
       COUNT(*) AS pa_total, SUM(mx - c) AS missing_pitch_slots
FROM (SELECT game_pk, at_bat_number,
             MIN(pitch_number) mn, MAX(pitch_number) mx, COUNT(*) c
      FROM pitches WHERE pitcher = $1 AND game_year = $2
      GROUP BY 1,2) t;
```

**Expect nonzero `pa_with_gaps` in `pitches`, and treat it as pickoffs until §5.2 proves otherwise.**

### 5.2 Classify each gap: semantic or lost row?

```sql
WITH bad AS (
  SELECT game_pk, at_bat_number, MAX(pitch_number) AS mx
  FROM pitches WHERE pitcher = $1 AND game_year = $2
  GROUP BY 1,2 HAVING MAX(pitch_number) <> COUNT(*)
)
SELECT b.game_pk, b.at_bat_number, g.n AS missing_number
FROM bad b
CROSS JOIN LATERAL generate_series(1, b.mx) AS g(n)
LEFT JOIN pitches q ON q.game_pk = b.game_pk AND q.at_bat_number = b.at_bat_number
                   AND q.pitch_number = g.n
WHERE q.game_pk IS NULL ORDER BY 1,2,3;
```

Take a sample of the missing slots to the Savant game feed. **A pickoff there means the gap is semantic
and must be preserved; a pitch there means a lost row, which is Jo's.** Without that triage, a gap count
is a number with two incompatible meanings.

### 5.3 The count-state invariant — strongest check, self-contained

`balls`/`strikes` are a deterministic function of the prior pitch's `description`, so the sequence is
self-validating: gaps, overwrites and reordering surface as a count that cannot follow.

```sql
WITH s AS (
  SELECT pitch_number, balls, strikes,
         LAG(balls) OVER w pb, LAG(strikes) OVER w ps,
         LAG(description) OVER w pd, LAG(pitch_type) OVER w pt
  FROM pitches WHERE pitcher = $1 AND game_year = $2
  WINDOW w AS (PARTITION BY game_pk, at_bat_number ORDER BY pitch_number)
)
SELECT COUNT(*) FILTER (WHERE pitch_number = 1 AND (balls <> 0 OR strikes <> 0)) AS bad_first_pitch,
       COUNT(*) FILTER (WHERE pd IS NOT NULL AND pt <> 'PO' AND (
            balls   <> pb + CASE WHEN pd IN ('ball','blocked_ball','pitchout') THEN 1 ELSE 0 END
         OR strikes <> LEAST(2, ps + CASE
              WHEN pd LIKE '%strike%' OR pd IN ('foul_tip','missed_bunt','foul_bunt') THEN 1
              WHEN pd LIKE 'foul%' THEN CASE WHEN ps < 2 THEN 1 ELSE 0 END ELSE 0 END)
       )) AS bad_count_transition,
       COUNT(*) AS pitches_checked
FROM s;
```

Enumerate the live `description` vocabulary first — an unlisted value scores as "no advance"
and false-positives — and treat the output as a **diagnostic ratio, not a gate**. **A stable nonzero rate
is a description-mapping gap; a rate that jumps on a date is an ingest seam**, exactly what `410212b`
created in `milb_pitches.events`. (estimated)

### 5.4 Adjacency loss, orphan keys, monotonicity

Three one-liners over the same slice. **Adjacency loss:** run §3.1's join and count pairs formed against
pairs where either side is `PO`/`IN`/NULL — the share of the transition matrix currently discarded, a
number nobody has today. **Orphan keys:** `COUNT(*) FILTER (WHERE at_bat_number IS NULL)` —
**every NULL is a plate appearance already missing from every rate on the platform** (§3).
**Monotonicity:** `inning` non-decreasing in `at_bat_number`, `outs_when_up` non-decreasing within a
half-inning — the `LAG` shape of §5.3, catching reordering that density checks cannot.

---

## 6. Enforce, or assert?

Four invariants are enforceable at write time and cost nothing: the **unique** index on the triple (relied
on today, absent from repo DDL), `at_bat_number NOT NULL` — which turns §5.4's silent PA loss into a loud
ingest failure — `pitch_number >= 1`, and `CHECK` domains on the count. PA density, count-state
transitions and monotonicity are **multi-row invariants and cannot be constraints**; they are nightly
assertions — and Triton already owns that machine. `app/api/cron/integrity` runs eight checks through
`Promise.allSettled` into `integrity_checks (check_name, status, found, remediated, details)` — **all
eight entity or baseline checks (`unknown_players`, `orphaned_pitchers`, `orphaned_batters`,
`new_pitch_names`, `season_constants`, `materialized_views`, `league_averages`, `pitch_baselines`), none
touching sequence.** Adding `checkPitchSequence(year)` to `lib/dataIntegrity.ts` and the array at
`route.ts:26–35` reuses the audit table, run linkage and alerting for free. Copy dbt's `unique`/`not_null`
*vocabulary*; do not adopt a framework for one check. (computed / established)

---

## 7. What a measured gap rate would change

Once §5.2 splits semantic gaps from lost rows, a lost-row rate `g` propagates:

| Quantity | Effect of `g` | Type |
|---|---|---|
| Pitch-count denominators (Stuff+ n, usage) | scales by `(1−g)` | Variance |
| `m̄` in `deff = 1 + (m̄−1)ρ` | falls with `g` → deff understated → SEs too narrow | Variance |
| PA rates (K%, BB%, OBP) | numerator and denominator drop **non-proportionally** — a lost PA removes its outcome | **Bias**; sign depends on which PAs are lost |
| IP → qualification | can drop a pitcher below `IP >= max(5, 0.20 × leader)`, changing `league_averages` membership | **Bias** |
| Transition matrix (§3.1) | cells thinned non-uniformly | **Bias**; no n removes it |

Three of five are bias — the distinction `statistical-inference/01` §6 turns on. **Bias does not shrink
with sample size, so a defect found in 2026 contaminates 2015–2026 equally**; the remedy is repair, not
more data. Gaps are also not missing-at-random: pickoffs, challenges and ejections concentrate them in the
runner-on states count-split and TTO views slice on, so `g` is no scalar discount. It is also why a
short-window Stuff+ must print `k` (outings) beside `n`: `k` is counted off `game_pk`, the one key with no
known hazard. Displaying that pair is **Cas's** call.

---

## 8. What Triton should do, in order

1. **Run §5.1 and §5.4 on three pitcher-seasons — 2015, 2020, 2026 — and log to `docs/Queries.md`.**
   Twenty minutes; converts this doc's *estimated* claims to *computed*. `null_ab > 0` → Jo.
2. **Run §5.2 on whatever §5.1 flags and classify each gap as pickoff-semantic or lost row.** The rate is
   meaningless before this split; §7 keys off it.
3. **Add the free write-time constraints** (§6), **commit the unique-index DDL to `scripts/`**, and
   **document the `+1` convention in `docs/VARIABLES.md`** beside the `pa` definition at line 70.
4. **Add `checkPitchSequence(year)` as the ninth nightly integrity check** (§6), reporting `pa_with_gaps`,
   `null_ab` and `bad_count_transition` into `integrity_checks.details`. Alert on a *change* in the rate,
   not on nonzero — the baseline is legitimately nonzero in `pitches`.
5. **Fix `/api/sequencing` to walk the sequence instead of joining on `+1`**: drop `PO`/`IN` first, then
   pair adjacent survivors. Quantify the recovery with §5.4.
6. **Replace `ev.pitchNumber || 1` with a null check that fails the row loudly.** A rejected row is a bug
   report; a coerced one is a deleted pitch.

**Anti-recommendation: do not "repair" gaps by renumbering `pitch_number` to be dense.** The obvious move,
wrong three ways. **(a) Most gaps are information** — a missing 3 in a five-pitch at-bat
usually *is* the pickoff, and renumbering destroys the only local evidence of it. **(b) The key is
load-bearing twice over:** it is the upsert conflict target (`app/api/update/route.ts:148`), so the next
re-sync would insert Savant's original numbering *alongside* the renumbered rows and double the at-bat,
and it is the primary key of `pitch_videos`, so every archived clip would orphan. **(c) The write is
unaffordable** — an UPDATE across 8.9M rows on a table Jo measured at 29 indexes and 13.9% dead tuples,
planned without statistics, to impose a convention the source overwrites nightly. Correct posture:
**detect, classify, annotate.**

**Single highest-leverage next action: run §5.1 against one 2026 qualified starter and one 2016 qualified
starter and compare `pa_with_gaps / pa_total`.** Agreement means gaps are structural, a
monitoring item. Divergence means an ingest seam in the sequence keys — and every metric in §3 sits on it.

---

## Sources

1. [Baseball Savant — CSV documentation](https://baseballsavant.mlb.com/csv-docs) — key columns are counters with no time component (§1–2).
2. [pybaseball](https://github.com/jldbc/pybaseball) — Statcast client corroborating the key triple independently of Triton's ingest (§2).
3. [baseballr (Bill Petti)](https://billpetti.github.io/baseballr/) — R-side Statcast column reference; second corroboration (§2).
4. [MLB-StatsAPI wiki (toddrob99)](https://github.com/toddrob99/MLB-StatsAPI/wiki) — `atBatIndex`, `playEvents`, `isPitch`, `pitchNumber`: what the MiLB ingest derives its keys from (§2).
5. [Retrosheet event file format](https://www.retrosheet.org/eventfile.htm) — independent per-game event ordering; the PA-vs-play mismatch (§2.1).
6. [PostgreSQL — Window functions](https://www.postgresql.org/docs/current/functions-window.html) — `LAG`/`WINDOW` semantics for §5.3–5.4.
7. [PostgreSQL — WITH queries](https://www.postgresql.org/docs/current/queries-with.html) — CTE materialization behind §5.2's `bad` scan.
8. [PostgreSQL — Set-returning functions](https://www.postgresql.org/docs/current/functions-srf.html) — `generate_series` + `LATERAL` for §5.2's anti-join.
9. [PostgreSQL — INSERT … ON CONFLICT](https://www.postgresql.org/docs/current/sql-insert.html) — why a unique index on the triple is *required* by both ingest paths (§2.3, §8).
10. [PostgreSQL — Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html) — `NOT NULL`/`CHECK`/`UNIQUE`: the enforceable half of §6.
11. [PostgreSQL — Multicolumn indexes](https://www.postgresql.org/docs/current/indexes-multicolumn.html) — why `idx_pitches_seq` makes §5 index-only.
12. [PostgreSQL — Planner statistics](https://www.postgresql.org/docs/current/planner-stats.html) — what a NULL `last_analyze` costs a plan (§5).
13. [dbt — Data tests](https://docs.getdbt.com/docs/build/data-tests) — the `unique`/`not_null` grammar §6 copies without the framework.
14. [dbt-utils](https://github.com/dbt-labs/dbt-utils) — `sequential_values`, `unique_combination_of_columns`: the off-the-shelf shape of §5.1.
15. [Great Expectations](https://docs.greatexpectations.io/) — vocabulary for stating §4's taxonomy declaratively.
16. [Lamport timestamps](https://en.wikipedia.org/wiki/Lamport_timestamp) — logical clocks ordering events without measuring them (§1).
17. [Missing data — MCAR/MAR/MNAR](https://en.wikipedia.org/wiki/Missing_data) — §7's classification; runner-on gaps are MNAR, so a gap rate is not a discount factor.

**Triton-internal evidence.** Packet gathered centrally 2026-08-12; **no queries were run for this doc.**
`pitches` ~8,877,621 rows / 9,711 MB / 623,662 pages, 2015-03-03 → 2026-08-10; `milb_pitches` ~2,508,422
rows / 2,366 MB, 2023-03-31 → 2026-08-11; **no timestamp column on either**; `last_analyze` and
`last_autoanalyze` NULL on every table inspected; indexes pitcher, batter, game_date (`CLAUDE.md`), no
`game_pk` index. Code: `app/api/update/route.ts:128–131,148,164` (CSV null coercion,
conflict target, per-row retry log); `app/api/update/milb/route.ts:186,223,357`; MiLB writes no
`n_thruorder_pitcher` (`grep -c` → 0) while `app/api/milb/player-data/route.ts:4` selects it and
`components/dashboard/SplitsTab.tsx:119–122` filters on it; `app/api/sequencing/route.ts:24–34,47–51`;
canonical sort `app/api/sequencing-atbats/route.ts:35`, `app/api/pitch-video/route.ts:340`,
`app/api/models/gamecall/route.ts:129`; umpire join `app/api/umpire/route.ts:191–194`; PA/IP surrogate
keys `lib/sql.ts:19,26` and
`scripts/create-refresh-league-percentiles.sql:126–169`, with the `* 100000` variant at
`scripts/export-2026-hitting.ts:31,40`; unique index described but not created in repo DDL
`scripts/create-tier2-indexes.sql:38`, covering index `:43`, and no `scripts/*.sql` creates `pitches`;
video PK `scripts/create-pitch-videos.sql:30`; integrity harness `app/api/cron/integrity/route.ts:26–35`
+ `scripts/create-integrity-checks.sql`; glossary `pa` at `docs/VARIABLES.md:70`. Precedents `cf345e2`
and `410212b` per `context/triton-context.md`; 29 indexes / 13.9% dead are Jo's 2026-08-11 numbers via
`Li/metric-governance/02`. **Cross-references:** `statistical-inference/01-sampling-and-sample-size.md`,
`metric-governance/10-audit-trails-provenance.md`, `Jo/data-quality/08-duplicate-detection-idempotency.md`.
