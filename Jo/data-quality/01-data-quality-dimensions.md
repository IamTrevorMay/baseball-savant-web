---
title: Data Quality Dimensions — Turning Vocabulary Into Assertions You Can Run
domain: data-quality
tags:
  - data-quality-dimensions
  - completeness
  - accuracy
  - consistency
  - timeliness
  - validity
  - uniqueness
  - dama-dmbok
sources_reviewed: 22
last_updated: 2026-08-11
---

# Data Quality Dimensions — Turning Vocabulary Into Assertions You Can Run

## TL;DR

- **A dimension earns its place only when it yields a SQL expression, a window, and a threshold.** DAMA UK names six, DMBOK2 eight, ISO/IEC 25012 fifteen. The disagreement is real and nearly irrelevant — these are coverage checklists, not an ontology. (inferred)
- **Completeness must be measured per derived column, not per table.** Triton's 2026 Stuff+ collapse ran Apr 99.5% → Aug 0% with *perfect* row counts, and the displayed league average moved 0.8 (100.97 → 100.13) because `AVG()` skips NULLs. Every table-grain check would have stayed green. (measured)
- **The Stuff+ fix held.** 2026 `pitches` now reads 654,833 of 657,570 scored — **99.58% coverage, 0 values outside [0,200]**. Re-measured, not assumed. (measured, 2026-08-11)
- **`milb_pitches.events` is no longer Title Case, and the repo still says it is.** 2023/2024/2025 are **100.0% Title Case**; 2026 is **53.5% Title / 46.5% lowercase**. `CLAUDE.md` and sibling `06-reconciliation-source-of-truth.md` document the old rule, so a query following the documented convention silently drops ~46.5% of 2026 MiLB events. (measured, 2026-08-11)
- **That break was authored by a fix, not a bug.** Commit `410212b` (2026-06-08) added `EVENT_NORMALIZE_MAP` at `app/api/update/milb/route.ts:244`. Go-forward writes became correct; **no backfill ran**, so the column split along an *ingest-date* seam invisible to any `game_date` filter. (measured)
- **ISO 8000-8's syntactic / semantic / pragmatic split beats any six-dimension list.** `Strikeout` vs `strikeout` is semantically identical, syntactically divergent — so the fix is a vocabulary contract plus backfill, not a re-ingest. (documented)
- **Validity is the cheapest dimension to enforce and Triton enforces none of it.** `pitches` carries exactly two constraints — the primary key and `UNIQUE (game_pk, at_bat_number, pitch_number)` — and **zero `CHECK` constraints**. `stuff_plus` is clamped to [0,200] in three SQL strings and in no schema. (measured)
- **Accuracy is the only dimension you cannot measure from inside your own database.** Everything else is introspection; accuracy needs a second source and a written tie-breaker. (documented)
- **Uniqueness is the one dimension Triton gets right, and it is the template.** The `(game_pk, at_bat_number, pitch_number)` unique index makes the ingest upsert idempotent *by construction* — which is why a 3-day re-ingest window is safe. Enforced, not monitored. (measured)
- **Prefer a constraint to a monitor, and a monitor to a convention.** A convention in `CLAUDE.md` is exactly what just failed for MiLB casing. Constraints bind every write path; monitors bind none but observe all; conventions bind only people who read them. (inferred)

---

## 1. Why the lists disagree, and why it matters less than it looks

| Authority | Count | Set |
|---|---|---|
| **DAMA UK** (2013) | 6 | Completeness, Uniqueness, Consistency, Accuracy, Validity, Timeliness |
| **DAMA DMBOK2** | 8 | The six, plus **Integrity** and **Reasonability** (Currency added in revision) |
| **ISO/IEC 25012** | 15 | Inherent: accuracy, completeness, consistency, credibility, currentness. System-dependent adds availability, compliance, confidentiality, traceability, precision *(verify partition)* |
| **Soda** (DAMA-derived) | 11 | Adds Precision, Privacy, Reasonableness, Referential Integrity |

DAMA UK's abstract says the six exist to reduce "much confusion within the data quality community"; DAMA-NL published a research paper because the field still could not agree. **Stop adjudicating.**

> A dimension is real if you can name (1) a SQL expression returning a number, (2) the window it runs over, (3) the threshold meaning "bad," and (4) what happens on breach.

**The split worth adopting** is ISO 8000-8's, because it cuts by *what kind of fix applies*: **syntactic** quality (conforms to specified format/encoding — machine-checkable), **semantic** quality (denotes what it claims, against a dictionary), **pragmatic** quality (fit for purpose — only a human rules). Triton's MiLB break (§5) is syntactic with zero semantic content, which is why the remedy is a vocabulary contract and a backfill rather than a re-ingest.

---

## 2. The master table

| Dimension | SQL measurement | Triton instance | Depth in |
|---|---|---|---|
| **Completeness** | `count(col)::numeric / count(*)`, **per column** | Stuff+ Apr 99.5% → Aug 0%, row counts perfect | `03-volume-completeness-monitoring.md` (reliability), `07-null-semantics-missingness.md` |
| **Accuracy** | `abs(ours - theirs) <= tolerance` vs a 2nd source | `pitches` vs MLB Stats API — never compared | `06-reconciliation-source-of-truth.md` |
| **Consistency** | `count(DISTINCT normalize(col))` vs `count(DISTINCT col)` | `milb_pitches.events` 53.5/46.5 split in 2026 | `06-reconciliation…`, `09-schema-evolution-contracts.md` |
| **Timeliness** | expected partitions present ÷ expected | Schedule-anchored freshness SLI | `Jo/data-reliability/02-data-freshness-slos.md` |
| **Validity** | `count(*) FILTER (WHERE NOT rule)` | `stuff_plus` clamped in code, **no `CHECK`** | `03-constraint-design-postgres.md` |
| **Uniqueness** | `count(*) - count(DISTINCT key)` | `UNIQUE (game_pk, at_bat_number, pitch_number)` | `08-duplicate-detection-idempotency.md` |
| **Integrity** | `LEFT JOIN … WHERE parent.id IS NULL` | `pitches.pitcher` → `players.id`: no FK | `03-constraint-design-postgres.md` |
| **Conformity** | `col NOT IN (SELECT value FROM allowed)` | No enum, domain type, or allow-list anywhere | `09-schema-evolution-contracts.md` |
| **Precision** | declared numeric scale vs required | `NUMERIC` scale on movement/velocity *(verify)* | `09-schema-evolution-contracts.md` |
| **Reasonability** | z-score / PSI vs trailing baseline | League Stuff+ held ~100 as coverage hit zero | `04-distribution-drift-detection.md`, `05-anomaly-detection-timeseries.md` |
| **Credibility** | provenance recorded per row | No `source`/`ingested_at` on `pitches` *(verify)* | `06-reconciliation-source-of-truth.md` |

**Only Accuracy requires leaving the database** — every other row is introspection. And the two dimensions Triton enforces at schema level (Uniqueness, and Integrity via the PK) are the two that have never caused an incident.

---

## 3. Completeness — per derived column, or not at all

**Definition.** The proportion of required data present; ISO/IEC 25012 lists it as inherent. Almost always implemented at table grain — did rows arrive? — which is the grain at which Triton's worst incident was invisible.

| Month (2026) | Ingested | With `stuff_plus` | Coverage | League avg shown |
|---|---|---|---|---|
| Apr | 117,333 | 116,795 | 99.5% | 100.97 |
| May | 121,779 | 109,911 | 90.3% | 100.77 |
| Jun | 115,920 | 20,676 | 17.8% | 100.46 |
| Jul | 109,421 | 4,504 | 4.1% | 100.13 |
| Aug | 36,621 | 0 | **0%** | *(null)* |

Row counts were correct every month. The on-screen metric moved 0.8 across a total collapse because `AVG()` silently redefined its population to the shrinking, non-random subset that still had values — `07-null-semantics-missingness.md`.

**Three grains, all required:** *row* (did the expected rows arrive — Volume); *attribute* (of rows that arrived, what fraction have this column); *population* (is every entity that should exist represented — every scheduled game, not just every pitch of the games we got). Grain 2 failed. Grain 3 is the one nobody builds.

```sql
SELECT count(*)                                                  AS rows_total,
       count(stuff_plus)                                         AS rows_scored,
       round(100.0 * count(stuff_plus) / nullif(count(*), 0), 2) AS coverage_pct
FROM pitches
WHERE game_date >= current_date - INTERVAL '7 days'
  AND pitch_type NOT IN ('PO','IN');
```

Run it per derived column, not once for the table. The `pitch_type` exclusion matters: pitchouts and intentional balls are legitimately unscored, and including them puts a permanent ~1% floor under the number that masks the first week of real decay. **Defining the denominator is most of the work.**

**Threshold.** ≥95% over trailing 7 days, with *trend* alerted separately. Triton's decay ran ~3%/week — a static floor catches that in May; only a slope monitor catches it in April.

**Unmeasured:** the number keeps rendering, consumers keep deciding, and the discoverer is a human asking an unrelated question. Ninety days, here.

---

## 4. Accuracy — you cannot measure it from inside

**Definition.** How correctly data describes the real-world event. Distinct from validity: `999` mph is invalid; `94` when the pitch was 96 is inaccurate but perfectly valid.

**Why it is structurally different.** Every other dimension is *introspective* — the data contains the evidence. Accuracy does not. A column can be 100% complete, valid, unique, internally consistent, and every value wrong by 2 mph. Soda is candid that this resists automation because it needs domain knowledge: *"Does my data reflect reality? To know this, do I have enough industry know-how to detect when it doesn't?"*

```sql
SELECT pitcher,
       count(*) FILTER (WHERE events = 'strikeout') AS k,
       count(*) FILTER (WHERE events = 'walk')      AS bb
FROM pitches
WHERE game_date BETWEEN $1 AND $2 AND game_type = 'R'
GROUP BY pitcher;   -- diff against MLB Stats API season totals
```

Two hazards from `06-reconciliation-source-of-truth.md` bite immediately: **`player_season_stats` has no K or BB columns**, so this needs a live API pull or Retrosheet until two columns are added; and **MLB Stats API `inningsPitched` is base-3** — `62.1` means 62⅓, so comparing it decimally is wrong by up to 0.23 IP per pitcher, always in one direction.

**Threshold.** Derive tolerance from how the number was produced, not from how much error feels acceptable. Discrete counts under a shared definition (K, BB, HR) → **exact, tolerance zero**. Same value at different rounding → the rounding unit. Different instruments (TrackMan vs Hawk-Eye) → statistical agreement, where expecting zero disagreement is itself the bug.

**Unmeasured:** you inherit the provider's errors and restatements blind, unable to tell "Statcast reclassified this pitch retroactively" from "our ingest dropped rows." Triton holds seven overlapping sources of baseball fact and reconciles none.

---

## 5. Consistency — the dimension currently broken in production

**Definition.** Absence of contradiction between representations of the same fact — within a column, across tables, or across systems.

**Measured 2026-08-11 — `milb_pitches.events`:**

| Season | Rows with `events` | Title Case | lowercase | % Title |
|---|---|---|---|---|
| 2023 | 172,713 | 172,713 | 0 | **100.0%** |
| 2024 | 172,435 | 172,435 | 0 | **100.0%** |
| 2025 | 171,545 | 171,545 | 0 | **100.0%** |
| 2026 | 131,310 | 70,266 | 61,044 | **53.5%** |

Both vocabularies coexist in 2026: `field_out` (23,457), `Strikeout` (15,824), `strikeout` (13,128), `Groundout` (11,209), `Single` (10,067), `single` (8,976).

**The mechanism.** Commit `410212b` (2026-06-08) added `EVENT_NORMALIZE_MAP` and applied it at ingest:

```ts
// app/api/update/milb/route.ts:244
events: event ? (EVENT_NORMALIZE_MAP[event] ?? event.toLowerCase().replace(/ /g, '_')) : null,
```

A *correct* change — MiLB rows now speak MLB's vocabulary. But **no backfill accompanied it**, so the column split along an **ingest-date seam**, invisible to any `game_date` filter because the 3-day ingest window smears it across game dates. *(Seam date inferred from the commit; verify — Supabase returned 520/522 when I tried.)*

1. **The documented convention is now wrong.** `CLAUDE.md` and `06-reconciliation-source-of-truth.md` both say "MiLB is Title Case — normalize in queries." Following that — matching `'Strikeout'`, or calling `initcap()` — silently discards **46.5% of 2026 MiLB events**. It was accurate when written and became a liability without changing.
2. **It is a category split, not just casing.** The map collapses `Groundout`, `Flyout`, `Lineout`, `Pop Out` and `Forceout` into `field_out`, so a `GROUP BY events` on 2026 MiLB returns `Groundout` *and* `field_out` as separate categories over overlapping populations.
3. **The fix that improves the future degrades the past** — the shape of most authored consistency regressions, and why `11-remediation-backfill-safety.md` insists a vocabulary change and its backfill ship as one unit of work.

```sql
SELECT count(DISTINCT events)                           AS raw_values,
       count(DISTINCT lower(replace(events, ' ', '_'))) AS normalized_values,
       count(*) FILTER (WHERE events ~ '^[A-Z]')        AS title_case_rows
FROM milb_pitches
WHERE game_date >= current_date - INTERVAL '30 days' AND events IS NOT NULL;
```

`raw_values > normalized_values` is the assertion. One cheap query, no baseline, and it would have gone red on 2026-06-09.

**Threshold.** Zero tolerance. Representational consistency is binary — either one encoding is in use or the column is bimodal. Do not set this at 95%.

**Unmeasured** — the worst signature in the catalogue: **joins and filters return fewer rows rather than erroring.** A cross-level K% comparison that forgets to normalize returns zero MiLB strikeouts and reports perfect agreement. The check itself lies. Worse than the Stuff+ outage, where the NULLs were at least visible if you looked.

---

## 6. Timeliness — three measurements wearing one name

**Definition.** Separate them: **currency** (how old is this row relative to the fact it describes — ISO/IEC 25012's *currentness*); **timeliness** (available when needed); **volatility** (how fast the truth changes, setting tolerable staleness). A row can be current and untimely — ingested minutes ago, arriving after the newsletter rendered.

**The one design decision.** Baseball freshness is **schedule-driven, not clock-driven**. `max(game_date) >= current_date - 1` is correct in July and fires every day from November through February. The comparator is not `now()` — it is the most recent date on which games were actually played, and the SLI is a proportion of expected data present.

```sql
SELECT (SELECT max(game_date) FROM pitches)                              AS latest_pitch_date,
       (SELECT max(game_date) FROM pitches WHERE stuff_plus IS NOT NULL) AS latest_scored_date;
```

The gap between those two columns is the entire Stuff+ outage in one row: **source freshness and derived freshness are different SLIs**, and source freshness was perfect for all three months. Full treatment — including why "time since last successful run" is the documented batch approximation and precisely the wrong choice here — is in `Jo/data-reliability/02-data-freshness-slos.md`. Google's SRE Workbook names freshness, correctness and **coverage** as the three data-processing SLI types, corroborating that coverage is standard SRE vocabulary rather than a Jo invention.

**Threshold.** ≥99% of dates on which games were played have pitches, trailing 7 days. Not "newest row is < 24h old."

**Unmeasured:** no alerting in season, or an off-season alert every day until someone mutes it — after which, also no alerting in season.

---

## 7. Validity — the clamp that is not a constraint

**Definition.** Conformance to declared syntax, type, range, and format.

**The Triton instance.** `stuff_plus` is clamped to [0,200] in three separate SQL strings — `app/api/update/route.ts:322`, `app/api/update/milb/route.ts:499`, `app/api/admin/backfill-stuff-plus/route.ts:124` — all `GREATEST(0, LEAST(200, ROUND(...)))`. And in the database:

```sql
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'pitches'::regclass;
--  pitches_pkey                                   | PRIMARY KEY (id)
--  pitches_game_pk_at_bat_number_pitch_number_key | UNIQUE (game_pk, at_bat_number, pitch_number)
```

**Two rows. Zero `CHECK` constraints on an 8.89M-row table.** The rule exists three times in code and zero times where it would bind every writer. An ad-hoc `run_mutation`, a rescore, or next year's migration can write `350` and nothing objects — the same structural weakness as the MiLB casing convention, and it will fail the same way.

```sql
SELECT count(*) FILTER (WHERE stuff_plus < 0 OR stuff_plus > 200)           AS sp_out_of_range,
       count(*) FILTER (WHERE release_speed IS NOT NULL
                          AND (release_speed < 40 OR release_speed > 110))  AS velo_implausible,
       count(*) FILTER (WHERE pitch_type IS NULL)                           AS null_pitch_type
FROM pitches WHERE game_date >= '2026-01-01';
--   0  |  198  |  2,733     (measured 2026-08-11)
```

Three numbers, three verdicts. **Out of range: 0** — the clamp holds *today*, because today only those three paths write it. That is validity that happens to hold, not validity that is enforced. **`velo_implausible`: 198** — real Statcast noise, which is why ingested columns need a tolerance rather than a zero floor. **`null_pitch_type`: 2,733** — completeness, not validity, and mostly legitimate.

**Threshold.** **Derived** columns you compute: zero tolerance, enforced with a `CHECK`. **Ingested** columns: a small non-zero rate with an alert on *change* in that rate — the provider owns the defect, you own only the detection.

**Why the constraint, not the monitor.** A `CHECK` binds the SQL editor, the backfill script, the cron and the migration; a monitor binds nothing and tells you afterward. On `pitches` it must be added `NOT VALID` and validated separately — a validating `ADD CONSTRAINT` scans 8.89M rows and blows both the 8s `statement_timeout` and the 8s `lock_timeout` on `authenticator` (`03-constraint-design-postgres.md`).

**Unmeasured:** out-of-range values propagate into baselines and percentiles, where they are averaged rather than rejected — corrupting the *reference* everything else is judged against. One `stuff_plus = 350` in a pitch-type baseline shifts every downstream plus-stat for that pitch type.

---

## 8. Uniqueness — the dimension Triton gets right

**Definition.** Each real-world entity recorded exactly once. Duplicates inflate counts and double-weight averages, plausibly.

**The Triton instance, and it is a good one.** `UNIQUE (game_pk, at_bat_number, pitch_number)` is a genuine natural key — the tuple identifying a pitch in the real world, not a surrogate. Because it exists, the nightly `ON CONFLICT` upsert is **idempotent by construction**: re-running the ingest over an overlapping 3-day window cannot duplicate a pitch. That is why the 3-day window is safe at all, and it does more reliability work than any monitor in the repo. **The dimension is not monitored; it is made structurally impossible to violate.**

```sql
-- For tables lacking the constraint — check milb_pitches, wbc_pitches, compete_pitches (verify).
SELECT count(*) - count(DISTINCT (game_pk, at_bat_number, pitch_number)) AS dupe_rows
FROM milb_pitches WHERE game_date >= current_date - INTERVAL '30 days';
```

Great Expectations formalizes the same family: `ExpectColumnValuesToBeUnique`, **`ExpectCompoundColumnsToBeUnique`** for composite natural keys like this one, and `ExpectColumnProportionOfUniqueValuesToBeBetween` when perfect uniqueness is not expected but a plausible ratio is. Its docs flag the standard trap — decide explicitly whether NULLs count as distinct, because SQL's default (`NULL != NULL`, so unique indexes permit multiple NULLs) is rarely what you meant.

**Threshold.** Zero, enforced by a unique index. If you cannot enforce zero, you have not identified the natural key yet — `08-duplicate-detection-idempotency.md` argues that is the real problem, not a monitor to build.

**Unmeasured:** silent double-counting after a re-run or partial backfill. Uniquely among these dimensions, duplicates make aggregates look *more* confident — sample sizes rise, so the number appears better-supported exactly when it is wrong.

---

## 9. The extended set — real, but subordinate

The master table in §2 gives each one's measurement and sibling doc. What they *add* beyond the canonical six, and Triton's status:

- **Integrity** (DMBOK2's 7th; Monte Carlo's "one you can't ignore") — referential validity plus preservation across the lifecycle. `pitches.pitcher` has **no FK** to `players.id`; orphans are healed nightly in app code. The FK is unsafe *today* only because `syncNewPlayers` runs **after** the pitch upsert loop, so a debutant's pitches would be rejected and lost. Reorder, then add it.
- **Conformity** — §5's break stated as a positive requirement. Enforce with an allow-list table or domain type, not a per-column `CHECK`.
- **Precision** — granularity the use case needs, and invisible to every other check: velocity at 1 mph resolution passes completeness, validity, uniqueness and consistency while destroying release-speed variance analysis.
- **Reasonability** (DMBOK2's 8th) — the Stuff+ outage from another angle: not "is this NULL" but "has the population generating this average changed shape."
- **Credibility** — per-row provenance. None stored on `pitches` *(verify)*, making Statcast restatements indistinguishable from ingest loss.

---

## 10. Turning any dimension into an assertion

1. **Expression** — SQL returning one number. If you cannot write it, the dimension is not operationalized for your schema, however well you can define it abstractly.
2. **Window** — the population, and where most checks are quietly wrong. `WHERE game_date >= current_date - 7`, with and without `AND pitch_type NOT IN ('PO','IN')`, differ by a permanent ~1% floor that masks the first week of any decay.
3. **Threshold** — from how the value is produced. Derived in-house and deterministic → zero tolerance, enforce with a constraint. Ingested from a provider you don't control → non-zero baseline, alert on change in the rate. Cross-instrument → statistical agreement, where zero disagreement is evidence of a bug.
4. **Action** — a check whose breach produces a log line is a check that does not exist. That is precisely what made the Stuff+ error invisible: it *was* caught, `console.error`'d, and discarded.

**Slope versus threshold.** Triton's canonical failure decayed ~3%/week. A static floor catches it eventually; a slope monitor catches it a month earlier. For any dimension that degrades gradually — completeness and reasonability especially — trend the number, don't just threshold it.

---

## 11. What Triton should do, in order

1. **Backfill `milb_pitches.events` to a single vocabulary and correct the docs describing the old one.** Live, measured, currently wrong in production, affecting 46.5% of 2026 MiLB events — and both `CLAUDE.md` and `Jo/data-quality/06-reconciliation-source-of-truth.md` tell readers to write queries that now silently drop rows. Chunk by `game_date` per `11-remediation-backfill-safety.md`; the 8s cap applies.
2. **Add the §5 consistency assertion** to the nightly `/api/cron/integrity` job for `pitches.events` and `milb_pitches.events`. One cheap query; it would have fired 2026-06-09 instead of 2026-08-11. *This is the detector the incident is owed.*
3. **Add per-derived-column coverage assertions** — `stuff_plus`, command, deception — at ≥95% trailing 7 days, denominator excluding `pitch_type IN ('PO','IN')`. Alert on breach *and* four-week negative slope.
4. **Add `CHECK (stuff_plus BETWEEN 0 AND 200) NOT VALID` to `pitches`**, then `VALIDATE` separately. Converts the most important derived-column rule from a convention repeated in three files into something binding every write path. Blast radius: `NOT VALID` takes a brief `ACCESS EXCLUSIVE` on the catalog entry and does not scan; `VALIDATE` takes `SHARE UPDATE EXCLUSIVE` and scans 8.89M rows for minutes without blocking writes. Neither can go through `run_mutation` — use the SQL editor or `psql`.
5. **Reorder `syncNewPlayers` before the pitch upsert loop, then add the `pitches.pitcher → players.id` FK.** Removes a class of integrity defect permanently and closes a real data-loss path for debutants.
6. **Build one accuracy reconciliation** — pitcher-season K and BB against the MLB Stats API — with exact-match tolerance and a tie-breaker written down *before* the first break. Adding K/BB to `player_season_stats` is a prerequisite for the stored-table version.
7. **Record per-row provenance on `pitches`** (`source`, `ingested_at`) so credibility becomes measurable and provider restatements stop looking like ingest loss.

**Anti-recommendation: do not build a composite data-quality score.** A weighted blend of the dimensions into one 0–100 number is the most requested and least useful artifact in this discipline. It cannot be acted on — a drop from 94 to 91 does not say which dimension moved, in which table, or whether anyone should care — and it conceals the exact failure Triton has already lived: a 46.5% consistency break in one column of one table would move a table-weighted composite by well under a point. Track each dimension separately and keep its history queryable. Relatedly, **do not adopt all eleven of Soda's dimensions or all fifteen of ISO/IEC 25012's** because a standard names them. Triton has zero instrumented today; the correct next number is three, not fifteen.

---

## Sources

1. DAMA UK — [The Six Primary Dimensions for Data Quality Assessment](https://www.dama-uk.org/resources/the-six-primary-dimensions-for-data-quality-assessment) — the canonical six.
2. DAMA UK — [Six Primary Dimensions white paper (PDF, R37)](https://www.dqglobal.com/wp-content/uploads/2013/11/DAMA-UK-DQ-Dimensions-White-Paper-R37.pdf) — abstract: exists to reduce disagreement over definitions.
3. DAMA-NL — [Dimensions of Data Quality (DDQ) Research Paper v1.2](https://dama-nl.org/wp-content/uploads/2020/09/DDQ-Dimensions-of-Data-Quality-Research-Paper-version-1.2-d.d.-3-Sept-2020.pdf)
4. DAMA-NL — [How to Select the Right Dimensions of Data Quality v1.1](https://dama-nl.org/wp-content/uploads/2020/11/How-to-Select-the-Right-Dimensions-of-Data-Quality-v1.1-d.d.-14-Nov-2020.pdf) — the "don't adopt all of them" argument.
5. DAMA International — [DMBOK2 Revisions](https://www.damadmbok.org/dmbok2-revisions) — the eight dimensions; Currency added.
6. arc42 — [ISO 8000 — Data Quality](https://quality.arc42.org/standards/iso-8000) — the syntactic/semantic/pragmatic triad of ISO 8000-8.
7. arc42 — [ISO/IEC 25012 — Data Quality Model](https://quality.arc42.org/standards/iso-iec-25012) — 15 characteristics; inherent vs system-dependent.
8. Nemko Digital — [ISO/IEC 25012 Data Quality](https://digital.nemko.com/standards/iso-iec-25012)
9. Gualo et al. — [Data Quality Certification using ISO/IEC 25012 (arXiv:2102.11527)](https://arxiv.org/pdf/2102.11527)
10. Pacific Certifications — [ISO 8000 & ISO 25012](https://blog.pacificcert.com/iso-8000-iso-25012-data-quality-digital-transformation/)
11. Soda — [Data Quality Dimensions: The No-BS Guide](https://soda.io/blog/guide-to-data-quality-dimensions) — the 11-dimension set; accuracy/privacy/reasonableness resist full automation.
12. Soda — [What Can Automated Checks Cover?](https://www.soda.io/resources/no-bs-guide-to-data-quality-dimensions)
13. Soda — [12 Data Quality Metrics That Actually Matter](https://soda.io/blog/data-quality-metrics-12-examples) — dimensions as categories, metrics as the alertable numbers.
14. Monte Carlo — [The 6 Data Quality Dimensions (Plus 1 You Can't Ignore)](https://montecarlo.ai/blog-6-data-quality-dimensions-examples) — the six plus Integrity.
15. Monte Carlo — [Monitoring the Six Dimensions of Data Quality](https://www.montecarlodata.com/blog-monitoring-the-six-dimensions-of-data-quality-with-monte-carlo/)
16. Monte Carlo — [Data Quality Dimensions (product docs)](https://docs.getmontecarlo.com/changelog/data-quality-dimensions)
17. Great Expectations — [Validate Data Uniqueness with GX](https://docs.greatexpectations.io/docs/reference/learn/data_quality_use_cases/uniqueness/) — five uniqueness expectations; the NULL-distinctness trap.
18. calogica — [dbt-expectations](https://github.com/calogica/dbt-expectations)
19. Datafold — [Using dbt-expectations to Detect Data Quality Issues](https://www.datafold.com/blog/dbt-expectations/)
20. iceDQ — [6 Data Quality Dimensions: Measurement Methods](https://icedq.com/6-data-quality-dimensions)
21. Kansas City Fed — [Discussing Data: Evaluating Data Quality](https://www.kansascityfed.org/documents/4986/tb-Discussing%20Data:%20Evaluating%20Data%20Quality.pdf) — non-vendor treatment.
22. Google — [SRE Workbook: Implementing SLOs](https://sre.google/workbook/implementing-slos/) — freshness, correctness and coverage as the three data-processing SLI types.

**Triton-internal evidence (measured 2026-08-11):** `pg_constraint` on `pitches` returns only `pitches_pkey` and the `(game_pk, at_bat_number, pitch_number)` unique key — zero `CHECK` constraints. 2026 `pitches`: 657,570 rows, 654,833 with `stuff_plus` (99.58%), 0 outside [0,200], 198 `release_speed` outside 40–110, 2,733 NULL `pitch_type`. `milb_pitches.events` by season: 2023/2024/2025 = 100.0% Title Case; 2026 = 70,266 Title / 61,044 lowercase. `EVENT_NORMALIZE_MAP` added in commit `410212b` (2026-06-08) at `app/api/update/milb/route.ts:244`; clamp sites at `app/api/update/route.ts:322`, `app/api/update/milb/route.ts:499`, `app/api/admin/backfill-stuff-plus/route.ts:124`. Stuff+ decay table from `docs/Queries.md` and `Jo/context/triton-context.md`. Queries ran via `run_query_long`; several returned Cloudflare 520/522 from the Supabase origin, which is why the casing seam date is marked *(verify)*.
