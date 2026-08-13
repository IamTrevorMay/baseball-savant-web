---
title: Retroactive Restatement — When the Facts Themselves Change
domain: temporal-modeling
tags:
  - restatement
  - provenance
  - bitemporality
  - pitch-reclassification
  - official-scoring
  - propagation
  - publication-snapshots
  - revision-policy
sources_reviewed: 18
last_updated: 2026-08-12
---

# Retroactive Restatement — When the Facts Themselves Change

> **Scope.** `metric-governance/02-metric-versioning-reproducibility.md` covers the formula and its
> baselines moving under fixed facts. This doc covers **the facts moving under a fixed formula** —
> same symptom, different cause, different fix. §1 is the discriminator.

## TL;DR

- **A restatement changes the input row; a rescore changes the function applied to it — Triton distinguishes neither, because it records neither.** (computed)
- **Restatement is structurally undetectable here: `pitches` and `milb_pitches` have no `created_at`/`updated_at`, and the ingest upserts with `ignoreDuplicates: false`** — a relabel overwrites the row, leaving no evidence it held another value. (computed — `app/api/update/route.ts:148`)
- **The bigger exposure is the opposite of absorbing bad restatements: Triton misses good ones.** The cron re-pulls a 3-day window, so anything revised after ~72 hours never arrives. (computed — `app/api/cron/pitches/route.ts:36–38`)
- **History is a vintage patchwork with no column to group by** — each season carries the classification vintage of whenever it was loaded (hence `ST`/`SV` back to 2015), on a seam at *load* time that no `game_date` filter can see. (computed)
- **One `pitch_type` relabel is not a one-row event:** it moves the pitch into a different `pitch_baselines` row *and* perturbs that row's mean — 8.9M pitches → **206** baseline rows → `stuff_plus` → **1,806** `league_averages` rows → leaderboards, of which only `league_averages` is timestamped. (computed)
- **Propagation is already broken at hop two, before any restatement:** `refreshPitchBaselines` recomputes the whole year but `applyStuffPlusForDateRange` rescores only the ingest window, so a moved baseline never reaches the rows already scored. (computed — `app/api/update/route.ts:249, 306–333`)
- **Serious publishers all have a revision policy and they disagree — BLS never revises the unadjusted CPI, BEA revises quarterly and archives every vintage — so having none is the only indefensible option.** (established)
- **The cheap capture is a diff, not a change log:** re-pull a few settled dates, compare on the natural key, store only changed cells — ≈20k ledger rows/season against 8.9M fact rows. (estimated)

---

## 1. Restatement vs. rescore vs. late arrival

Three events produce the identical complaint — *"this number changed"* — and need different fixes.

| | **Late arrival** | **Restatement** | **Rescore / vintage drift** |
|---|---|---|---|
| What moved | Row absent, now present | Row present, **cell changed** | Row unchanged, **function changed** |
| Cause | Delivery lag | Scoring change, reclassification, recalibration | Baseline refresh, constant edit, repair run |
| Triton case | Savant D+1/D+2 | `pitch_type` Slider→Sweeper; `events` recode | 2026-08-11 `stuff_plus`; 2026-05-08 wRC+ |
| Detect by | Row count by `game_date` | **Re-pull and diff** | Recompute stored value on today's inputs |
| Owner / doc | **Jo**, `03-late-arriving-data.md` | **Li**, here | **Li**, `metric-governance/02` |

**The discriminator is one query.** Re-pull the raw source row: if the *raw inputs* differ it is a
restatement, if only the derived column moved it is a rescore.
`statistical-inference/07-trend-detection-changepoints.md` §3 argues "changed pitcher vs. changed
measurement"; restatement is that table's third column — **changed record** — and the only one of the
three a re-pull settles definitively. (established)

---

## 2. Six kinds of restatement, ranked by exposure

| Kind | Mechanism | Window | Exposure |
|---|---|---|---|
| **Official scoring** | Scorer reverses hit/error, WP/PB, earned runs; club appeal | **≤72 h**, then final | Low — inside the re-sync (established) |
| **Pitch classification** | `pitch_type`/`pitch_name` is a **model output**, re-applied to history | **Unbounded** | **Highest** — the `pitch_baselines` join key (established) |
| **Instrument** | Hawk-Eye replaced TrackMan for 2020; velocity reference moved toward release | Season boundary | High, but league-wide and step-shaped (established) |
| **Event vocabulary** | Provider recodes `events` categories | Unbounded | Live: `milb_pitches.events` 53.5/46.5 in 2026 (computed) |
| **Derived upstream** | Savant recomputes `estimated_woba_using_speedangle`, `delta_run_exp` | Unbounded | Moderate; unmonitored (estimated) |
| **Identity** | Name corrections, retro ID merges | Unbounded | Silently dropped — below (computed) |

**Classification restatement is the expensive one** because it is a *population* change, not a value
change: Stuff+ z-scores a pitch against its `(pitch_name, game_year)` cohort, so a Slider relabelled
Sweeper is scored against a population with far larger mean horizontal movement and its movement z
falls with no physical change. Jo measured `ST`/`SV` at `MIN(game_year) = 2015` — classifications
that did not exist then — plus retired code `FT` back in 2026 at 13 rows. (computed)

**Identity restatement is dropped on the floor:** `syncNewPlayers` upserts with
`ignoreDuplicates: true` (`app/api/update/route.ts:60`), so a `players` row's name is never revised
once it exists — a no-op on conflict beside a destructive overwrite. Topic owned by
`entity-resolution/05-temporal-identity-changes.md`.

---

## 3. Triton's current posture, precisely

**3.1 The overwrite.** `{ onConflict: 'game_pk,at_bat_number,pitch_number', ignoreDuplicates: false }`
(`app/api/update/route.ts:148`) is a destructive upsert on the natural key. `ON CONFLICT DO UPDATE`
writes a new tuple version and the old one becomes dead space reclaimed by vacuum, not a record —
and neither fact table has a timestamp, so there is not even a *this row moved* bit. Stated exactly: **if Savant relabels a pitch tomorrow and the ingest
touches that row, nothing records that it changed, when, or what it was before** — unrecoverable in
the strict provenance sense of `metric-governance/10`. (computed)

**3.2 The 72-hour horizon.** `app/api/cron/pitches/route.ts:36–38` sets `start = today − 3 days`: a
good lateness policy and a bad restatement policy. It heals delivery lag and is blind to everything
else, so `pitches` freezes what MLBAM believed within ~72 hours of first pitch.

**3.3 The result is three vintage regimes with no discriminating column.** 2015–2025 carry the
classification vintage of whenever that season was bulk-loaded; 2026 rows carry the classifier as of
their ingest night; rows touched by later scripts (spring training, WBC, video backfills) carry that
script's run date. The seam is at **load** time, orthogonal to `game_date`. This is baseline
vintage drift (`metric-governance/02` §2.1) one layer upstream: the inputs are as unversioned as the
baselines. (computed)

---

## 4. Propagation: five hops, one timestamp

| # | Hop | Rows | Key | Timestamped? | On restatement |
|---|---|---|---|---|---|
| 1 | `pitches` | ~8,877,621 | `(game_pk, at_bat_number, pitch_number)` | **no** | cell overwritten silently |
| 2 | `pitch_baselines` | **206** | `(pitch_name, game_year)` | **no** — destructive upsert | pitch changes cohort; cohort mean shifts |
| 3 | `pitches.stuff_plus` | ~8.9M | — | no | only the ingest window is rescored |
| 4 | `league_averages` | 1,806 | `(season, level, role, metric)` | **yes** | rebuilt nightly, current season only |

**The break is between hops 2 and 3, and it predates any restatement.** `refreshPitchBaselines`
recomputes the entire `game_year` aggregate and overwrites it (`app/api/update/route.ts:249–277`);
`applyStuffPlusForDateRange` runs one UPDATE per `game_date` over the ingest window only (`:306–333`).
**Baseline changes do not propagate.** Restatement makes this worse: it moves hop 1 *and* hop 2 at
once, so a recent pitch is rescored against a cohort whose mean it just perturbed while millions of
older rows keep scores from a cohort that no longer exists.

**The 206-row leverage point.** Relabel 2% of sliders as sweepers and both cohort means move,
restating every slider and sweeper Stuff+ that season — not merely the relabelled pitches. Small
reference tables are where restatements amplify. (estimated)

---

## 5. Detection: re-pull and diff

Restatement cannot be detected from inside the database; the only evidence is the provider. Run
against settled dates, off-peak, one date per execution, logged to `docs/Queries.md`.

**Stratified sample, not a scan.** One date each from 2015, 2019 (pre-Hawk-Eye), 2021 (post-Hawk-Eye),
2024, and a 2026 date over 30 days old — ~12.5k rows, enough to bound a per-column change rate at
roughly ±1% and small enough to be harmless. Fetch the Savant CSV `syncPitches` uses, load it to a
scratch table `pitches_repull`, then:

```sql
-- Restatement diff probe. Human-run, one game_date per execution.
SELECT count(*) AS n,
  count(*) FILTER (WHERE p.pitch_name IS DISTINCT FROM r.pitch_name) AS d_pitch_name,
  count(*) FILTER (WHERE p.events     IS DISTINCT FROM r.events)     AS d_events,
  count(*) FILTER (WHERE round(p.release_speed::numeric,1)
                      IS DISTINCT FROM round(r.release_speed::numeric,1)) AS d_velo,
FROM pitches p JOIN pitches_repull r USING (game_pk, at_bat_number, pitch_number)
WHERE p.game_date = '2019-06-15';
```

Then *which direction* relabels went — same join, filtered to
`p.pitch_name IS DISTINCT FROM r.pitch_name`, `GROUP BY p.pitch_name, r.pitch_name`. An anti-join
each way also finds rows added or removed upstream, invisible to a column diff.

**Thresholds, pre-registered before looking** — the difference between a measurement and a
rationalization. On the `pitch_name` change rate: under **0.1%**, a footnote to document and build
nothing on; **0.1–1%**, real but sub-noise for aggregates, so ship the ledger plus an annual
prior-season re-pull; over **1%**, Stuff+ history is materially wrong and needs a re-pull plus a full
rescore, gated on `metric-governance/02` §5.

---

## 6. Capture: cell-grain ledger, not row-grain history

The instinct is Type-2 history on `pitches` (`dbt snapshot`'s model, Kimball SCD2). At 8.9M rows and
623,662 pages that instinct is wrong — see the anti-recommendation. Keep the **diff**, not versions:

```sql
CREATE TABLE pitch_restatements (
  restatement_id bigserial PRIMARY KEY,
  game_pk int NOT NULL, at_bat_number int NOT NULL, pitch_number int NOT NULL,
  game_date   date NOT NULL,
  column_name text NOT NULL,
  old_value   text, new_value text,     -- text: one table covers every column
  observed_at timestamptz NOT NULL DEFAULT now(),   -- transaction time
  source      text NOT NULL DEFAULT 'savant_repull'
);
CREATE INDEX ON pitch_restatements (column_name, observed_at);
```

Written by the differ *before* the upsert applies the new value. **Sizing:** at a 0.5% change rate
over ~700k pitches re-pulled per season, ≈20k rows/season — 0.2% of the fact table. (estimated) Two
properties matter more than the columns: **append-only** (enforce with a trigger — `service_role`
bypasses RLS, so a policy is not enforcement), and **cell-grain**, so "how often does `pitch_name`
move, and which way" is a `GROUP BY`, not a research project. It is the shape of
`metric-governance/02` §5's provenance tables — those record *which function ran*, this *which fact
changed* — and `observed_at` is transaction time in the strict sense, so the ledger is the bitemporal
layer sitting beside `pitches` rather than inside it.

---

## 7. Policy: restate, preserve, or annotate

Serious publishers all have a revision policy and they disagree — the choice is policy, not
engineering.

| Publisher | Policy | What Triton takes from it |
|---|---|---|
| **BLS (CPI)** | Unadjusted index **never revised**; seasonal factors revised 5 years back | A no-revision rule is legitimate *if declared* |
| **BEA / ALFRED** | Revise routinely; **archive every vintage** | If you restate, keep the old vintage retrievable |
| **Eurostat** | Routine / major / non-scheduled tiers; major revisions **announced in advance** | Classify a restatement before announcing it |
| **IAS 8** | Prior-period errors corrected retrospectively; impracticability exception | "We cannot reconstruct it" — disclosed, not silent |

**Li's recommended policy, four rules:**

1. **Raw facts: restate freely, log always.** `pitches` carries the provider's current belief, the
   ledger the difference. Never restate without a ledger row.
2. **Derived metrics: restate only in whole, comparable units.** A restatement touching
   `pitch_baselines` restates a *season*, not a pitch — rescore the season or none of it. A partial
   rescore is exactly the two-vintage defect of 2026-08-11.
3. **Published artifacts: never restate — snapshot at publish time**, as `daily_cards` already does:
   idempotent by date, regenerated only under explicit `?force=true`
   (`app/api/cron/daily-cards/route.ts:46–62`). Newsletter and overlays should store the value *and*
   its vintage the same way.
4. **Declare the horizon:** "provider data as of ingest + 3 days, plus an annual prior-season
   re-pull" — which converts an invisible defect into a known bound.

Whether a relabelled pitch *should* be rescored under the new label or preserved under the old is a
question about what Stuff+ measures — hand it to **Soto**
(`Soto/algorithm-design/09-model-validation-stabilization.md`).

---

## 8. Communicating a changed past

Three questions, in the order users ask them: *Did it change? By how much? Which one is right?*

- **Never silently improve a number.** The 2026-05-08 wRC+ restatement moved every 2026 hitter by
  5–6 points, and the only monitor watching flipped warn → pass — logging the restatement as a *fix*
  (`metric-governance/02` §2.2). Silent improvement and silent corruption look identical to a user.
- **Attach an as-of, not an apology.** "Stuff+ as of the 2026-08-11 scoring run" is a fact; "numbers
  may vary" is noise. ALFRED's framing — data *as reported on a date* — is the right model.
How that renders is **Cas**'s call — `Cas/analytics-ux/08-loading-empty-error-states.md`, where a
restated value is a distinct state from loading, empty, and error. Li supplies the vintage and the
magnitude; Cas decides what is shown.

---

## 9. What Triton should do, in order

1. **Run the §5 diff probe on five dates**, thresholds pre-registered. Everything below is sized by
   that number, and nobody knows it.
2. **Add `updated_at timestamptz DEFAULT now()` to `pitches` and `milb_pitches`** plus a trigger
   setting it on UPDATE — `ADD COLUMN` with a non-volatile default is metadata-only, no rewrite. One
   line, and future restatement becomes visible before any ledger exists.
3. **Ship `pitch_restatements` (§6), written from the differ** — Jo builds the differ, Li specifies
   grain and columns.
4. **Add a prior-season re-pull to the annual calendar** — chunked, offseason, ledger written before
   applying. This is the actual fix for the 72-hour horizon, and the point at which published numbers
   (newsletter, overlays) should start carrying their vintage per `daily_cards`.
5. **Fix the hop-2/hop-3 break:** if a baseline refresh materially moves a cohort, the season needs
   rescoring, not just the ingest window. Gate on `metric-governance/02` §3.3's drift probe so the
   two rescore policies stay one policy.
6. **Write the four-rule policy into `docs/VARIABLES.md`** beside the `stuff_plus` entry that still
   does not exist there, state the horizon publicly, and escalate relabel-vs-rescore semantics to
   **Soto** and the changed-past surface to **Cas**.

Steps 2–5 change schema or metric behavior, so they **update `docs/VARIABLES.md` in the same commit**.

**Anti-recommendation — do not make `pitches` bitemporal (SCD2 `valid_from`/`valid_to`, a new row per
revision).** It is the textbook answer, it is what `dbt snapshot` would do, and it is wrong on four
independent grounds. **(i) The arithmetic:** ~8,877,621 rows, 9,711 MB, 29 indexes, ~4.0% HOT — every version is a full
index write, and *every existing query* needs a `valid_to IS NULL` predicate it lacks today, silently
double-counting the first time someone forgets.
**(ii) You cannot backfill what you never captured:** all 8.9M rows would get a fabricated
`valid_from`, which is worse than none because fabricated provenance invites confident wrong
grouping. **(iii) The payload is redundant:** at a sub-1% change rate SCD2 stores ~99% identical
bytes to preserve ~1% of information, where the §6 ledger costs ~0.2%. **(iv) It fixes the wrong
bug:** bitemporal storage records restatements you *observe*, and Triton's dominant failure is not
observing them at all. Ship the re-pull first; storage design is downstream of having something to
store.

**Single highest-leverage next action:** run the §5 probe on **2019-06-15** and **2024-06-15** and
report the `pitch_name` change rate with its direction table. Under 0.1% and this doc is a footnote
plus a `docs/VARIABLES.md` paragraph; over 1% and Stuff+ history is wrong by a measurable amount, and
the season-close rescore in `metric-governance/02` §6(c) becomes urgent rather than tidy.

---

## Sources
1. [Fowler — *Bitemporal History*](https://martinfowler.com/articles/bitemporal-history.html) — the actual-vs-record split behind §1, §6.
2. [Snodgrass — *Time-Oriented Database Applications in SQL*](https://www2.cs.arizona.edu/~rts/tdbbook.pdf) — the transaction-time basis of `observed_at`.
3. [dbt — Snapshots](https://docs.getdbt.com/docs/build/snapshots) — the SCD2 pattern the anti-recommendation rejects.
4. [Kimball — SCD Types 0–7](https://www.kimballgroup.com/2013/02/design-tip-152-slowly-changing-dimension-types-0-4-5-6-7/) — Triton's behavior is Type 1: overwrite.
5. [PostgreSQL — `INSERT … ON CONFLICT`](https://www.postgresql.org/docs/current/sql-insert.html) — semantics of the §3.1 upsert.
6. [PostgreSQL wiki — Audit trigger 91plus](https://wiki.postgresql.org/wiki/Audit_trigger_91plus) — a row-diff audit table for §6.
7. [MLB Rule 9.01 — Official Scorer](https://baseballrulesacademy.com/official-rule/mlb/9-01-official-scorer-general-rules/) — the 72-hour appeal window in §2.
8. [Retrosheet — Summer 2025 release](https://www.retrosheet.org/summer2025release.html) — baseball's own record, revised semiannually.
9. [Petti — *Build a Statcast Database, v3.0*](https://billpetti.github.io/2021-04-02-build-statcast-database-rstats-version-3.0/) — whole-season reloads: Savant updates prior seasons.
10. [Baseball Savant — CSV field docs](https://baseballsavant.mlb.com/csv-docs) — `pitch_type` is classifier output.
11. [MLB Tech — *Statcast 2020: Hawk-Eye*](https://technology.mlblogs.com/introducing-statcast-2020-hawk-eye-and-google-cloud-a5f5c20321b8) — the 2020 instrument change in §2.
12. [MLB — Statcast glossary](https://www.mlb.com/glossary/statcast) — which tracked fields are modelled.
13. [ALFRED](https://alfred.stlouisfed.org/) — vintage archiving; "as reported on date X".
14. [Philadelphia Fed — Real-Time Data Set](https://www.philadelphiafed.org/surveys-and-data/real-time-data-research/real-time-data-set-for-macroeconomists) — revisions change conclusions.
15. [BLS — CPI Technical Notes](https://www.bls.gov/cpi/technical-notes/) — the "never revised" commitment in §7.
16. [Eurostat — Data revision policy](https://ec.europa.eu/eurostat/data/data-revision-policy) — revision tiers; advance announcement.
17. [IFRS — IAS 8](https://www.ifrs.org/issued-standards/list-of-standards/ias-8-accounting-policies-changes-in-accounting-estimates-and-errors/) — retrospective restatement; impracticability.
18. [W3C — PROV-DM](https://www.w3.org/TR/prov-dm/) — `wasRevisionOf`, unrepresentable after a destructive upsert.

**Triton-internal evidence.** Measured centrally 2026-08-12 unless noted. **No fact-table
timestamps:** neither `pitches` nor `milb_pitches` has `created_at`/`updated_at`; `pitches`
~8,877,621 rows / 9,711 MB / 623,662 pages / 2015-03-03→2026-08-10, `milb_pitches` ~2,508,422 rows /
2,366 MB / 2023-03-31→2026-08-11; `last_analyze`/`last_autoanalyze` NULL everywhere. **Destructive
upsert:** `app/api/update/route.ts:148`; identity no-op at `:60`. **72-hour horizon:**
`app/api/cron/pitches/route.ts:36–38`. **Chain:** `pitch_baselines` 206 rows keyed
`(pitch_name, game_year)`, no timestamp, `ON CONFLICT … DO UPDATE` at `app/api/update/route.ts:249–277`;
per-day scoring UPDATE at `:306–333`, baseline join `:328–330`; `league_averages` 1,806 rows with
`updated_at` (`scripts/create-league-averages.sql:25`); `pitcher_season_command` ~27,119 and
`pitcher_season_deception` ~17,386 rows; `player_season_stats` ~79,061 rows with `updated_at`
(`scripts/create-player-season-stats.sql:18`). **Publish snapshot:**
`app/api/cron/daily-cards/route.ts:46–62`. **Prior events:** the 2026-08-11 two-vintage `stuff_plus`
rescore (≈249k rows) with the 09:00/09:10 cron inversion and the 2026-05-08 wRC+ 5–6-point
restatement, from `Li/metric-governance/02` §2.2–§3; `league_averages` stale 46 days.
**Reclassification:** `ST`/`SV` at `MIN(game_year) = 2015`, `FT` 13 rows in 2026,
`milb_pitches.events` 53.5/46.5 — `docs/reliability-findings-2026-08-11.md` §6d, §12k, §12l.
**wRC+:** `SEASON_CONSTANTS`/`PARK_FACTORS` in `lib/constants-data.ts`, not `lib/sql.ts` (contra
`docs/VARIABLES.md` §1.4), keyed by team only — one frozen 2024 vintage over 2015–2026. **29 indexes
/ ~4.0% HOT** are Jo's, via `Li/metric-governance/02` §6.
