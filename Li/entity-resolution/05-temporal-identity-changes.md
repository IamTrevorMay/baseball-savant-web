---
title: Temporal Identity Changes — When the Player Stays the Same and Everything Else Moves
domain: entity-resolution
tags:
  - temporal-identity
  - valid-time
  - name-changes
  - trades-and-stints
  - franchise-relocation
  - level-transitions
  - two-way-players
  - slowly-changing-dimensions
sources_reviewed: 18
last_updated: 2026-08-12
---

# Temporal Identity Changes — When the Player Stays the Same and Everything Else Moves

> Grades: **(established)** published/replicated; **(computed)** from Triton source at the cited
> `file:line` or the 2026-08-12 measurement pass, read not queried; **(estimated)** from theory.
> General valid-time/transaction-time machinery (as-of joins, system-versioning, restatement) is
> `temporal-modeling/02-bitemporal-modeling.md`. Here: *which* facts about a person move.

## TL;DR

- **The MLBAM ID is the only identity fact that never moves, and every attribute hung on it is stored as if it never moved either** — `players` is one undated row per person, a Kimball Type 1 dimension by accident. (computed — 16,931 rows)
- **`players` is write-once: nothing in the repo updates a name that isn't the literal `'Unknown'`** — the one writer touching those rows corrupts suffixes, turning `"Mel Rojas Jr."` into `"Jr., Mel Rojas"` forever. (computed — `update/route.ts:60`, `roster/route.ts:14,44–46`)
- **Two name formats coexist because three writers apply three policies** — 16,474 `"Last, First"` vs 457 `"First Last"` — and name is no key anyway: **513 rows share a name**, four of them `Gonzalez, Jose`. (computed — `route.ts:53`)
- **Triton stores no team information at all** — `players.team` is 0 of 16,931 rows, the only dated affiliation is `retro_rosters` at season grain, and `player_season_stats` keys on `(player_id, season, stat_group)` — a trade is unrepresentable. (computed — `create-player-season-stats.sql:19`)
- **Historical team codes are retroactively overwritten with today's abbreviations, and the glossary documents it as intended** — a Type 1 update on a franchise dimension. (computed — `docs/VARIABLES.md:356`)
- **`PARK_FACTORS` carries `OAK` and `ATH` with byte-identical values — a live wrong number.** The Athletics left the Coliseum for Sutter Health Park in 2025; Triton park-adjusts Sacramento games with Oakland factors. (computed — `lib/constants-data.ts:40–41`)
- **Level is a property of a row, not a player, and Triton gets that right by accident** — same ID in both pitch tables, 0 orphans on the Aug 2026 check; cross-seam comparability is unsolved; two-way identity survives only in `stat_group`. (computed)
- **Facility identity has no temporal problem because it has no identity:** 443/443 `compete_pitches` rows carry `tm_pitcher_id`, 0 carry `athlete_profile_id`. (computed — `upload/route.ts:45`)

---

## 1. Which facts about a player actually move

Entity resolution asks *"are these the same person?"*; temporal identity asks *"was that true on the
date of the row I'm joining?"* The MLBAM ID answers the first permanently; nothing in Triton answers
the second. **(computed throughout)**

| Identity fact | Moves when | Rate | Triton storage |
|---|---|---|---|
| **MLBAM person ID** | never post-debut | — | `players.id`, 110001–842249 |
| **Display name** | legal change, transliteration, suffix drop | rare | `players.name`, single-valued |
| **Team / org** | trade, waiver, FA, option, DFA | ~monthly in-season | **nowhere** (`players.team` 0%) |
| **Level** | promotion, demotion, rehab | weekly at the fringe | implicit in which table the row is in |
| **Position** | conversion (OF→P, C→1B), aging | seasonal | `players.position`, frozen, 64.4% populated |
| **Role (SP/RP)** | usage change, injury return | seasonal | derived per season, never stored |
| **Franchise name/city/code** | rebrand, relocation | ~once a decade | overwritten retroactively |

The facts that move most often are stored least: a stable ID makes identity *feel* solved.

---

## 2. Names — three writers, three policies, no history

| Writer | Format written | Updates existing rows? |
|---|---|---|
| `syncNewPlayers`, pitchers — Savant `player_name` | `"Last, First"` | No — `ignoreDuplicates: true` (`:60`) |
| `syncNewPlayers`, batters — MLB `fullName` | **`"First Last"`** (`:53`) | No |
| MiLB `ensurePlayers` | `'Unknown'` | No |
| `/api/cron/roster` — MLB `fullName` | reformatted, naively | **Only where `name = 'Unknown'`** |
| `backfill-player-stats` — `lastName`+`firstName` | `"Last, First"` (`:72`) | No |

**16,474 + 457 = 16,931.** The 457 are the batter path; its members — `Mel Rojas Jr.`,
`C.J. Hinojosa`, `Santiago Chávez` — are the shapes a naive splitter mangles, and survive intact
because that path never splits.

### 2.1 The reformatter is wrong, and wrong permanently

`roster/route.ts:46` builds the name as `` `${parts.slice(-1)[0]}, ${parts.slice(0,-1).join(' ')}` ``.
Last-token-is-surname fails on suffixes (`Jr.`, `III`), Spanish paternal+maternal surnames, and any
given name containing a space: `"Vladimir Guerrero Jr."` → `"Jr., Vladimir Guerrero"`. Since no
writer updates a non-`'Unknown'` name, the mangled string is that player's identity forever — and the
damage is biased: `'Unknown'` rows come almost entirely from the MiLB ingest
(`update/milb/route.ts:438–448`), concentrating it in the population likeliest to reappear in
`pitches` under a different write path. **(computed)**

### 2.2 Accents, normalization, collisions

**553 names (3.27%) are non-ASCII**, and `"Vázquez"` can be NFC or NFD — unequal in SQL, identical on
screen. Postgres does not normalize on input, so the fix is a stored `name_normalized` column, not a
query-time predicate. **(established)**

**513 rows share a name with another row** (16,931 rows, 16,418 distinct): four MLBAM IDs answer to
`Gonzalez, Jose` (114931, 467102, 681275, 683681), and `Vázquez, Christian`, `Wilson, Jacob`,
`Williams, Matt`, `Jackson, Alex`, `Perez, Fernando` are also four-way — collision members can be
active in the same season. Algorithms are `03-name-matching-algorithms.md`; the point here:
**a name history enlarges the candidate set, so normalization comes first.** Retrosheet's biofile
already carries `birthname` and `altname` — the change axis exists upstream, discarded at ingest.
**(computed / established)**

---

## 3. Trades and mid-season team changes

### 3.1 There is no team dimension

`players.team` exists and has never held a value, so "who did he play for on 2026-06-14" is answerable
only pitch by pitch: the MiLB pitcher page sets `vs_team = away_team` when `inning_topbot === 'Top'`
(`milb/player/[id]/page.tsx:184–185`); the pitcher's *own* team is the complement, never
materialized. **Team affiliation exists at pitch grain and no other grain** — every season-level
attribution is recomputed ad hoc or absent; no stint boundary splits a season at the trade date.
**(computed)**

### 3.2 `player_season_stats` cannot hold a traded player

The key is `PRIMARY KEY (player_id, season, stat_group)` (`create-player-season-stats.sql:19`) — no
team, no stint, no sequence — and the backfill upserts on exactly it (`backfill-player-stats.ts:82`).
So if the API returns one aggregated split per player, the club dimension is lost; if one split per
player-team, two rows collide — inside a 500-row chunk Postgres raises *"ON CONFLICT DO UPDATE
command cannot affect row a second time"* and the **whole chunk** is skipped with a `console.log`
(`:83`), a partial-season hole that reads like a coverage bug. **(estimated — the
failure mode follows from the key; which branch fires depends on API behavior not read here)** Adding
`stint smallint NOT NULL DEFAULT 1` and `team` to the key is one migration, worth it even if only
totals ever arrive: the schema then *says* which it is.

### 3.3 The already-documented attribution error

`docs/VARIABLES.md:356`, on bullpen inherited runners: *"a traded pitcher's full-season IR counts
toward his current team; team ids mapped via **current** abbreviations since `pitches`/team MVs use
today's codes for historical seasons."* Two Type 1 overwrites in one clause, and a published number
that changes retroactively when a player is traded. Whether the surface says so is **Cas**; Li's
point: *which club was he on when this run scored* is recoverable at pitch grain and thrown away in
aggregation.

---

## 4. Franchises: rebrand, relocation, and the park-factor bug

| Type | Example | Same franchise? | Same park? | Must change |
|---|---|---|---|---|
| **Rebrand** | Indians → Guardians (2021) | Yes | Yes | display name only |
| **Code change** | `OAK` → `ATH` (2025) | Yes | **No** | code map *and* park factor |
| **Relocation** | Oakland → West Sacramento; Las Vegas planned | Yes | **No** | park factor, venue, timezone |
| **Expansion** | — | new franchise | — | franchise validity range |

Triton handles the first (`lib/teamColors.ts:20` carries `CLE: 'Guardians'`, no Indians era) and fails
the next two in two lines of `lib/constants-data.ts`:

```ts
OAK: { basic: 96, pf_hr: 90, pf_so: 100, pf_bb: 100 },   // :40
ATH: { basic: 96, pf_hr: 90, pf_so: 100, pf_bb: 100 },   // :41
```

Byte-identical: `ATH` was added so the new code would not hit `undefined`, copying the Coliseum's
factors. But the Athletics play at **Sutter Health Park** in West Sacramento from 2025 through at
least 2027 — a ~14,000-seat park at different elevation in a hotter climate, shared with the
Triple-A River Cats. **Every wRC+ Triton computes for a Sutter Health Park
game is adjusted with an Oakland Coliseum factor.** *(computed for the code; its size is (estimated)
and unmeasured — one query settles it.)* `PARK_FACTORS` has no time dimension either — one
2024 FanGraphs vintage over 2015–2026. **Park factors belong on the venue, valid-dated, via a
(franchise, season) → venue map**, not on a code meaning different buildings in different years.

---

## 5. Level transitions

Level is the one temporal attribute Triton models correctly, and got there by not modeling it:
level is a property of the *row*, carried by which table holds it (`pitches` ~8.88M rows
2015-03-03→2026-08-10; `milb_pitches` ~2.51M rows 2023-03-31→2026-08-11, `level` from `SPORT_IDS` at
`update/milb/route.ts:298`). A promoted player just starts producing rows in the other table under
the same MLBAM ID, and the Aug 2026 orphan check found **0 orphans**: 453 MLB pitchers and 444 MiLB
batters all resolve to `players`. **(computed)**

Three things that does *not* solve:

| Gap | Why it bites |
|---|---|
| **When did the promotion happen?** | Only min/max `game_date` per table — confuses a promotion with an off day, blind to rehab assignments |
| **Are the numbers comparable?** | No: separate baselines and populations. `metric-governance/08-cross-level-comparability.md` forbids mixed-level display, and a promotion is when someone wants one chart |
| **Which level is "Triple-A"?** | The 2021 reorganization renamed every classification, so a pre-2021 "Class A-Advanced" row and a post-2021 "High-A" row are different populations under labels a string match joins wrongly |

Triton's MiLB data starts in 2023, on one side of that seam — record it *before* anyone backfills
earlier years. One building hosts both an MLB and a Triple-A club in 2025–2027, so a venue-keyed
park factor must be date- **and** level-scoped. **(established / computed)**

---

## 6. Two-way players and role identity

Two-way status is a *designation with a validity interval*, not a trait: MLB grants it on 20 MLB
innings plus 20 games started as a position player or DH (3+ PA each) in the current or either prior
season; once designated it **cannot change for the rest of that season and postseason** — an
identity fact handed to us pre-dated. **(established)**

| Surface | Handles two-way? | Mechanism |
|---|---|---|
| `player_season_stats` | **Yes** | `stat_group` in the PK → one pitching row + one hitting row |
| `players.position` | No | single scalar, frozen at first write, null on 6,032 rows (35.6%) |
| SP/RP classification | No | pitcher-only by construction (≥3 games with 50+ pitches) |
| Player pages | No | separate pitcher and hitter routes on the same `id`, no cross-link |

`players.position` is *silently* wrong rather than absent: a converted position player keeps his old
abbreviation forever. Role is honest by comparison — SP/RP is recomputed per season, never stored,
the right treatment for a fact whose value depends on the window asked about. **Position should be
modeled the way two-way status already is: dated claims, not a scalar.** **(estimated)**

---

## 7. Modeling identity valid-time in Postgres

The right shape is a Kimball Type 2 dimension — one row per (entity, attribute, validity interval),
never updated in place. Postgres expresses it natively; SQL:2011 application-time period tables are
the standard's version.

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;   -- for the mixed = / && exclusion

CREATE TABLE player_team_stints (
  player_id   int       NOT NULL REFERENCES players(id),
  team_code   text      NOT NULL,        -- as-of code, NOT retro-rewritten
  level       text      NOT NULL CHECK (level IN ('MLB','MiLB')),
  valid       daterange NOT NULL,        -- '[2026-04-01,2026-07-31)'
  source      text      NOT NULL,        -- 'pitches-derived' | 'mlb-api' | 'retro_rosters'
  EXCLUDE USING gist (player_id WITH =, level WITH =, valid WITH &&)
);  -- resolve as-of:  WHERE player_id = 700249 AND valid @> DATE '2026-06-15'
```

- **The `EXCLUDE` constraint is the point** — overlapping stints become impossible at write time, the
  only real defense against a backfill putting a player on two clubs at once; a `CHECK` cannot express
  it and application code will not hold. **Half-open ranges (`[)`), always** — closed-closed puts the
  trade date in both stints, doubling every count.
- **Seed from data already present:** `pitches` gives an exact per-appearance team for every MLB game
  2015→now, `retro_rosters` gives (player, team, season) back to 1914
  (`create-retro-tables.sql:124–140`); gaps are absence, not a guessed range.

**Valid time is not transaction time.** "He was on the Twins in June" and "we learned it on August
3rd" are different axes; reproducing a report as it rendered needs both
(`temporal-modeling/02-bitemporal-modeling.md`). One hook: `retro_people`/`retro_rosters` store
`source_version` (Chadwick release tag), the platform's only transaction-time stamp on identity.

**Facility identity is not yet temporal because it is not yet identity.** All 443 `compete_pitches`
rows carry `tm_pitcher_id`, **0** carry `athlete_profile_id`: the upload route calls
`rowToDb(r, { session_id, uploaded_by })` with no third field (`upload/route.ts:45`), so the column is
always null — link it before it accumulates history (`08-facility-athlete-linking.md`).

---

## 8. What Triton should do, in order

1. **Normalize `players.name`:** add `name_last`, `name_first`, `name_suffix`, `name_normalized`
   (unaccented, casefolded, NFC) from the MLB API's already-split fields; delete the reformatter at
   `roster/route.ts:44–46`; keep `name` as a generated column.
2. **Make the roster cron a real refresher** — widen it past `name = 'Unknown'` to a rotating slice of
   `players`, writing changes into history, not over the top.
3. **Add `stint` and `team` to `player_season_stats`'s key**; dedupe within a chunk in
   `upsertRows` so one conflict cannot silently drop 500 rows.
4. **Ship `player_team_stints`**, seeded from `pitches` and `retro_rosters` per §7 — the single
   missing dimension; trades, level transitions and org changes all become one query.
5. **Fix the Athletics park factor:** re-key `PARK_FACTORS` on `(venue, season)` behind a
   `(franchise, season) → venue` map; as a stopgap, give `ATH` Sutter Health Park's own factors. Record
   the seams in `docs/VARIABLES.md` in the same commit — name formats, `OAK`/`ATH`, the `:356` rewrite,
   the 2021 MiLB reclassification.
6. **Add three nightly integrity assertions:** orphan rate (0 today), duplicate names (513 — watch
   for growth, do not drive to zero), rows still named `'Unknown'`. Thresholds are **Jo**'s
   (`09-identity-quality-monitoring.md`).
7. **Only then expand the crosswalk** — the Chadwick register already flows in,
   `retro_id_map_conflicts` catches ambiguity; the 80.9% of `players` lacking a `lahman_id` is a
   coverage project, not a temporal one (`02-crosswalk-construction-maintenance.md`).

**Anti-recommendation — do not add a `team` column to `players` and fill it nightly from the roster
cron.** The obvious fix, the column already sitting there empty; it fails three independent ways.
**(i) A Type 1 overwrite of a fact whose entire value is historical** — every query joining through it
silently re-attributes past performance to the player's *current* club, the defect
`docs/VARIABLES.md:356` documents for inherited runners, generalized to every metric. **(ii) The wrong
grain, disagreeing with data Triton already has** — `pitches` knows the team of every appearance
exactly, so a person-level scalar is a less precise duplicate, and disagreeing duplicates get resolved
by whoever wrote the query. **(iii) It cannot represent the cases it exists to fix** — two
clubs in one season, a rehab assignment, an offseason free agent. Empty for the life of the platform
is not an oversight; it is evidence a scalar was never the right shape.

**Single highest-leverage next action:** run step 1 as one PR. It turns a column with two formats, 553
accented spellings, 513 collisions and a live corrupting writer into a stable matching surface that
stints, crosswalk expansion, facility linking and duplicate monitoring all match against.

---

## Sources

1. [Chadwick Bureau register](https://github.com/chadwickbureau/register) — the `key_mlbam`/`key_retro`/`key_bbref` crosswalk `retro_people` is built from; release tags date identity itself.
2. [Retrosheet biofile](https://www.retrosheet.org/biofile.htm) — `birthname`/`altname`: the name-change axis Triton discards.
3. [Retrosheet Franchise/Team IDs](https://www.retrosheet.org/TeamIDs.htm) — franchise vs team-season codes (§4).
4. [Lahman database (CRAN)](https://cran.r-project.org/package=Lahman) — the `stint` column: canonical shape for a mid-season team change, step 3's model.
5. [MLB-StatsAPI](https://github.com/toddrob99/MLB-StatsAPI) — split semantics for the two endpoints that write `players`.
6. [MLB glossary — Two-Way Players](https://www.mlb.com/glossary/rules/two-way-players) — §6's 20 IP / 20 games criteria, season-locked.
7. [Savant CSV field docs](https://baseballsavant.mlb.com/csv-docs) — the `"Last, First"` convention the pitcher path inherits.
8. [Sutter Health Park (Wikipedia)](https://en.wikipedia.org/wiki/Sutter_Health_Park) — the 2025–2027 residency and shared Triple-A occupancy.
9. [Athletics ballpark page](https://www.mlb.com/athletics/ballpark) — no city name: the code changed, the franchise did not.
10. [Minor League Baseball (Wikipedia)](https://en.wikipedia.org/wiki/Minor_League_Baseball) — the 2021 reorganization behind §5's seam.
11. Kulkarni & Michels (2012), [*Temporal features in SQL:2011*](https://sigmodrecord.org/publications/sigmodRecord/1209/pdfs/07.industry.kulkarni.pdf) — application-time period tables, which §7 approximates.
12. Kimball — [SCD Types 0–7](https://www.kimballgroup.com/2013/02/design-tip-152-slowly-changing-dimension-types-0-4-5-6-7/) — the Type 1/Type 2 vocabulary used throughout.
13. Fowler — [Effectivity](https://martinfowler.com/eaaDev/Effectivity.html) — validity ranges on a fact, not on the record.
14. PostgreSQL — [btree_gist](https://www.postgresql.org/docs/current/btree-gist.html) — the mixed `=`/`&&` exclusion §7 relies on.
15. PostgreSQL — [unaccent](https://www.postgresql.org/docs/current/unaccent.html) — diacritic folding for the 553 non-ASCII names.
16. Unicode — [UAX #15](https://unicode.org/reports/tr15/) — NFC vs NFD behind §2.2.
17. [Spanish naming customs](https://en.wikipedia.org/wiki/Spanish_naming_customs) — why last-token-is-surname is structurally wrong.
18. [pybaseball](https://github.com/jldbc/pybaseball) — `playerid_lookup`, a Chadwick-backed resolver with duplicate-name handling.

**Triton-internal evidence.** Code read 2026-08-12; no database queries run by this agent — counts from the 2026-08-12 central measurement pass. **Name writers:** `app/api/update/route.ts:17–62` (`:53` stores `p.fullName` unreformatted for batters; `:60` upserts `ignoreDuplicates:true`); `app/api/cron/roster/route.ts:14`, `:44–46` (`split(' ')` reformatter); `app/api/update/milb/route.ts:438–448` (`'Unknown'` placeholders); `scripts/backfill-player-stats.ts:70–73`, `:82`, `:83` (chunk error logged, not retried). **`players`:** 16,931 rows, `id` 110001–842249; 16,474 `"Last, First"` + 457 `"First Last"`; 553 non-ASCII; 16,418 distinct names → 513 non-unique, `Gonzalez, Jose` at 114931/467102/681275/683681; `lahman_id` 3,228 (19.07%); `position` 10,899 (64.4%); `team` **0 (0%)**. `CLAUDE.md`'s "4,017 players" is stale by 4.2×. **Team/franchise:** `lib/constants-data.ts:40–41`, `:26–30`; `lib/teamColors.ts:20`; `docs/VARIABLES.md:356`; `scripts/create-player-season-stats.sql:19`. **Level:** `pitches` ~8,877,621 rows / 9,711 MB, 2015-03-03→2026-08-10; `milb_pitches` ~2,508,422 rows / 2,366 MB, 2023-03-31→2026-08-11; `app/api/update/milb/route.ts:298`; orphan check → 0 across 453 MLB pitchers and 444 MiLB batters. **Team inference:** `app/(milb)/milb/player/[id]/page.tsx:184–185`, `hitter/[id]/page.tsx:138–139`. **Facility:** `compete_pitches` 443 rows / 6 pitchers / one 2026-04-13 session; 443 `tm_pitcher_id`, **0** `athlete_profile_id`; `scripts/create-compete-pitches.sql:51,61`; `lib/compete/pitchSchema.ts:287,294`; `app/api/compete/performance/upload/route.ts:45`. Caveat for step 4: `last_analyze`/`last_autoanalyze` are NULL on every table inspected, including 8.9M-row `pitches`, so planner estimates on a new identity join are untrustworthy until analyzed (**Jo**'s).
