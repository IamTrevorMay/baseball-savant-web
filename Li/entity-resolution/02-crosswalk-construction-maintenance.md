---
title: Crosswalk Construction & Maintenance — The Table Every Join Depends On
domain: entity-resolution
tags:
  - crosswalk
  - chadwick-register
  - id-mapping
  - refresh-cadence
  - coverage-monitoring
  - master-data
  - retrosheet
  - lahman
sources_reviewed: 17
last_updated: 2026-08-12
---

# Crosswalk Construction & Maintenance — The Table Every Join Depends On

## TL;DR

- **Triton already has a Chadwick-backed crosswalk; `context/triton-context.md` is wrong to say it doesn't.** `retro_people` + `retro_id_map` + a conflicts log carry `retro_id ↔ mlbam_id ↔ bbref_id ↔ fg_id`, refreshed weekly by a GitHub Action. The gap is **reach**: nothing in `app/`, `lib/`, `components/` joins to it. **(computed)**
- **Two independent Chadwick pipelines exist and disagree.** `import-lahman.ts` and `ingest-retrosheet.ts` pull the same 16 register shards but keep different columns, tables, and schedules; the Lahman one fetches a personal fork last pushed 2022-10-31 whose stated upstream is now a 404. **(computed)**
- **`retro_people`'s primary key is `retro_id`, so anyone without a Retrosheet ID cannot be represented**: the mapper returns `null` on a missing `key_retro`, dropping every MLBAM-only register person, the recent debutants a scouting platform most cares about. **(computed)**
- **Half the conflict detector cannot fire**: it groups by `retro_id` seeking >1 distinct `mlbam_id`, but `retro_id` is the primary key, so that count is 1 by construction. An empty log is not evidence of a clean crosswalk. **(computed)**
- **`players.lahman_id` is write-only (3,228 of 16,931 rows, 19.07%, one writer, zero readers) and was built by probing a `key_bbref`-keyed map with Lahman's `playerID`**, so misses return NULL, indistinguishable from "no MLBAM ID." **(computed)**
- **Coverage is capped by release cadence, not matching quality**: Lahman is annual and MLB-only, so a 2026 debutant is unmappable until 2027 however good the linkage. **(established)**
- **`players.name` holds two incompatible formats because two ingest branches disagree**: 16,474 `"Last, First"` (Savant, pitcher) vs 457 `"First Last"` (MLB API, batter, unnormalized), and 513 duplicate-name collisions make name a non-key regardless. **(computed)**
- **The facility side is 0% linked: all 443 `compete_pitches` rows carry `tm_pitcher_id`, none carry `athlete_profile_id`**: column and index exist, the population step does not. **(computed)**
- **The right shape is one internal `person_id` plus a long `(id_space, external_id)` table, not more columns on `players`**: a wide crosswalk forces a NULL per absent space and can't express many-to-one, confidence, or valid-time. **(established)**

---

## 1. What Triton has today

| Artifact | Key | Populated | Read by | Refresh |
|---|---|---|---|---|
| `retro_people` (+ `retro_id_map` MV, conflicts log) | `retro_id` PK; `mlbam_id`, `bbref_id`, `fg_id` | ~22K rows (DDL comment) | `/api/explore/query` allow-list, **no product surface** | weekly GH Action |
| `players.lahman_id` | `players.id` (MLBAM) | **3,228 / 16,931 = 19.07%** | nothing | manual script run |
| `lahman_people.mlb_id` | `lahman_id` PK | ~20K rows | `/api/lahman/player`, MLBAM→Lahman | same manual run |
| `compete_pitches.athlete_profile_id` | FK → `athlete_profiles` | **0 / 443 rows** | Compete performance page | never populated |

A crosswalk *was* built, with a conflicts log and a `source_version` stamp; it just dead-ends in the explore allow-list while the product joins on `players.id` and hopes, and the codebase's one live crosswalk read goes to `lahman_people.mlb_id`, not weekly-refreshed `retro_people.mlbam_id`. Freshness is Jo's; Li asks the narrower question: **is the mapping correct, and do we know its coverage?** **(computed)**

---

## 2. The Chadwick register pipeline, twice

The [Chadwick Bureau Register](https://github.com/chadwickbureau/register) is the field's identity spine: one row per person, `key_mlbam`/`key_retro`/`key_bbref`/`key_fangraphs` plus bio, sharded across `data/people-{0..9,a..f}.csv`; `pybaseball` and `baseballr` wrap it. **(established)**

| | `scripts/ingest-retrosheet.ts` | `scripts/import-lahman.ts` |
|---|---|---|
| Register fetch | 16 shards, **24h disk cache** (`:159-190`) | 16 shards, no cache (`:85-96`) |
| Columns kept | retro/mlbam/bbref/fangraphs + bio | `key_bbref` → `key_mlbam` only |
| Rows dropped | **all rows with no `key_retro`** (`:437-438`) | none at parse; lost silently at lookup |
| Destination | `retro_people`, upsert on `retro_id` | in-memory dict → `lahman_people.mlb_id` |
| Version stamp | `source_version = register_<tag>` | none |
| Conflict detection | `detectIdConflicts` (§3.2) | none |
| Companion source | Retrosheet biofile | `cbwinslow/baseballdatabank` (**fork**) |
| Cadence | weekly, automated | manual, unscheduled |

Both are defensible, both drift, and no consumer can tell which produced a row. The register is *the* place new MLBAM↔retro links appear as players debut (`docs/retrosheet.md:96`), so two schedules means two coverage frontiers. **(computed)**

---

## 3. Three construction defects, in severity order

### 3.1 A source ID as the primary key (the structural one)

`retro_people.retro_id text primary key` (`create-retro-tables.sql:20-21`) makes Retrosheet's ID space the universe of representable people, and the mapper enforces it:

```ts
const retroId = r['key_retro']
if (!retroId) return null   // scripts/ingest-retrosheet.ts:437-438
```

Every register person with an MLBAM ID but no Retrosheet ID, normal in a debut season, is dropped before the database, so coverage of *modern* players is capped by the slowest of the four ID spaces. Canonical surrogate-key argument; general form in `11-id-schema-design.md`. **(computed / established)**

### 3.2 A conflict detector that can only half-fire

```sql
select retro_id, count(distinct mlbam_id) from public.retro_people
where mlbam_id is not null group by retro_id having count(distinct mlbam_id) > 1   -- :641-646
```

`retro_id` is the primary key: one row per group, so the count is 1 or 0, never >1; `multiple_mlbam_for_retro` has never been emitted and cannot be. The companion query is valid, but the runbook's "empty = clean" reading (`docs/retrosheet.md:163`) is a half-truth: the broken check is the one that would catch a register row *changing* its `key_mlbam` between releases, which the upsert overwrites with no history. INSERT-only with no natural key, the log stacks 52 copies of one problem a year. **(computed)**

### 3.3 The wrong join column in the Lahman backfill

```ts
if (bbref && mlb) bbrefToMlb[bbref] = mlb   // keyed on key_bbref — import-lahman.ts:89-91
mlb_id: bbrefToMlb[r.playerID] || null      // probed with Lahman playerID — :104
bbref_id: str(r.bbrefID) || r.playerID      // the right column, unused for the lookup — :106
```

`playerID` and `bbrefID` coincide for most modern players but are *not the same field*. Where they diverge the lookup returns `undefined`, `mlb_id` becomes NULL, and the row reads as an honest "no MLBAM ID exists." Worse, the loop reports `Backfilled ${updated} players`, counting **UPDATE calls**; a Supabase `.update().eq('id', …)` matching zero rows is not an error, so `updated` counts attempts, not matches.

Three faults ride along. The backfill runs one `update().eq()` per row (`:233-243`, ~20K round trips for one `UPDATE … FROM`); it never NULLs a mapping, so a changed upstream `mlb_id` leaves a stale `lahman_id` forever; and **`LAHMAN_CORE`/`LAHMAN_CONTRIB` (`:17-18`) point at `cbwinslow/baseballdatabank`, a personal fork last pushed 2022-10-31**, while the header (`:6`) claims it fetches `chadwickbureau/baseballdatabank`, a repo that no longer exists (404; the org now holds only `chadwick`, `register`, `retrosheet`, `retrosplits`, `data-boxscores`, and its site repo). The fork's raw CSVs still return 200, so this is silent staleness, not an outage: a 2022-vintage `People.csv` cannot map anyone debuting 2023+, plausibly most of the 19.07% shortfall. **(computed)**

---

## 4. The shape to build instead

One internal identity, one long-format external-ID table: MDM's *registry* style, a thin identity layer with sources authoritative for their own attributes. Right for one-person stewardship. **(established)**

```sql
-- person(person_id uuid pk, display_name, birth_date): Triton's own key, never a
--   source ID, never reused; birth_date is the blocking key surviving name churn.
create table public.person_external_id (  -- absence is a missing row, not a NULL
  person_id      uuid not null references public.person on delete cascade,
  id_space       text not null,   -- mlbam|retro|bbref|lahman|fangraphs|trackman|whoop
  external_id    text not null,
  source         text not null,   -- 'chadwick_register' | 'mlb_statsapi' | 'manual'
  source_version text not null,   -- register_<tag>; the reproducibility pin
  match_method   text not null,   -- authoritative|deterministic|probabilistic|manual
  confidence     numeric not null default 1.0,
  valid_from     date, valid_to date,   -- identity is time-scoped in some spaces
  primary key (person_id, id_space, external_id)
);
create unique index person_external_id_live_uq   -- the crosswalk invariant
  on public.person_external_id (id_space, external_id) where valid_to is null;
```

**Why long, not wide.** Seven ID spaces in seven columns forces a NULL for every space a person legitimately lacks, so "unmapped" and "not applicable" become indistinguishable, the null-vs-zero failure the metric side already has. Long format expresses many-to-one with no schema change, carries per-mapping provenance, and reduces coverage monitoring to `GROUP BY id_space`; an append-only `person_merge_log` makes merges reversible.

**What stays put.** `players.id` stays MLBAM and the FK target for `pitches`/`milb_pitches`: 11.4M rows are not worth re-keying and the orphan rate is already 0 (§7). `person` sits *beside* it, bridged by `id_space='mlbam'`.

---

## 5. Refresh cadence is a coverage parameter

A mapping's coverage frontier is set by the *slowest* source involved; no matching cleverness moves it.

| Source | Upstream cadence | Triton cadence | Cost of the lag |
|---|---|---|---|
| Chadwick Register | continuous; debutants in days-weeks | weekly, **24h cache** | days on new MLBAM↔retro links |
| Retrosheet events/gamelogs | annual + corrections | weekly poll, gated by a release detector | none material |
| Lahman / baseballdatabank | annual, post-season | **manual, unscheduled**, from a fork | a season of debutants unmappable |
| MLB Stats API `/people` | live | on demand, per unknown ID | none |
| TrackMan / Compete CSV | per upload | per upload | n/a — never linked |

**(1)** Poll the register at least as often as its fastest consumer: daily is cheap and it alone resolves a debutant. **(2)** Never let a cache silently span a decision: 24h suits a weekly job, not a re-run answering a coverage complaint. **(3)** A refresh is an append with a version stamp, not an overwrite: the `retro_id` upsert destroys a corrected mapping's predecessor and any way to explain why last month's leaderboard differed (`temporal-modeling/06-slowly-changing-dimensions.md`). A scheduled GitHub Action is **not a monitored job**: it reports into GitHub, not `cron_runs`. **(computed)**

---

## 6. New players — how identity actually enters `players`

| Path | Trigger | Name source | Format | Normalized? |
|---|---|---|---|---|
| `app/api/update/route.ts:38-40` | MLB ingest, pitcher | Savant `player_name` | `"Last, First"` | n/a (already) |
| `app/api/update/route.ts:44-56` | MLB ingest, batter | MLB API `fullName` | `"First Last"` | **no** |
| `update/milb/route.ts:436-448` | MiLB ingest | literal `'Unknown'`, `LIMIT 200`/run | — | placeholder |
| `cron/roster/route.ts:43-47` | nightly, `name='Unknown'`, `LIMIT 500` | MLB API `fullName` | `"Last, First"` | yes |
| `dataIntegrity.ts:18-23`; `janitor:450`; `populate-players:43` | integrity checks | MLB API | `"Last, First"` | yes |

**The 457 `"First Last"` rows are the batter branch**, the one insert path skipping normalization. The exemplars confirm the mechanism rather than merely fit it: `"Mel Rojas Jr."` survives intact, yet every normalizer in the repo is the same last-token heuristic (`parts.slice(-1)[0] + ', ' + parts.slice(0,-1).join(' ')`), which would yield `"Jr., Mel Rojas"`. That heuristic sits in **four** files and is wrong for generational suffixes and compound Spanish surnames alike (`03-name-matching-algorithms.md`). **A rule duplicated four times and skipped in a fifth is not a rule.** Extract it to `lib/playerName.ts`; backfill the 457. **(computed)**

**Why name cannot be the key.** 16,418 distinct values over 16,931 rows ⇒ **513 collisions** (four-way for `Gonzalez, Jose`, `Jackson, Alex`, `Vázquez, Christian`, `Wilson, Jacob`), and 553 rows (3.27%) carry diacritics the register and Savant spell differently. Key on name and the failure is a *merged* player, which no downstream metric detects. Both remediation paths fail silently too: an unresolvable MLBAM ID becomes a permanent `'Unknown'`, with no queue. **(computed)**

---

## 7. Coverage monitoring — measure the rate, alert on the derivative

The existing check measures the wrong edge: `validate-retrosheet.ts:73-100` asserts ≥99.5% of distinct `retro_events` batter/pitcher IDs *exist in `retro_people`*, a within-Retrosheet check silent on whether those people carry an `mlbam_id`, the mapping the platform would use. **Nothing in the repo measures MLBAM linkage coverage.** **(computed)**

| Metric | Definition | Today | Target | Alert |
|---|---|---|---|---|
| **Orphan rate** | actor IDs with no `players` row | **0** (453 MLB / 444 MiLB, Aug 2026) | 0 | any non-zero >24h |
| **Link rate MLBAM→retro** | `players` rows with a live `retro` mapping | unmeasured | ≥98% of players with ≥1 MLB pitch | −0.5pp week over week |
| **Link rate MLBAM→lahman** | `players.lahman_id` non-null | **19.07%** (3,228/16,931) | ≥95% of *retired MLB* | qualified subset only |
| **Facility link rate** | `compete_pitches` with `athlete_profile_id` | **0%** (0/443) | 100% at session close | any unlinked session |

**Denominate on the population that should match.** 19.07% looks catastrophic and mostly is not: Lahman covers MLB players through its last release, while `players` is inflated by MiLB placeholders since 2023 and historical players from the season-stats backfill. The right denominator is "players with ≥1 MLB PA or pitch through the last Lahman release"; an undenominated percentage is the error Li objects to on the metric side. **(computed / estimated)**

**Alert on the derivative, not the level.** Absolute coverage is a slow structural number; its week-over-week change leads on upstream schema changes and failed refreshes: a register renaming `key_mlbam` breaks the link rate on the next run and nothing else. Two caveats: the orphan queries (`lib/dataIntegrity.ts:96-105`, `:150-159`) carry `LIMIT 200`, so `found` **saturates at 200**, a floor not a count; and `players.team` is 0%-populated, so drop or fill it before someone filters on it. Depth: `09-identity-quality-monitoring.md`. **(computed)**

---

## 8. What Triton should do, in order

1. **Delete one of the two register pipelines.** Keep `ingest-retrosheet.ts` (versioned, conflict-checked, scheduled); have `import-lahman.ts` read `retro_people`.
2. **Fix `import-lahman.ts:104` to probe `r.bbrefID`** and make the backfill one `UPDATE … FROM` reporting rows *matched*. The before/after `lahman_id` count is the bug's size.
3. **Repoint `LAHMAN_CORE`/`LAHMAN_CONTRIB` off the dead fork.** The upstream the header names is gone, so pull SABR's distribution (<https://sabr.org/lahman-database/>) or vendor a pinned copy, stamp the release as `source_version`, and fix the `:6` comment to name what it fetches.
4. **Ship `person` + `person_external_id` (§4)**, seeded from `retro_people` at `match_method='authoritative'`, removing the `retro_id`-as-PK ceiling without touching the ingest.
5. **Replace `detectIdConflicts`'s first query** (many-to-one *and* mapping changes across register versions); give the log a natural key plus `resolved_at`, making it a work queue.
6. **Extract the name normalizer to `lib/playerName.ts`**, call it from the batter branch, backfill the 457 rows, and assert in Vitest that `players.name` matches `^[^,]+, .+$`; **Cas** owns the test.
7. **Add the four §7 metrics to the integrity-check run**, denominated properly, and drop the `LIMIT 200` saturation from the orphan counters.
8. **Populate `compete_pitches.athlete_profile_id` at upload time** from a `tm_pitcher_id →` profile map captured at onboarding (`08-facility-athlete-linking.md`); today 443 rows link by hand.
9. **Move the register refresh to daily**, reporting into `cron_runs`.

**Anti-recommendation — do not fuzzy-match names to raise the 19.07% Lahman link rate.** Obvious, and wrong on three independent grounds. **(i) It cannot work:** the unlinked majority is unlinkable *by construction*. Lahman's last release cannot contain a 2025 or 2026 debutant, and MiLB placeholders have no Lahman counterpart at any date, so it raises the number only by inventing links to different people. **(ii) The population makes it maximally dangerous:** 513 name collisions and 553 diacritic rows mean fuzzy matching fires exactly where it most likely merges two people, and a merged player yields a *plausible* wrong stat line nothing catches; an orphan at least is loud. **(iii) It fixes an unread column.** Do (1)-(4) first: an authoritative register mapping needs no probabilistic step, and probabilistic linkage (`04-record-linkage-deduplication.md`) is a last resort, for TrackMan and Captury, which share no identifier at all.

**Single highest-leverage next action:** run one read-only query, `select count(*) filter (where mlbam_id is not null) as linked, count(*) as total from retro_people`, plus the same split restricted to `mlbam_id`s in `players`. That turns the platform's oldest identity claim ("there is no maintained crosswalk") into a measured number, deciding whether step 4 is seed-and-ship or repair. Log it to `docs/Queries.md`.

---

## Sources

1. [Chadwick Bureau Register](https://github.com/chadwickbureau/register): shard layout and `key_*` columns both pipelines read.
2. [Lahman Database (SABR)](https://sabr.org/lahman-database/): the canonical Lahman distribution §3.3 repoints at; `chadwickbureau/baseballdatabank` now 404s.
3. [Retrosheet](https://www.retrosheet.org/): origin of `retro_id`; §5's release cadence.
4. [Retrosheet event files](https://www.retrosheet.org/eventfile.htm): what a `retro_id` identifies, hence §3.1's ceiling.
5. [Savant CSV field docs](https://baseballsavant.mlb.com/csv-docs): `player_name` as `"Last, First"`, §6's pitcher branch.
6. [MLB-StatsAPI](https://github.com/toddrob99/MLB-StatsAPI): `/people` shape behind `fullName`, §6's batter branch.
7. [pybaseball `playerid_lookup`](https://github.com/jldbc/pybaseball/blob/master/pybaseball/playerid_lookup.py): reference lookup: birth-year blocking, returns *all* matches.
8. [baseballr](https://billpetti.github.io/baseballr/): `chadwick_player_lu()`; the register as standard source.
9. Fellegi & Sunter (1969), [*A Theory for Record Linkage*](https://doi.org/10.1080/01621459.1969.10501049): match-weight framework behind the "last resort" ordering.
10. Herzog, Scheuren & Winkler (2007), [*Data Quality and Record Linkage Techniques*](https://doi.org/10.1007/0-387-69505-2): deterministic before probabilistic; false-merge vs false-split cost.
11. [Splink](https://moj-analytical-services.github.io/splink/): blocking-rule design and match-weight diagnostics; only after step 4.
12. [Record linkage](https://en.wikipedia.org/wiki/Record_linkage): §6's merge/split error taxonomy.
13. [Master data management](https://en.wikipedia.org/wiki/Master_data_management): registry/consolidation/coexistence; §4 picks registry.
14. [`pg_trgm`](https://www.postgresql.org/docs/current/pgtrgm.html): `similarity()`, used by the Lahman search; candidate generation only.
15. [`unaccent`](https://www.postgresql.org/docs/current/unaccent.html): the diacritic fold 553 accented names require.
16. [`REFRESH MATERIALIZED VIEW`](https://www.postgresql.org/docs/current/sql-refreshmaterializedview.html): the `CONCURRENTLY` unique-index rule `retro_id_map` depends on.
17. [Kimball — SCD types 0-7](https://www.kimballgroup.com/2013/02/design-tip-152-slowly-changing-dimension-types-0-4-5-6-7/): Type 2 effective-dating, what §5's destructive upsert forgoes.

**Triton-internal evidence.** Code read 2026-08-12; **no database queries were run for this doc**; counts come from the central packet of that date. Schema `create-retro-tables.sql:20-47`, `:225-238`, `:243-255`. Register fetch+cache `ingest-retrosheet.ts:159-190`; `key_retro` drop `:437-438`; conflict detector `:639-665`. Lahman `import-lahman.ts:6`, `:17-20`, `:84-97`, `:104` vs `:106`, `:224-245` (`lahman_id` at `:238`). Live crosswalk read `app/api/lahman/player/route.ts:15-22`. Validator `validate-retrosheet.ts:73-100`. Cadence `.github/workflows/retro-ingest.yml:3-5`; `docs/retrosheet.md:92-96, 163`. Name writers `app/api/update/route.ts:38-40, 53, 60`; `update/milb:436-448`; `cron/roster:43-56`; `lib/dataIntegrity.ts:18-23, 96-105, 150-159`; `cron/janitor:450-453`; `populate-players:43-46`. Facility IDs `create-compete-pitches.sql:51, 60-61, 148-149`; `lib/compete/pitchSchema.ts:287, 294`. Grep for `lahman_id` over `app/`, `lib/`, `components/` hits only `lahman_*`-table routes: **no reader of `players.lahman_id`**. **Packet:** `players` 16,931 rows, ids 110001-842249; `lahman_id` 3,228 (19.07%); `team` 0%; `position` 10,899 (64.4%); 16,474 `"Last, First"` / 457 `"First Last"`; 553 non-ASCII names; 16,418 distinct ⇒ 513 collisions incl. four-way `Gonzalez, Jose` (114931, 467102, 681275, 683681); `pitches` ~8.88M (2015→2026-08-10); `milb_pitches` ~2.51M (2023→2026-08-11); Aug 2026 orphans 0 across 453 MLB / 444 MiLB actors; `compete_pitches` 443 rows / 443 `tm_pitcher_id` / 0 `athlete_profile_id`; `last_analyze` NULL on every table inspected.
