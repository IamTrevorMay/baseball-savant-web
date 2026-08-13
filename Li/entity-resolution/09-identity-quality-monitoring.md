---
title: Identity Quality Monitoring — Measuring Whether the Join Still Finds the Right Person
domain: entity-resolution
tags:
  - orphan-rate
  - match-rate
  - duplicate-detection
  - join-integrity
  - referential-integrity
  - self-healing-monitors
  - linkage-precision
  - coverage
sources_reviewed: 18
last_updated: 2026-08-12
---

# Identity Quality Monitoring — Measuring Whether the Join Still Finds the Right Person

> Grades: **(established)** published/replicated; **(computed)** verified against Triton source or the
> 2026-08-12 packet — read, not queried; **(estimated)** from theory; **(folk-sabermetrics)** repeated,
> unverified. Li owns **which identity quantity to measure and why it is the right one**; the
> machinery that evaluates, routes and pages is Jo's — `Jo/data-quality/02-declarative-expectations.md`,
> `Jo/data-reliability/04-alerting-oncall-design.md`, `Jo/data-quality/10-quality-metrics-scorecards.md`.

## TL;DR

- **Triton's orphan rate is zero and that number is nearly uninformative** — the check that measures it
  also repairs it, upserting the missing player from the MLB People API in the same call, so it
  reports the state after its own intervention. (computed — `lib/dataIntegrity.ts:97–150`)
- **What survives self-healing is the pre-repair `found`, not the rate** — already written nightly to
  `integrity_checks.found`, read by nothing, and right-censored by the same function's `LIMIT 200`,
  so 200 orphans and 20,000 read identically. (computed — `lib/dataIntegrity.ts:104, 165`)
- **The unmatched rate that matters is on the facility path and no check reports it**: 443 of 443
  `compete_pitches` rows carry `tm_pitcher_id`, **0 carry `athlete_profile_id`**. (computed)
- **Two paths make opposite guarantees**: `biomech_captures.athlete_profile_id` is
  `not null references`, `compete_pitches`' is nullable with `on delete set null` — a clause that
  turns a referential violation into a silent NULL. (computed)
- **A duplicate alarm on `players.name` would be ~96% false positives.** 16,931 rows hold 16,418
  distinct names — 513 surplus — and `Gonzalez, Jose` is four different people. Name equality is a
  blocking key, never a decision. (computed + estimated)
- **The field that would settle those cases is fetched nightly and discarded**: `fetchMlbPerson`
  returns only `{name, position}` from `/api/v1/people/{id}`, and `players` has no birth column.
  (computed)
- **`players` has three writers and two naming conventions** — 457 of 16,931 names are `"First Last"`
  against 16,474 `"Last, First"`, so any name-keyed join silently misses 2.70%. (computed)
- **Attribute coverage is an identity metric**: `players.team` is populated on **0 rows**, `position`
  on 64.4%, `lahman_id` on 19.07% — a resolved ID with no usable attribute passes the orphan check
  and fails the user. And person-side checks are cheap: `players` is 1,632 kB against `pitches` at
  9,711 MB, so identity monitoring earns its own cadence. (computed)

---

## 1. Four quantities, routinely collapsed into one

| # | Quantity | Question | Denominator |
|---|---|---|---|
| 1 | **Orphan rate** | Does a referenced ID exist in the master table? | referencing rows / distinct IDs |
| 2 | **Unmatched rate** | Was a link *attempted and not made*? | linkable rows |
| 3 | **Linkage precision/recall** | Of links made, how many are the right person? | proposed links |
| 4 | **Attribute coverage** | Does the resolved person carry the fields the join needs? | master rows |

**1 and 2 have different denominators and cannot be averaged into a health score.** **Only 3 needs
ground truth**, which is why nobody monitors it and why it silently corrupts numbers: an orphan is
loud in a join, a wrong match is invisible and still returns a row.

---

## 2. The self-healing monitor problem

`checkOrphanedPitchers(year)` runs `LEFT JOIN players … WHERE pl.id IS NULL`, then for every orphan
fetches the person from `statsapi.mlb.com/api/v1/people/{id}` and upserts into `players` — in the same
call, before returning `status: inserted > 0 ? 'remediated' : 'warn'`. Good engineering, bad
instrumentation.

It measures state *after* its own write, so a stable 0% is compatible with any orphan inflow; it
records the pre-repair count to `integrity_checks`, so **the real signal exists and is persisted** —
unread; `LIMIT 200` right-censors that count; and its scope is the current `game_year`, MLB only.

So the packet's zero-orphan reading for Aug 2026 — 453 distinct `pitches.pitcher`, 444 distinct
`milb_pitches.batter`, all resolving — is **the baseline a monitor should defend, not evidence a
monitor works**. Three mechanisms produce it: `syncNewPlayers` at ingest, `ensurePlayers` inserting
MiLB `'Unknown'` placeholders, and the integrity cron. Any one could fail and the rate would hold at
zero for weeks.

**For a self-healing loop, measure inflow and residual separately:**

| Metric | Definition | Alert |
|---|---|---|
| `orphan_inflow` | pre-repair `found` per run | sustained ≥200 (censored); non-zero in the offseason |
| `orphan_residual` | `found − remediated` | >0 on two runs — the API refuses these IDs |
| `unknown_backlog` | `count(*) where name='Unknown'` | flat or rising instead of draining |
| `repair_latency` | first seen → name resolved | >72h |

Build `orphan_residual` first: an ID Savant emits that the Stats API does not know is a genuinely new
fact, and it is what `status:'warn'` already writes into a table nobody queries.

---

## 3. The unmatched rate nobody computes

The facility path has no self-healing loop because it has no rule to heal with: TrackMan emits a
facility-local `PitcherId`, the canonical athlete is `athlete_profiles.id`, and nothing maps one to
the other.

| Path | Link column | Declared | Populated |
|---|---|---|---|
| `compete_pitches` (TrackMan) | `athlete_profile_id` | nullable, `on delete set null` | **0 / 443 (0%)** |
| `compete_pitches` | `tm_pitcher_id` | text, indexed | 443 / 443 |
| `biomech_captures` (Captury) | `athlete_profile_id` | **`not null references`** | 100% by construction |
| `pitches` / `milb_pitches` | `pitcher`, `batter` | int, no FK | ~100% resolvable |

The cause is one omitted argument: `rowToDb(r, ctx)` accepts an optional `athlete_profile_id` and
defaults it to `null` (`lib/compete/pitchSchema.ts:282–287`); the upload route passes only
`{session_id, uploaded_by}` (`.../upload/route.ts:45`). The column is not broken — it has never been
written. **And this outranks the MLB orphan rate**: a `compete_pitches` row is not wrong, it is
*unattributable*, so every athlete-level Compete metric is computed over a population defined by
`uploaded_by` rather than who threw the pitch — a population-definition defect that invalidates the
denominator before any formula runs.

```sql
-- Facility linkage scorecard. 443 rows; safe whole-table. Do NOT pattern this onto `pitches`.
SELECT session_id, count(*) AS pitches,
       count(*) FILTER (WHERE athlete_profile_id IS NULL) AS unlinked_rows,
       count(DISTINCT tm_pitcher_id) FILTER (WHERE athlete_profile_id IS NULL) AS unlinked_subjects
FROM compete_pitches GROUP BY 1 ORDER BY 1;
```

`unlinked_subjects` sizes the human work — 443 rows may be three athletes, and three decisions clear
the backlog — while `unlinked_rows` sizes the exposure. Report both; one percentage conflates them.
Linking design: `entity-resolution/08-facility-athlete-linking.md`. **Fix the referential action:**
`on delete set null` silently converts a deleted athlete's pitches into unlinked rows,
indistinguishable from never-linked, where `restrict` or a soft-delete flag preserves *unlinked* vs
*de-linked* — the distinction a match-rate trend depends on
(`Jo/data-quality/03-constraint-design-postgres.md`).

---

## 4. Duplicate-person detection, and why the obvious alarm is useless

`players` holds 16,931 rows and 16,418 distinct names: **513 surplus rows** — rows sharing a name with
an earlier row. Colliding *groups* number fewer, because four-way ties exist (`Gonzalez, Jose` =
114931 / 467102 / 681275 / 683681). "513 duplicates" is already a definitional error.

**These are overwhelmingly distinct people**: over an 1871-to-present universe with a skewed surname
distribution, collisions are expected. Let *D* = true duplicate persons (one human, two `players.id`)
and *C* = 513. A name-equality alarm has **PPV ≤ D/C**, and only if every duplicate shares an exact
string:

| Assumed *D* | 5 | 20 | 50 |
|---|---|---|---|
| **Max PPV** | 1.0% | 3.9% | 9.7% |
| **Reviewer** | 99 false alarms per find | ~96% false positives | unusable as a page |

(estimated — arithmetic on the measured 513; *D* is unknown and should be measured **before** the
alarm is built.) The base-rate fallacy in standard form — and sensitivity is no better: the 457
`"First Last"` rows (§5) mean a duplicate written under two conventions evades it entirely.

**What the check requires.** `players` carries id, name, position, team, `lahman_id`, `updated_at` —
**no birth date** — so within-table evidence for "same human" does not exist. One disambiguator is
free: `fetchMlbPerson` already calls `/api/v1/people/{id}` and returns `{name, position}`, discarding
the rest (`lib/dataIntegrity.ts:26–42`), while `person.birthDate` is parsed from the same payload at
`app/api/game/player-meta/route.ts:31`. One column and two lines make `(name, birth_date)` a key.

**Non-overlapping career spans are the strongest signal available today**: same-named IDs with
disjoint `game_date` ranges are merge candidates, two appearing in the same game are conclusively
different people, and no new column is required — build this one if only one gets built. Weights and
blocking: `entity-resolution/04-record-linkage-deduplication.md`; string similarity:
`entity-resolution/03-name-matching-algorithms.md`. The **monitoring** claim: report candidates as a
reviewed Trend queue, never a page, until measured PPV clears ~50%.

---

## 5. Coverage and format drift are identity metrics

| Attribute | Populated | Rate | Reading |
|---|---|---|---|
| `players.team` | 0 / 16,931 | **0.00%** | Column exists, no writer — any team-keyed join over `players` returns nothing, silently |
| `players.position` | 10,899 / 16,931 | 64.4% | Written by roster/integrity paths, not by pitch ingest |
| `players.lahman_id` | 3,228 / 16,931 | 19.07% | Chadwick crosswalk coverage; ceiling set by players with a bbref ID |
| non-ASCII `name` | 553 / 16,931 | 3.27% | Diacritics survive — normalize (UAX #15) first |

`team` at exactly 0% is the instructive one: a "greater than zero" floor would have fired on day one,
while a week-over-week delta rule never fires at all, because 0% is stable. **Both a level and a
delta threshold are required; the level one catches the column that was never populated.**

**Format drift.** 16,474 names are `"Last, First"`, 457 are `"First Last"` (2.70%) — three writers,
two conventions. The integrity repair (`lib/dataIntegrity.ts:18–23`) and the roster cron
(`app/api/cron/roster/route.ts:44–47`) each format to `"Last, First"` with duplicated, unshared logic;
the pitch ingest inserts raw `p.fullName` for missing batters (`app/api/update/route.ts:53`) and is
the one that runs nightly. Name-keyed joins — the Lahman search's trigram comparison on
`name_last || ', ' || name_first` (`app/api/chat/route.ts:367`) among them — miss that 2.70% with no
error. The monitor is a one-line shape invariant, the fix one shared helper; ship both together,
since an invariant already violated is a suppression, not a check.

---

## 6. Join-integrity assertions, in priority order

Scale sets the order: `players` is **1,632 kB** against `pitches` at **9,711 MB** (~8,877,621 rows)
and `milb_pitches` at **2,366 MB**, so a `players` scan costs ~**1/6,100** of a `pitches` scan.
(computed — packet.)

| # | Assertion | Grain | Severity |
|---|---|---|---|
| 1 | Every distinct `pitches.pitcher`/`batter` in the last 7 days resolves | 7-day slice | Ticket (repair loop covers it) |
| 2 | Same for `milb_pitches` | 7-day slice | Ticket — **not checked at all today** |
| 3 | `compete_pitches.athlete_profile_id IS NOT NULL`, sessions >48h | 443 rows | Page once linking ships |
| 4 | `players.name='Unknown'` count not rising run over run | table | Ticket |
| 5 | `players.name` matches the `"Last, First"` shape | table | Trend |
| 6 | Same-name ID pairs with **overlapping** `game_date` ranges → permanent suppression list | aggregate | Trend |

Assertion 2 is the live gap: both orphan checks hard-code `FROM pitches` (`lib/dataIntegrity.ts:100,
160`) and MiLB ingest inserts `'Unknown'` placeholders, so MiLB identity quality is observed only
through a backlog the roster cron drains 500 rows at a time (`app/api/cron/roster/route.ts:14`).

**Planner caveat.** `last_analyze` and `last_autoanalyze` are NULL on every table inspected, 8.9M-row
`pitches` included (computed — packet), so these assertions get plans drawn from absent statistics: a
`NOT EXISTS` anti-join that is instant in testing can become a sequential scan against the 8s
statement timeout. Remedy: **`Jo/postgres-performance/05-vacuum-autovacuum-bloat.md`**. And run
identity assertions on their own schedule — batching them behind the ingest cron makes the monitor a
contributor to the timeout it exists to observe.

---

## 7. Detecting a match-rate regression

| Trap | Wrong move | Right move |
|---|---|---|
| Small daily denominator | Raw percentage — one unlinked row in an 8-row day reads "12.5%" | Alert on the **count** below ~200 trials, the **rate** above; carry n |
| Boundary at 0 or 1 | Wald interval, which crosses it | **Wilson**; a match rate legitimately sits at 1 |
| Autocorrelated series | Independent daily thresholds | **p-chart / EWMA** limits, trailing window |
| Slow decay | Fixed 95% floor | Level floor **and** slope test — Triton's failure mode is a slope |
| Seasonality | Compare to yesterday | Same phase of last season; churn peaks at call-ups |

Because the MLB orphan rate is pinned at 0 by the repair loop, **the series worth charting is
`orphan_inflow`, not the post-repair rate**: it has variance, seasonality and a meaningful control
limit, while the post-repair rate has none of the three and looks perfect through any outage of the
loop producing it (`statistical-inference/07-trend-detection-changepoints.md`). One documentation
assertion belongs beside these: `CLAUDE.md` records `players` as **4,017 rows** against a measured
**16,931**, a 4.21× stale figure (computed) that a row-count expectation stored next to the doc would
have caught (`metric-governance/09-metric-documentation-glossary.md`).

---

## 8. What Triton should do, in order

1. **Uncensor and read what already exists**: replace `LIMIT 200` with `count(*)` plus a capped
   `details` sample in both orphan checks, and emit `orphan_residual = found − remediated` as its own
   `integrity_checks` row.
2. **Add the §3 facility linkage scorecard as a ninth check** — 443 rows, 100% unlinked today, the
   only identity number currently wrong in a way that changes a displayed metric.
3. **Populate `athlete_profile_id` at upload** through the existing `rowToDb` third argument, and
   change `on delete set null` to `restrict` (`entity-resolution/08-facility-athlete-linking.md`).
4. **Add `players.birth_date`** and return `birthDate` from `fetchMlbPerson` — the one column that
   makes duplicate detection possible rather than speculative.
5. **Extract one `formatPlayerName` helper**, backfill the 457 `"First Last"` rows, add the shape
   invariant — fix and assertion in one commit.
6. **Extend the orphan checks to `milb_pitches`**; track the `'Unknown'` backlog as a drain rate, not
   a level; give `team`/`position`/`lahman_id` coverage a level floor and a week-over-week delta.
7. **Build the same-name / disjoint-career-span candidate queue** as a reviewed Trend list, and
   **measure its PPV on the first 50 reviews** before it alerts.

Steps 3–5 change schema, so they **update `docs/VARIABLES.md` in the same commit**.

**Anti-recommendation — do not build a duplicate-person alarm on `players.name`.** The obvious move
after seeing 513 collisions fails on three independent grounds. **(i) Precision.** PPV is bounded by
*D*/513, i.e. ≥90% false positives at any plausible prevalence, and the first four-way
`Gonzalez, Jose` review teaches the reviewer to ignore the queue — an alarm that trains its audience
to dismiss it spends the attention the real checks need
(`Jo/data-reliability/04-alerting-oncall-design.md` §6). **(ii) Sensitivity.** The 457 `"First Last"`
rows mean a duplicate stored under two conventions never fires it — noisy and blind at once, not a
conservative approximation. **(iii) Wrong question.** MLBAM assigns one ID per person, so a duplicate here
requires MLBAM to have issued two — rare; the frequent, expensive failure is the **unlinked facility
athlete, measured at 100%**.

**Single highest-leverage next action:** ship steps 1 and 2 as one PR. That turns a zero that means
nothing into two series that mean something, and puts the platform's one genuine 100% unmatched rate
onto the same nightly record as everything else, where
`Jo/data-quality/10-quality-metrics-scorecards.md` gives it a history and
`Jo/data-reliability/04-alerting-oncall-design.md` a severity.

---

## Sources

1. [Chadwick Bureau Register](https://github.com/chadwickbureau/register) — the `key_bbref`/`key_mlbam` shards `import-lahman.ts` fetches; bounds §5's 19.07% ceiling.
2. Fellegi & Sunter (1969), [*A Theory for Record Linkage*](https://doi.org/10.1080/01621459.1969.10501049) — why name equality is a blocking key, not a decision.
3. [Splink docs](https://moj-analytical-services.github.io/splink/) — linkage quality reported as precision/recall against labels, not as one rate.
4. [Precision and recall](https://en.wikipedia.org/wiki/Precision_and_recall) — vocabulary for quantity 3 and §4's PPV bound.
5. [Base rate fallacy](https://en.wikipedia.org/wiki/Base_rate_fallacy) — why a sensitive test against a rare condition yields mostly false positives.
6. [PostgreSQL — Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html) — `ON DELETE SET NULL` vs `RESTRICT`; §3's orphan-manufacturing clause.
7. [PostgreSQL — ALTER TABLE](https://www.postgresql.org/docs/current/sql-altertable.html) — `NOT VALID` + `VALIDATE CONSTRAINT`: adding an FK without a long lock.
8. [PostgreSQL — Planner Statistics](https://www.postgresql.org/docs/current/planner-stats.html) — why §6's NULL `last_analyze` changes an anti-join's plan.
9. [PostgreSQL — `pg_trgm`](https://www.postgresql.org/docs/current/pgtrgm.html) — the `similarity()` path the Lahman name search uses, exposed to §5's drift.
10. [Unicode UAX #15](https://unicode.org/reports/tr15/) — why the 553 non-ASCII names need NFC/NFKC before any equality test.
11. [Spanish naming customs](https://en.wikipedia.org/wiki/Spanish_naming_customs) — surname order; why §5's `"Last, First"` invariant is an approximation.
12. McKenzie, [*Falsehoods Programmers Believe About Names*](https://www.kalzumeus.com/2010/06/17/falsehoods-programmers-believe-about-names/) — name shape as a Trend signal, not a constraint.
13. [Great Expectations docs](https://docs.greatexpectations.io/) — `_to_not_be_null` / `_to_be_unique`, the vocabulary §6 maps onto.
14. [dbt — data tests](https://docs.getdbt.com/docs/build/data-tests) — `relationships` and `unique`: the declarative form of §6.
15. [Google SRE Book — Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/) — measure symptoms and inflow, not post-repair state.
16. [Google SRE Workbook — Alerting on SLOs](https://sre.google/workbook/alerting-on-slos/) — burn-rate alerting, the model for §7's level-plus-slope pairing.
17. [NIST/SEMATECH — p Control Charts](https://www.itl.nist.gov/div898/handbook/pmc/section3/pmc332.htm) — limits for a proportion with a varying n.
18. [Binomial proportion confidence interval](https://en.wikipedia.org/wiki/Binomial_proportion_confidence_interval) — Wilson vs Wald near a boundary.

**Triton-internal evidence.** Source read 2026-08-12; **no database queries were run by this doc** —
every number comes from the central packet gathered the same day. Code: the self-healing orphan checks
with `LIMIT 200` censoring and `FROM pitches` hard-coded, `lib/dataIntegrity.ts:97–150` (pitchers;
`:104`, `:100`) and `:156–210` (batters; `:165`, `:160`), with `formatPlayerName` `:18–23` and
`fetchMlbPerson` returning only `{name, position}` `:26–42`; the unformatted `p.fullName` insert
`app/api/update/route.ts:53` inside `syncNewPlayers` (`:17–61`); the duplicated formatter and 500-row
drain `app/api/cron/roster/route.ts:44–47, :14`; MiLB `'Unknown'` placeholders
`app/api/update/milb/route.ts:420–448`; `birthDate` parsed at `app/api/game/player-meta/route.ts:31`;
`integrity_checks` DDL `scripts/create-integrity-checks.sql:4–14` with the nightly insert and eight
registered checks `app/api/cron/integrity/route.ts:82, :27–34`; `compete_pitches.athlete_profile_id`
nullable + `on delete set null` `scripts/create-compete-pitches.sql:51` and `tm_pitcher_id` `:60`
against `biomech_captures.athlete_profile_id … not null references`
`scripts/create-biomech-captures.sql:18, 40`; the omitted third argument
`app/api/compete/performance/upload/route.ts:45` vs `lib/compete/pitchSchema.ts:282–287`; Chadwick
shards and backfill `scripts/import-lahman.ts:82–96, :223–245`; trigram name search
`app/api/chat/route.ts:367`; stale "4,017 players" in `CLAUDE.md`. All row counts, distinct names,
ID quartets, coverage percentages, name-format splits, table sizes and the NULL
`last_analyze`/`last_autoanalyze` finding are quoted from the 2026-08-12 packet.
