---
title: ID & Key Schema Design — Who Owns Your Primary Key
domain: entity-resolution
tags:
  - surrogate-keys
  - natural-keys
  - external-id-mapping
  - referential-integrity
  - master-data
  - schema-migration
  - mlbam-id
sources_reviewed: 17
last_updated: 2026-08-12
---

# ID & Key Schema Design — Who Owns Your Primary Key

> Grades: **(established)** published; **(computed)** verified against Triton source or the 2026-08-12
> measurement packet, read not queried; **(estimated)** from theory; **(folk-sabermetrics)** unverified.

## TL;DR

- **A key has an owner, and the owner decides what it means. `players.id` *is* the MLBAM ID**, so MLBAM owns Triton's person identity — 16,931 rows, `id` 110001–842249, no internal surrogate anywhere. (computed)
- **The cost is not corruption, it's dependency: existence is delegated upstream.** When a `pitches.pitcher` has no `players` row, the repair is an HTTP call to `statsapi.mlb.com/api/v1/people` — Triton cannot mint an identity, only ask. (computed — `lib/dataIntegrity.ts:95–140`)
- **Zero foreign keys point at `players`**, so all **1,519** `pitcher`/`batter` column references across **185 files** are unenforced joins — and an identity error has neither a table to be recorded in nor a constraint to catch it. (computed)
- **Triton runs both conventions, and the newer one is right**: `compete_pitches` has a uuid PK *plus* `tm_pitch_uid text unique` — surrogate for identity, natural key for dedup. (computed — `create-compete-pitches.sql:49`)
- **The fix is a mapping table, not a new primary key.** External IDs belong in rows, not columns; `players.lahman_id` is a column and is **19.07% populated** (3,228/16,931) — what column-per-source decays into. (computed)
- **`name` is not the fallback: 513 duplicate-name collisions** across 16,418 distinct names — yet `bullpen_pitchers` enforces `unique (lower(name))`. (computed)
- **Renumbering identity across 11.39M pitch rows is not worth it** — a 4.87 GB heap rewrite under an 8s statement timeout, ~2,000+ chunked statements, 185 files edited, and no displayed number changes. The additive path — keep `players.id`, add `player_external_ids`, add `NOT VALID` FKs, reserve a key band — buys ~90% of the benefit for ~2% of the cost. (computed / estimated)
- **Triton's best identity artifact is built and nearly unused**: `retro_people` + `retro_id_map` + `retro_id_map_conflicts` is a registry-style crosswalk with an ambiguity log — it just doesn't cover MLBAM↔Lahman↔TrackMan. (computed — `create-retro-tables.sql:228–252`)
- **An unresolved-identity rate is a denominator, not a chore.** A leaderboard over `players` while a source goes partly unmatched is a leaderboard over an unstated population. (established)

---

## 1. Three kinds of key, and the one everybody mislabels

The usual split is natural vs surrogate. Too coarse: it hides *who controls the value*.

| | **Natural** | **Surrogate** | **Source-owned** |
|---|---|---|---|
| Who can change it | reality | nobody | a vendor, unilaterally |
| Survives an upstream correction? | no | yes | **no** |
| Can you mint one for a new entity? | yes | yes | **no** |
| Can you merge two rows that are one person? | painfully | trivially | **only if the vendor does** |
| Triton example | `(pitch_name, game_year)` | `compete_pitches.id` | **`players.id` = MLBAM ID** |

An MLBAM ID *looks* natural — opaque, numeric, never changes in practice. It is a foreign system's
surrogate, borrowed. Of the three properties wanted from a surrogate — stability, meaninglessness,
control over allocation — you get two, and **the one you lose, allocation, is the one entity
resolution runs on**: the set of people Triton can talk about is defined by MLBAM. Kimball's durable
"supernatural" key exists for exactly this problem (established).

**The test:** *can I insert a row for an entity this source has never heard of?* Triton's answer is no —
which is why `bullpen_pitchers` was forked as a separate uuid-keyed table headed "Separate from Tools' MLB
`players` table" (computed — `create-bullpen-pitchers.sql:1–16`).

---

## 2. What Triton actually keys on

| Table | Primary key | Style | Rows |
|---|---|---|---|
| `players` | `id` (int) | **source-owned (MLBAM)** | 16,931 |
| `pitches` / `milb_pitches` | *none* — upsert on `(game_pk, at_bat_number, pitch_number)` | source-owned composite | ~8,877,621 / ~2,508,422 |
| `player_season_stats`, `pitcher_season_command`/`_deception` | player/pitcher + season (+ pitch_type) | source-owned + natural | ~79,061 / ~27,119 / ~17,386 |
| `compete_pitches`, `trackman_pitches`, `biomech_*` | `id` uuid | **surrogate** | 443 / — |
| `bullpen_pitchers` | `id` uuid + `unique(lower(name))` | surrogate + **name key** | — |

Two coherent designs split by vintage: the MLB pipeline keys on MLBAM, Compete/Neptune on a uuid.
**Neither is wrong alone. The defect is the seam.** `athlete_profiles.player_id` is the only bridge —
soft, nullable, undeclared (`app/api/mechanics/report/route.ts:39–42`) — and
`compete_pitches.athlete_profile_id`, correctly typed and FK'd, is **0% populated across all 443 rows**
(computed). The surrogate is declared; nobody fills it — free to declare, expensive to maintain.

### 2.1 The reference count

`pitches`/`milb_pitches` carry identity as bare integers plus a denormalized `player_name`. No
constraint, no FK, no trigger relates `pitches.pitcher` to `players.id`: **1,519 occurrences of
`pitcher`/`batter` as a column reference across 185 files**, **0 declared foreign keys to `players`**
(computed). Three consequences, only the first about correctness.

**Nothing catches an orphan at write time** — they surface in a nightly `LEFT JOIN … IS NULL` sweep
capped at `LIMIT 200` (`lib/dataIntegrity.ts:95–140`). **PostgREST cannot embed**: Supabase resource
embedding (`select('*, players(name)')`) needs declared FKs, so every name join is hand-written SQL —
which is *why* `pitches.player_name` is denormalized. And the planner loses join-uniqueness information
(→ `Jo/postgres-performance/09-schema-design-analytical.md`).

---

## 3. What a source-owned PK actually costs

Three failure modes by likelihood, plus two more: identity errors with no internal key to attach a
correction to, and a silent upstream correction restating your joins. "The vendor renumbers everyone" is
*not* among them — that is the folk fear, and MLBAM has never done it (folk-sabermetrics).

| # | Failure mode | Triton exposure |
|---|---|---|
| 1 | **Cannot represent a non-source entity** (no allocation authority) | **high** — every amateur, Neptune client, bullpen arm; already forced a table fork |
| 2 | **Cannot merge or split a person** (the merge target is the vendor's row) | medium — MLBAM does consolidate records; you inherit it silently |
| 3 | **Crosswalks decay into columns** (no home for a second ID) | **live** — `lahman_id` at 19.07% |

### 3.1 Column-per-source decay, quantified

`players` is exactly six columns — `id`, `name`, `position`, `team`, `updated_at`, `lahman_id`. Two are
identity-adjacent and both broken: `lahman_id` **3,228 / 16,931 = 19.07%**, the schema's only external-ID
mapping; `team` **0 / 16,931 = 0.00%**, a slowly-changing attribute no writer ever writes.

`lahman_id` is filled by `scripts/import-lahman.ts:223–240`, a one-shot Chadwick-register backfill that
runs when someone runs it: no cadence, no coverage monitor, no column at all for Fangraphs, bbref,
TrackMan, Whoop or Captury. **A schema change per new source is the smell that this should have been a
mapping table.**

`retro_people` does the job right and wrong at once: `mlbam_id`/`bbref_id`/`fg_id` as columns (wrong
shape), but with `retro_id_map` as a refreshable materialized view **and** `retro_id_map_conflicts`, an
ambiguity log carrying reasons like `'multiple_mlbam_for_retro'` (`create-retro-tables.sql:243–252`) —
the most sophisticated identity artifact in the repo.

### 3.2 The dependency in action

`checkOrphanedPitchers`/`checkOrphanedBatters` repair a missing `players` row by asking the MLB Stats
API for a name and position; if the API is down or has never heard of the ID, the person stays unknown.
MiLB ingest doesn't try — it inserts `{ id, name: 'Unknown', position: null }`
(`app/api/update/milb/route.ts:436–447`). So `players.name = 'Unknown'` is a **structural state of the
identity table**, not an error state: a source-owned PK works, at the price of a permanent
reconciliation loop against a system you don't control.

---

## 4. Why `name` is not the escape hatch

The reflex when a source ID is missing is to key on the name. Triton has the measurement that kills it:
**513 duplicate-name collisions across 16,931 rows (16,418 distinct names)** — ~3.0% of people share a
name with someone else in the same table (computed). Two live sites do it anyway:

| Site | Mechanism | Risk |
|---|---|---|
| `bullpen_pitchers` | `unique index … (lower(name))` (`create-bullpen-pitchers.sql:16`) | **two people with one name cannot both exist** |
| `POST /api/pitchers` | `.ilike('name', name).maybeSingle()` | wrong person on collision; errors at ≥2 matches |

Name matching as a *linkage signal* is legitimate — see `03-name-matching-algorithms.md` and
`04-record-linkage-deduplication.md`. Name as a *key* is a different claim, and false for person data
generally (established).

---

## 5. The reference design

Kimball, Data Vault hubs and MDM registry style land on one shape: **an internal surrogate nothing
outside can touch, plus a mapping table for every external identifier, with the source named on every
row.**

```sql
-- person(person_id uuid PK, merged_into uuid REFERENCES person)  -- durable internal identity
CREATE TABLE person_external_id (          -- every external ID is a ROW; new source = an INSERT
  person_id    uuid NOT NULL REFERENCES person(person_id),
  source       text NOT NULL,   -- 'mlbam'|'lahman'|'retrosheet'|'bbref'|'fangraphs'|'trackman'|'whoop'
  external_id  text NOT NULL,
  confidence   real NOT NULL DEFAULT 1.0,  -- <1.0 = probabilistic match
  method       text NOT NULL,              -- 'register'|'exact_name_dob'|'manual'|'fuzzy'
  valid_from   date, valid_to date,        -- → 05-temporal-identity-changes.md
  PRIMARY KEY (source, external_id)        -- one person per (source, id)
);
```

Four properties the current schema lacks. `PRIMARY KEY (source, external_id)` turns "two people claim one
MLBAM ID" into a constraint violation rather than a query someone must remember to run; `confidence` +
`method` let a fuzzy match coexist with a register match without impersonating one; `person.merged_into`
makes a merge reversible (under a source-owned PK, merging is `UPDATE … SET pitcher =` across 11.39M rows
and the old identity is gone); `valid_from`/`valid_to` admit that mappings are temporal.

**Do not build this yet.** §6 is why.

---

## 6. The migration arithmetic — and why the answer is no

Recommending a surrogate-key migration without pricing it is malpractice. The price:

| Component | Size |
|---|---|
| `pitches` / `milb_pitches` | ~8,877,621 rows, 623,662 pages ≈ **4.87 GB heap** / ~2,508,422 rows, 2,366 MB (computed) |
| References to rewrite | **~22.8M** `pitcher`+`batter` values across **11.39M** rows — a full rewrite, not a HOT-friendly touch; 4 new uuid columns ≈ 730 MB before indexes; ~**2,000+** statements at ~180 game days × 12 seasons, sized by the 8s timeout the Stuff+ scorer already hits (computed / estimated) |
| Code sites | **1,519 references across 185 files**, plus every `run_query` RPC, the report SQL builders, `docs/VARIABLES.md` and the MCP tool schemas; four new indexes at ~250–350 MB each (computed / estimated) |

Two problems are harder than the bytes. **The dual-write window is the whole migration** — six writers
(MLB ingest, MiLB ingest, WBC, spring backfills, janitor, season-stats) must maintain both keys, and a
missed one produces an orphan in the *new* space that nothing detects, because that space has no coverage
baseline. And **you'd be renumbering the wrong thing**: every §3 failure mode concerns people *outside*
MLBAM, who already live on uuids in `athlete_profiles` and number in the hundreds.

**Verdict: reject the renumbering.** Execution details are Jo's
(`Jo/postgres-performance/09-schema-design-analytical.md`) and should stay theoretical.

### 6.1 Additive identity instead

| Move | Cost | Buys | Verdict |
|---|---|---|---|
| **(a)** Renumber the pitch tables onto a surrogate | §6 | conceptual purity | **Reject** |
| **(b)** `player_external_ids`; `players.id` stays the MLBAM value *and* becomes the declared person key | one table + 3,228-row backfill | source-per-row, conflict detection, room for seven ID spaces | **Adopt** |
| **(c)** FK `… NOT VALID` on the pitch tables, `VALIDATE` later | metadata-only, then one scan each | new rows enforced; PostgREST embedding works | **Adopt** |
| **(e)** Populate `compete_pitches.athlete_profile_id` + `athlete_profiles.player_id` | 443 rows | closes the MLB↔Compete seam | **Adopt — best value/effort** |
| **(f)** Drop `unique(lower(name))` on `bullpen_pitchers`; add nullable `player_id` | one migration | stops the 513-collision class | **Adopt** |

**(b) is load-bearing.** It changes no primary key; it changes what `players.id` *means* — today "the
MLBAM ID," afterward "Triton's person key, which for MLB players happens to equal the MLBAM ID." The
mapping table then holds `('mlbam', …)` as one row among many, and the day Triton needs a person MLBAM
never heard of, `players.id` can be allocated from a sequence above 900000 — outside the observed range
of 110001–842249 — without touching a pitch row. Partitioning the key space so locally-minted IDs cannot
collide with vendor-minted ones is a real, if inelegant, technique for this inheritance (estimated).
Write the reserved band into `docs/VARIABLES.md`; an undocumented key-space convention is
indistinguishable from a bug.

---

## 7. Keys for events, not people

`pitches` has **no primary key of its own**. Idempotency comes from upserting on
`onConflict: 'game_pk,at_bat_number,pitch_number'` (`app/api/update/route.ts:148`) — a source-owned
composite. `scripts/create-pitch-videos.sql:4–5` says it outright: *"the `pitches` table has no single
pitch id, so this composite is the join key back to pitch metadata."*

`compete_pitches` is the template: **uuid surrogate PK for identity, `tm_pitch_uid text unique` for
source-driven idempotency** (`create-compete-pitches.sql:49–55`: "TrackMan natural key — enables
idempotent re-uploads"). Two keys, two jobs.

The cheap fix is to **declare the composite as an actual `PRIMARY KEY`** — the unique index it implies
almost certainly already exists to serve the upsert. A key enforced only in TypeScript is enforced only
by the call site that remembers it, and the WBC and spring backfills each re-implement the same upsert.
Promotion cost is Jo's call; sequencing semantics are `temporal-modeling/08-event-sequencing-integrity.md`.

---

## 8. What Triton should do, in order

1. **Populate `compete_pitches.athlete_profile_id` and `athlete_profiles.player_id`** for the 443 Compete
   rows and wire it into the upload path — the only place MLB identity and facility identity can meet,
   0% populated today, and hours of work.
2. **Create `player_external_ids (source, external_id, player_id, confidence, method, asserted_at)`**
   with `PRIMARY KEY (source, external_id)`, seeded from the 3,228 `lahman_id` values and from
   `retro_people`. Keep `players.lahman_id`, dual-read, drop it later.
3. **Add `NOT VALID` foreign keys** from `pitches`/`milb_pitches` `.pitcher`/`.batter` and
   `player_season_stats.player_id` to `players.id`. Metadata-only, no scan, new orphans impossible.
   Hand `VALIDATE` and its lock profile to Jo.
4. **Fix `bullpen_pitchers`**: drop `unique(lower(name))`, add a nullable `player_id`, stop resolving
   people by `ilike` in `POST /api/pitchers`.
5. **Document the key-space convention in `docs/VARIABLES.md`** — `players.id` equals the MLBAM ID,
   IDs ≥ 900000 are reserved for Triton-minted persons, `player_external_ids` is the only home for a
   non-MLBAM identifier.
6. **Turn identity coverage into monitored numbers**: uncapped orphan counts, `'Unknown'` count,
   external-ID coverage per source, `athlete_profile_id` NULL rate — dbt's `relationships` test is the
   declarative form. Thresholds → Jo, surface → Cas.
7. **Promote `(game_pk, at_bat_number, pitch_number)` to a declared PRIMARY KEY** on both pitch tables,
   so the upsert contract lives in the schema, not four client call sites. Revisit the §5 `person` model
   only if the non-MLBAM population passes a few thousand people, and scope it to Compete.
Steps 2, 3, 5 and 7 change schema, so they **update `docs/VARIABLES.md` in the same commit.**

**Anti-recommendation — do not introduce an internal surrogate person key and renumber `pitches` /
`milb_pitches` onto it.** The textbook answer, wrong here on three independent grounds. **(i) Cost:**
11.39M rows, ~22.8M identity references, a 4.87 GB heap rewrite in ~2,000+ chunked statements under an
8-second timeout, four new indexes, 1,519 code references across 185 files — and no displayed number
changes. **(ii) It solves a problem Triton does not have:** the MLBAM ID is stable, unique and complete
*for MLB players*; every §3 failure mode concerns people MLBAM never heard of, who already live on uuids
in `athlete_profiles`. **(iii) It would make identity worse while running** — a dual-key window across six
writers has no coverage baseline to catch a missed one, so it introduces a novel orphan class to fix a
hypothetical one. Step 2 delivers the real benefit at ~2% of the cost.

**Single highest-leverage next action:** ship `player_external_ids` with
`PRIMARY KEY (source, external_id)` and backfill it from the 3,228 `players.lahman_id` values plus
`retro_people`'s `mlbam_id`/`bbref_id`/`fg_id`. That one table converts a 19.07%-populated column into a
measurable, extensible, conflict-detecting crosswalk, and it gates every other identity fix here.

---

## Sources

1. [Surrogate key — Wikipedia](https://en.wikipedia.org/wiki/Surrogate_key) — §1's property checklist.
2. [Kimball — Surrogate Key](https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/surrogate-key/) — operational keys ≠ warehouse keys.
3. [Fowler — Identity Field](https://martinfowler.com/eaaCatalog/identityField.html) — meaningful vs meaningless keys.
4. [Fowler — ParallelChange](https://martinfowler.com/bliki/ParallelChange.html) — expand/migrate/contract; §6's dual-write hazard.
5. [PostgreSQL — Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html) — FK semantics; "0 FKs = 0 enforcement."
6. [PostgreSQL — ALTER TABLE](https://www.postgresql.org/docs/current/sql-altertable.html) — `NOT VALID` + deferred `VALIDATE`, why §6.1(c) is cheap.
7. [PostgreSQL — UUID Type](https://www.postgresql.org/docs/current/datatype-uuid.html) — the 16-byte figure behind §6's 730 MB.
8. [Cybertec — UUID, serial, or identity columns](https://www.cybertec-postgresql.com/en/uuid-serial-or-identity-columns-for-postgresql-auto-generated-primary-keys/) — uuid index locality at 443 rows vs 8.9M.
9. [PostgREST — Resource Embedding](https://docs.postgrest.org/en/stable/references/api/resource_embedding.html) — embedding requires declared FKs.
10. [Chadwick Bureau — register](https://github.com/chadwickbureau/register) — step 2's seed, already fetched by `import-lahman.ts`.
11. [SABR — Lahman Database](https://sabr.org/lahman-database/) — the `playerID` space in `players.lahman_id`.
12. [pybaseball](https://github.com/jldbc/pybaseball) — `playerid_lookup`, a multi-space crosswalk.
13. [Retrosheet](https://www.retrosheet.org/) — the `retro_id` space `retro_people` mirrors.
14. [Baseball Savant — CSV field docs](https://baseballsavant.mlb.com/csv-docs) — `pitcher`/`batter`/`game_pk`/`sv_id` are vendor-owned fields stored verbatim.
15. [MLB-StatsAPI (toddrob99)](https://github.com/toddrob99/MLB-StatsAPI) — `/api/v1/people`, the call that mints identity.
16. [Kalzumeus — Falsehoods programmers believe about names](https://www.kalzumeus.com/2010/06/17/falsehoods-programmers-believe-about-names/) — the general case behind §4.
17. [dbt — Data tests](https://docs.getdbt.com/docs/build/data-tests) — `relationships` as §8's declarative assertion.

**Triton-internal evidence.** Schema and code read 2026-08-12; the database was not queried. From the central measurement packet (2026-08-12): `players`' six-column shape with MLBAM-as-PK, 16,931 rows, `id` range 110001–842249, `lahman_id` 3,228 (19.07%), `team` 0 (0.00%), `position` 64.4%, 513 duplicate-name collisions over 16,418 distinct names, NULL `last_analyze`/`last_autoanalyze` everywhere inspected; `pitches` ~8,877,621 rows / 9,711 MB / 623,662 pages (× 8 KB ≈ 4.87 GB heap), `milb_pitches` ~2,508,422 / 2,366 MB, and `compete_pitches` 443 rows with `athlete_profile_id` 0% populated. Code paths: `app/api/update/route.ts:60` (player upsert on the MLBAM id) and `:148` (pitch upsert conflict target, mirrored at `app/api/update/milb/route.ts:357`, with `'Unknown'` placeholders at `:436–447`); `lib/dataIntegrity.ts:50–52, 95–140, 148–200` (orphan detection and MLB-API repair); `scripts/create-bullpen-pitchers.sql:1–16, 24–25` with `app/api/pitchers/route.ts:40–44`; `scripts/create-compete-pitches.sql:28–37, 49–55`; `app/api/mechanics/report/route.ts:37–42`; `scripts/create-retro-tables.sql:21–24, 228–252` with `docs/VARIABLES.md:563`; `scripts/import-lahman.ts:223–240`; `scripts/create-pitch-videos.sql:4–5, 17–30`. Greps run 2026-08-12: FK references to `players` in `scripts/` → **0**; `pitcher`/`batter` column references in `app/ lib/ scripts/` → **1,519** across **185** files. `CLAUDE.md` still documents `players` as 4,017 rows — stale by ~4×.
