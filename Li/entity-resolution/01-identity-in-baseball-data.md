---
title: Identity in Baseball Data — Six ID Spaces, One Player, and Where They Disagree
domain: entity-resolution
tags:
  - identity
  - mlbam
  - retrosheet
  - lahman
  - chadwick-register
  - crosswalk
  - master-data
  - player-ids
sources_reviewed: 19
last_updated: 2026-08-12
---

# Identity in Baseball Data — Six ID Spaces, One Player, and Where They Disagree

> Grades: **(established)** published/standard practice; **(computed)** verified against Triton source
> at the cited line or the 2026-08-12 packet, read not queried; **(estimated)** from theory.

## TL;DR

- **No ID space is a superset of the others, so "which ID" is a coverage question before it is a join question.** MLBAM begins at MLB's ~2007 registry; Retrosheet and Lahman reach 1871 over different populations. (established)
- **The Chadwick Register is the only free maintained crosswalk, and it is best-effort, not authoritative** — keys nullable both ways, ambiguity a known condition Triton's ingest already codes for. (established / computed — `scripts/ingest-retrosheet.ts:639–666`)
- **Triton's `players` primary key is a source ID doing surrogate-key duty.** It is `key_mlbam`, so no row can exist for an amateur, a Negro Leagues player, or anyone MLB never registered. (computed)
- **Triton's identity graph is three disconnected islands.** MLBAM, the Retrosheet/Chadwick island, and the facility island share no live join anywhere in the codebase. (computed)
- **The crosswalk Triton already built is unused** — `retro_id_map` occurs in exactly one file, an allowlist at `app/api/explore/query/route.ts:20`. (computed)
- **The Lahman link is 19.07% populated and its backfill cannot tell success from silence:** `import-lahman.ts:236–241` increments on *absence of error*, and a PostgREST `UPDATE` matching zero rows returns none. (computed)
- **Facility data is 100% unlinked** — all 443 `compete_pitches` rows carry `tm_pitcher_id`, **zero** carry `athlete_profile_id`, though the column and index exist. (computed)
- **`players.name` holds two incompatible formats because one insert path skips the formatter** — 16,474 `"Last, First"` vs 457 `"First Last"`, from `app/api/update/route.ts:53`. No repair path reaches them: all three filter `name = 'Unknown'`. (computed)
- **Names are not identifiers here: 16,418 distinct names over 16,931 rows = 513 collisions**, including four different `Gonzalez, Jose`. Every name-keyed lookup is a coin flip on those. (computed)
- **Identity debt is silent by construction: a bad join returns fewer rows, never an error.** That is why more Triton numbers are wrong from identity than from formulas. (established)

---

## 1. What is being identified

Three things get called "a player ID," and conflating them is the first error:

| Level | Grain | Example key | Changes? |
|---|---|---|---|
| **Person** | one human, cradle to grave | Chadwick `key_person` (UUID) | never |
| **Playing identity** | person × league system | `key_mlbam`, `key_retro`, `playerID` | never, by design |
| **Player-season / stint** | person × season × team × stint | Lahman `(playerID, yearID, stint)` | every trade |

Only the first is an entity; the second is a *registration*, stable inside its source system and meaningless outside it; the third is a fact row, and treating it as an identity is how two-way players and mid-season trades corrupt aggregates (→ `05-temporal-identity-changes.md`). Triton's `players` conflates levels 1 and 2 — the MLBAM registration *is* the person key — which holds while every subject is a tracked pro and fails the moment one is not (§5).

---

## 2. The six ID spaces

| Space | Key format | Population / era | Stable? | In Triton |
|---|---|---|---|---|
| **MLBAM / Statcast** | integer, ~110001–842249 | MLB's registry: MLB, MiLB, intl amateurs, draftees. Statcast *events* 2015+ MLB, 2023+ MiLB | yes; retired IDs not reused | `players.id` (PK), `pitches`, `milb_pitches`, `player_season_stats` |
| **Retrosheet** | 8 chars, `lastFinitial`+serial (`ruthb101`) | every MLB player 1871+, plus umpires/managers; PBP 1914+ | yes | `retro_people.retro_id`, `retro_events` |
| **Lahman** | `playerID`, bbref-shaped (`ruthba01`) | MLB 1871+, season grain, no PBP | yes | `lahman_people.lahman_id`, `players.lahman_id` |
| **Baseball-Reference** | `lastFfnn` | MLB + MiLB + Negro Leagues + intl | mostly — MiLB-only players re-keyed on debut | `lahman_people.bbref_id`, `retro_people.bbref_id` |
| **FanGraphs** | integer (MLB); `sa`+digits (prospects) | MLB + prospects | **no** for `sa*` — replaced on debut | `retro_people.fg_id` only |
| **TrackMan (facility)** | opaque vendor string | whoever threw at the facility | per-facility | `compete_pitches`/`trackman_pitches.tm_pitcher_id` |

Whoop and Captury add two more spaces but resolve *through* `athlete_profiles`, one hop behind the facility problem (→ `08-facility-athlete-linking.md`).

**The load-bearing asymmetry (established):** Retrosheet and Lahman IDs are *derived from the name* — readable and collision-prone by construction (`ruthba01` vs `ruthba02`); MLBAM and FanGraphs IDs are opaque sequences. Only the opaque ones are safe to key on; only the derived ones are debuggable by eye. `players.id` is opaque (good) but borrowed (bad — §6.1, → `11-id-schema-design.md`).

---

## 3. Where they disagree — six divergence classes

A crosswalk is not "mostly complete with a few nulls." The nulls are structured, and each class breaks a different query.

| # | Divergence | Who's missing where | Effect on a naive join |
|---|---|---|---|
| 1 | **Pre-MLBAM players** | retired before ~2007: has `retro_id` and `playerID`, often no `key_mlbam` | leaderboards silently drop the pre-Statcast population |
| 2 | **19th-c. / one-game players** | Retrosheet and Lahman disagree on existence and spelling | duplicate persons; the Register's conflicts concentrate here |
| 3 | **Negro Leagues** | major-league per MLB (2020); Lahman/bbref absorbed much, Retrosheet PBP mostly cannot | "all-time" queries mix two definitions of *major league* |
| 4 | **MiLB-only / never-debuted** | has `key_mlbam` (assigned at signing), **no** `playerID`, **no** `retro_id` | prospect rows join to nothing; the crosswalk reads broken when correct |
| 5 | **Amateur / facility athletes** | no ID in any public space | cannot be represented at all in an MLBAM-keyed table (§5) |
| 6 | **Two-way / re-registered** | `sa*` FanGraphs IDs replaced on debut; a few hold two MLBAM registrations | duplicate-person *and* split-history failures in one table |

**Class 4 bites Triton daily and is easy to misread as data loss.** `milb_pitches` covers 2023+ on MLBAM IDs, and many of those pitchers will never hold a Lahman or Retrosheet key, so `players.lahman_id` at 19.07% is *partly correct behavior* — which is why the raw rate is not a health metric (§7.5, → `09-identity-quality-monitoring.md`).

---

## 4. The Chadwick Register — what it promises

Sharded `people-0.csv` … `people-f.csv`, one row per person, carrying `key_person`, `key_uuid`, `key_mlbam`, `key_retro`, `key_bbref`, `key_fangraphs` plus biography. It backs pybaseball's `playerid_lookup`, the community ID maps, and both Triton importers.

Coverage is ~all professional persons the maintainers have reconciled — pros, minors, Negro Leagues, umpires, managers. Cadence is irregular commits (Triton's runbook says monthly, `docs/retrosheet.md:96`); versioning is a git SHA or release tag, never a semantic version on the mapping. The guarantee is **best effort** — keys nullable in both directions — and the failure mode is **ambiguity, not error**, concentrated in §3's classes 2 and 3.

**Triton already handles this correctly, once.** `ingest-retrosheet.ts:639–666` checks both directions — `retro_id` → many `mlbam_id` and the reverse — and writes offenders to `retro_id_map_conflicts` with a `register_version` stamp instead of picking a winner (`create-retro-tables.sql:241–255`). That is the right pattern — **never silently guess; log the ambiguity and resolve by hand** — and the repo's only treatment of identity as a versioned artifact. Copy it to the Lahman path, which does the opposite (§6.2).

**Register vintage is an identity-version axis.** A crosswalk built from the June release can disagree with August's about the same player, because a debuting prospect acquires `key_mlbam` in between. `retro_people.source_version` records the tag; nothing reads it. Same two-axis problem as baseline vintage (→ `metric-governance/02-metric-versioning-reproducibility.md`): a join is reproducible only if you can name the release that produced it.

---

## 5. Triton's identity graph — three islands

**A (live):** the MLBAM tables → `players.id`. **B (built, unused):** `retro_events` → `retro_people` → `retro_id_map`. **C (orphaned):** `compete_pitches.tm_pitcher_id` → nothing.

| Edge | State | Evidence |
|---|---|---|
| `pitches` ↔ `players` | **healthy** — 0 orphans Aug 2026 over 453 MLB pitchers / 444 MiLB batters | packet |
| `players` → `lahman_people` | **19.07%**, unmonitored, backfill blind to its failures | packet; `import-lahman.ts:224–245` |
| `players` ↔ `retro_id_map` | **does not exist** — one occurrence, an allowlist | `app/api/explore/query/route.ts:20` |
| `compete_pitches` → `athlete_profiles` | **0 of 443**; column + index exist, nothing writes them | packet; `create-compete-pitches.sql:51, 148` |
| `athlete_profiles` → `players` | exists and is used, falling back to `profiles.full_name` | `app/api/mechanics/report/route.ts:36–47` |
| `trackman_pitches` → `bullpen_pitchers` | **soft FK by name**, keyed `lower(name)`, "fine for v1" | `create-bullpen-pitchers.sql:16, 25–27` |

Island B is the frustrating one: the spec shipped a crosswalk, a conflict log, a materialized view and a weekly workflow, then scoped the join out (`retrosheet.planning.md:30` — "ID-only crosswalk ships v1; event-level join is v2"). **The hard part is done and unwired**; `players.id → retro_id_map.mlbam_id` is a view, not a project. Island C matters commercially: every Compete/Neptune athlete has no MLBAM ID and therefore no representation in an MLBAM-keyed master table. There is no linking bug — there is no linking code, which is the structural consequence of §2's borrowed key.

---

## 6. `players` as a master table — five defects

### 6.1 The primary key is a source ID (established / computed)

`players.id` *is* `key_mlbam`. So no row can exist for a person MLB never registered, a re-registration appears as two persons, and there is nowhere to hang a second identity. The fix is a surrogate `person_id` plus `external_ids(person_id, source, source_id)` — MDM's *registry* style, which leaves source systems untouched (→ `07-master-data-management-patterns.md`, `11-id-schema-design.md`). At 16,931 rows this is cheapest **now**.

### 6.2 The Lahman backfill counts non-errors, not matches (computed)

```ts
// scripts/import-lahman.ts:236-241
const { error } = await supabase.from('players')
  .update({ lahman_id: p.lahman_id }).eq('id', p.mlb_id)
if (!error) updated++
```

A PostgREST `UPDATE` matching **zero rows** succeeds, so `updated` counts attempts that did not error and the closing "Backfilled N players" is an upper bound that reads as a measurement. Contrast §4's conflict logger, correct in the same repo.

### 6.3 Two name formats, from one missing function call (computed)

16,474 rows are `"Last, First"`; 457 are `"First Last"`. The mechanism is one skipped call:

| Path | Name source | Formatted? | Result |
|---|---|---|---|
| `app/api/update/route.ts:38` (pitchers) | Savant `player_name` | n/a — already inverted | `"Last, First"` ✅ |
| `app/api/update/route.ts:53` (batters) | MLB API `p.fullName` | **no** | `"First Last"` ❌ |
| `lib/dataIntegrity.ts:18–23` (`formatPlayerName`), and inline copies at `cron/roster:44–47`, `cron/janitor:450–454`, `populate-players:44–47` | MLB API `fullName` | yes, ×4 | `"Last, First"` |

Four independent implementations of one three-line transform, and one path that skips it. Worse, **the defect is unreachable by its own remediation**: every repair path filters `name = 'Unknown'` (`lib/dataIntegrity.ts:52`, `cron/roster:14`, `populate-players:15`), and a wrongly-ordered name is not `'Unknown'`. The formatter is itself wrong on suffixes — `parts.slice(-1)[0]` takes the final token as surname, so "Vladimir Guerrero Jr." becomes `"Jr., Vladimir Guerrero"`. The packet's `"Mel Rojas Jr."` reads correctly only because it sits in the unformatted 457.

### 6.4 Names collide on 3.0% of rows (computed)

16,418 distinct names over 16,931 rows ⇒ **513 collisions**, six of them four-way — `Gonzalez, Jose` (MLBAM 114931, 467102, 681275, 683681), `Jackson, Alex`, `Perez, Fernando`, `Vázquez, Christian`, `Williams, Matt`, `Wilson, Jacob` — plus **553 names with non-ASCII characters**. `pg_trgm` is installed and used for Lahman search (`app/api/lahman/search/route.ts:30`, `app/api/chat/route.ts:367`); **`unaccent` appears nowhere in the repo**, so `Vazquez` does not match `Vázquez` and trigram similarity is degraded across all 553. The matching machinery belongs to `03-name-matching-algorithms.md`; the point here is narrower — **a name is not a key in this database, and 513 rows prove it.** Every surface resolving by name (the AI analyst, MCP `search_players`, autocomplete) picks among identities with no tiebreaker.

### 6.5 Declared-but-unwritten attributes, and a monitor that fails open (computed)

`players.team` is populated on **0 of 16,931 rows** and `position` on 10,899 (64.4%); no write path sets `team` at all. An always-null column on a master table is worse than a missing one — it invites a join that returns nothing and reports no error. (`team` is slowly-changing and does not belong on a person row anyway → `temporal-modeling/06-slowly-changing-dimensions.md`.)

Both orphan checks (`lib/dataIntegrity.ts:97, 156`) run `LEFT JOIN players … LIMIT 200`, so `found` saturates at 200 and cannot express severity, and both return `status:'pass'` when the RPC **errors** (`:108`, `:167`) — a statement timeout reports clean identity. The Aug 2026 zero-orphan result is genuine but ceilinged. Fixing the check is **Jo**'s and **Cas**'s; §7.5 specifies what a correct identity assertion *measures*.

---

## 7. What Triton should do, in order

1. **Wire island B.** `CREATE VIEW player_identity AS SELECT p.id AS mlbam_id, p.name, m.retro_id, m.bbref_id, m.fg_id, p.lahman_id FROM players p LEFT JOIN retro_id_map m ON m.mlbam_id = p.id;` — crosswalk, conflict log and weekly refresh already exist. One view turns an abandoned asset into the identity spine.
2. **Fix `app/api/update/route.ts:53` and repair the 457.** Route the batter insert through `formatPlayerName`, extract it to one shared module (four copies today), add suffix handling (`Jr.`, `Sr.`, `II`, `III`), then repair keyed on *format*, not on `name = 'Unknown'`.
3. **Add a surrogate `person_id` and `external_ids(person_id, source, source_id, first_seen, register_version)`.** Keep `players.id` for compatibility; make Compete athletes, amateurs and Negro Leagues persons expressible at all.
4. **Link island C at ingest** — resolve `tm_pitcher_id → athlete_profile_id` once per athlete and store it, a one-time human decision rather than a per-upload name match (→ `08-facility-athlete-linking.md`).
5. **Publish four identity metrics, not one:** Lahman match rate *among Lahman-eligible careers* (not the raw 19.07%), `retro_id_map_conflicts` by register version, orphan count with **no `LIMIT`**, duplicate-name count. Alerting → **Jo**; display → **Cas**.
6. **Stamp `register_version` on every crosswalk row and carry it in query provenance** — the Chadwick release is an input version exactly like a baseline vintage.
7. **Backfill `players.team` or drop the column.** Silent nulls on a master table trap every future join.

**Anti-recommendation — do not build a name-based fuzzy matcher to link the islands.** It is the obvious first move, `pg_trgm` is already installed, and it is wrong three independent ways. **(i) The base rate defeats it:** 513 duplicate names over 16,931 rows is an ambiguity floor no similarity threshold removes — `Gonzalez, Jose` has four correct answers. **(ii) The inputs are corrupted in a way fuzzy matching hides rather than fixes:** with two name formats in one column and no `unaccent`, both `"First Last"` vs `"Last, First"` and `Vázquez` vs `Vazquez` present as *low similarity*, so the matcher's errors correlate exactly with the rows §6.3 and §6.4 identify — laundering a schema defect as a scoring problem. **(iii) It is unnecessary work:** Chadwick already did this linkage by hand across all five public spaces and Triton already ingested it, while the one genuinely unlinked population — Compete athletes — has **no name in any register to match against**. Fuzzy matching earns its place only *after* items 1–4, on the residue, with a reviewed match log (→ `03-name-matching-algorithms.md`, `04-record-linkage-deduplication.md`).

**Single highest-leverage next action:** ship the `player_identity` view and in the same PR report its five coverage counts — rows with `retro_id`, `bbref_id`, `fg_id`, `lahman_id`, and none — logged to `docs/Queries.md`. That converts "we have no crosswalk" (false) into "here is which populations our crosswalk reaches" (actionable), and sizes every item above it.

---

## Sources

1. [Chadwick Bureau Register](https://github.com/chadwickbureau/register) — §4's sharded `people-*.csv` and the `key_mlbam`/`key_retro`/`key_bbref`/`key_fangraphs` columns both Triton importers read.
2. [droher/boxball](https://github.com/droher/boxball) — Lahman, Retrosheet and the Chadwick Register packaged as pre-joined Parquet/CSV; `People`'s `playerID`/`retroID`/`bbrefID` are §2's Lahman row, and the packaging is itself §4's evidence that the join is done downstream, not upstream. (The former `chadwickbureau/baseballdatabank` repo is gone; the Lahman CSVs are now distributed via SABR — source 6.)
3. [Chadwick tools](https://github.com/chadwickbureau/chadwick) — the `cwevent` parser Triton's Action builds from source: Retrosheet ingest is a compiled pipeline, not a fetch.
4. [Retrosheet](https://www.retrosheet.org/) — §2's coverage boundaries: game logs 1871+, PBP 1914+.
5. [Retrosheet event file format](https://www.retrosheet.org/eventfile.htm) — the 8-char `lastFinitial`+serial convention behind §2's "derived from the name" argument.
6. [SABR — Lahman Baseball Database](https://sabr.org/lahman-database/) — the season grain and `(playerID, yearID, stint)` key, §1's level-3 example.
7. [Seamheads Negro Leagues Database](https://www.seamheads.com/NegroLgs/) — §3 class 3's population and the source most of the 2020 major-league reclassification drew on: absorbed by Lahman/bbref, largely not by Retrosheet PBP.
8. [MLB Stats API (community docs)](https://github.com/toddrob99/MLB-StatsAPI) — the `/api/v1/people` endpoint Triton calls and the `fullName` field at the center of §6.3.
9. [Baseball Savant — CSV field docs](https://baseballsavant.mlb.com/csv-docs) — `player_name` ships inverted while the Stats API does not: §6.3's root cause.
10. [MLB — Statcast glossary](https://www.mlb.com/glossary/statcast) — the tracking-coverage boundary bounding MLBAM *event* data in §2.
11. [Baseball-Reference](https://www.baseball-reference.com/about/) — the `lastFfnn` scheme and MiLB→MLB re-keying in §2's stability column.
12. [FanGraphs](https://www.fangraphs.com/) — the `sa`-prefixed provisional prospect IDs that make it §2's one unstable space.
13. [pybaseball](https://github.com/jldbc/pybaseball) — `playerid_lookup`, the reference Register crosswalk; corroborates §4's "best effort, keys nullable."
14. [Fellegi & Sunter (1969), *A Theory for Record Linkage*](https://doi.org/10.1080/01621459.1969.10501049) — why a probabilistic matcher needs a clerical-review region; §7's anti-recommendation is an instance.
15. [PostgreSQL — `pg_trgm`](https://www.postgresql.org/docs/current/pgtrgm.html) — the `%` operator and `similarity()` Triton's Lahman search uses in §6.4.
16. [PostgreSQL — `unaccent`](https://www.postgresql.org/docs/current/unaccent.html) — the extension absent from the repo, against 553 accented names.
17. [PostgreSQL — `fuzzystrmatch`](https://www.postgresql.org/docs/current/fuzzystrmatch.html) — Levenshtein/Soundex/Metaphone, for `03-name-matching-algorithms.md`.
18. [Unicode UAX #15 — Normalization Forms](https://unicode.org/reports/tr15/) — why accented names need NFC/NFD normalization *before* comparison, not stripping.
19. [W3C — Personal names around the world](https://www.w3.org/International/questions/qa-personal-names) — two-surname and suffix conventions that break §6.3's `slice(-1)` rule.

**Triton-internal evidence.** All `(computed)` claims come from repo source read **2026-08-12** (no database queries were run by this doc) plus the centrally measured packet of the same date. *Packet:* `players` 16,931 rows, `id` 110001–842249; `lahman_id` 3,228 (19.07%); `team` 0 (0%); `position` 10,899 (64.4%); names 16,474 `"Last, First"` / 457 `"First Last"`; 553 non-ASCII; 16,418 distinct names ⇒ 513 collisions (four-way list in §6.4); orphans Aug 2026 = 0 over 453 MLB pitchers / 444 MiLB batters; `compete_pitches` 443 rows, 6 pitchers, 443/443 `tm_pitcher_id`, 0/443 `athlete_profile_id`. *Source, beyond the `file:line` cites inline above:* player upserts `app/api/update/route.ts:20–61` and `app/api/update/milb/route.ts:420–450` (`'Unknown'` placeholders, `LIMIT 200`); Register fetch and column map `scripts/import-lahman.ts:19–20, 84–97, 104` and `scripts/ingest-retrosheet.ts:167–176, 436–446`; crosswalk DDL `scripts/create-retro-tables.sql:225–238, 241–255`; weekly refresh `.github/workflows/retro-ingest.yml:3–4`; facility identity `scripts/create-compete-pitches.sql:51, 60–61, 148–149` and `scripts/create-trackman-schema.sql:44–45, 131`; name-keyed roster `scripts/create-bullpen-pitchers.sql:8–16, 25–27` and `app/api/pitchers/route.ts:40–44`; repo-wide grep for `unaccent` → **zero matches**. The packet's NULL `last_analyze` everywhere is a planner hazard for any new crosswalk join and belongs to **Jo**.
