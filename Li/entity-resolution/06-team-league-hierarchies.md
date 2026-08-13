---
title: Team & League Hierarchies — Which Org, Which Level, and Whether It's Still the Same Franchise
domain: entity-resolution
tags:
  - team-identity
  - franchise-continuity
  - affiliate-mapping
  - level-codes
  - controlled-vocabulary
  - park-factors
  - slowly-changing-dimensions
sources_reviewed: 18
last_updated: 2026-08-12
---

# Team & League Hierarchies — Which Org, Which Level, and Whether It's Still the Same Franchise

> Grades: **(established)** published; **(computed)** from Triton source at the cited line or the
> 2026-08-12 packet, read not queried; **(estimated)** from theory.

## TL;DR

- **"Team" is five entities and Triton stores one.** Franchise, club-season, venue, org, and roster-membership are distinct grains; a 3-letter `home_team` does all five jobs. Codes are labels, not keys — MLBAM's numeric `team.id` is the stable alternative, fetched everywhere and persisted nowhere. **(computed / established)**
- **There is no player→org mapping in the database.** `players.team` is populated on **0 of 16,931 rows (0%)**; every team attribution is inferred at query time by `MODE()` over pitch rows. **(computed)**
- **Live defect: `PARK_FACTORS` is keyed `ARI`, the pitch data is keyed `AZ`.** `?.basic || 100` returns neutral for every Diamondback, and since `computeWRCPlus` divides by `parkFactor/100`, Arizona hitters read ~1% high — a 120 prints 121. **(computed)**
- **A missing key and a neutral park are the same value.** Four call sites collapse "team not found" into `100`, so the resolution failure is indistinguishable from a correct answer. **(computed)**
- **Seven hardcoded 30-team pick-lists disagree**: four say `AZ`, three say `ARI`, none contains `ATH`. **(computed)**
- **`LAHMAN_TEAM_MAP` is franchise continuity with no time axis** — 64 keys → 31 outputs across three source vocabularies in one untagged keyspace, `PHA → OAK` while `ATH → ATH`; `PARK_FACTORS` then carries `OAK` and `ATH` identically, so Sutter Health Park is adjusted with Oakland Coliseum's factors. **(computed)**
- **"MiLB" here means Triple-A**, and six incompatible level vocabularies coexist. `SPORT_IDS` ingests only `sportId: 11` — AA/High-A/A are commented out — yet `league_averages` stamps `level='MiLB'` under a two-value CHECK the glossary miscases as `mlb | milb`. **(computed)**
- **The one real hierarchy Triton captures is unused.** `milb_pitches.parent_org_home/away` holds the MLBAM parent-org id per game — the correct grain — and nothing reads it. **(computed)**

---

## 1. Five entities, one column

| Entity | Grain | Changes when | Triton's representation |
|---|---|---|---|
| **Franchise** | ownership lineage | never (that's the point) | none — implied by `LAHMAN_TEAM_MAP` outputs |
| **Club-season** | (franchise, season): name, city, abbrev | relocation, rebrand | `home_team` / `away_team` |
| **Venue** | ballpark | move, temporary park | none — `PARK_FACTORS` keyed by *team* |
| **Org** | parent club + affiliates | PDL reshuffle, affiliation swap | `milb_pitches.parent_org_*` (unread) |
| **Roster membership** | (player, team, date-range) | trade, option, IL | none — inferred by `MODE()` |

Every bug below is one of these five answering another's question. The Athletics expose all five at
once: same **franchise**, new **club-season** abbrev, a radically different **venue** (Coliseum → a
Triple-A park), unchanged **org**, continuous **roster**.

---

## 2. Triton's team code spaces

| # | Space | Values | Where | Stable? |
|---|---|---|---|---|
| 1 | **MLBAM numeric id** | 108–158 | `DIV_MAP`, `TEAM_IDS`, roster/depth-chart routes | **Yes** |
| 2 | **Savant/StatsAPI abbrev** | `AZ`, `CWS`, `WSH`, `ATH`… | `pitches.home_team`, all team MVs | No |
| 3 | **Triton UI abbrev** | two variants (`AZ` vs `ARI`) | 7 hardcoded pick-lists | No |
| 4 | **Park-factor key** | 31 keys incl. `ARI` **and** `ATH` | `lib/constants-data.ts:28–62` | No |
| 5 | **Lahman/BBRef/Retrosheet** | 64 keys → 31 outputs | `LAHMAN_TEAM_MAP` | Era-scoped |
| 6 | **Retrosheet 3-char** | 81 era-scoped codes (`WS1`, `SLA`…) | `build-starter-outings.ts:75` | No |
| 7 | **MLBAM parent-org id** | numeric | `milb_pitches.parent_org_*` | **Yes** |

Space 1 is the only one both stable and fetched everywhere — and the only one never persisted on a
pitch row. The repo holds **nine** hardcoded id↔abbrev dictionaries: nine places for a rebrand to
land unevenly, one of which (`scene-stats:637`) normalizes `'AZ'`→`'ARI'`. Division is hardcoded the
same way — `app/api/standings/route.ts:3–40` maps 30 team ids → division, defaults an unmapped team
to `'Unknown'`, then filters by division name, so the team **vanishes with no error and no count**
though the payload already carries `team.division.id`. **(computed)**

### 2.1 The `AZ` / `ARI` defect, worked

The Stats API `abbreviation` for team 109 is `AZ` — what lands in `home_team` and what the filters
send. `PARK_FACTORS` is keyed `ARI`:

```ts
const pf = PARK_FACTORS[r.primary_team]?.basic || 100   // scene-stats:1098
// 'AZ' → undefined?.basic → 100
```

`computeWRCPlus` (`lib/sql.ts:53–61`) divides by `(parkFactor/100) * r_pa`, so **100** where **101**
belongs shrinks the denominator ~1% and inflates every Arizona hitter's wRC+ ~1%: a true 120 prints
**121**. One character to fix, and silent — the `|| 100` that keeps the route from crashing is the
same `|| 100` that hides the miss. The rule: **never let an unmatched entity resolve to a plausible
default.** A missing park factor should be `null` and stay `null`; whether the column is populated
is **Jo** (`Jo/data-quality/07-null-semantics-missingness.md`) and what the UI does with it is
**Cas** (`Cas/analytics-ux/02-null-zero-unknown-ui.md`). *A defaulted join result is not a
measurement.* **(computed)**

### 2.2 The Athletics probe

`PARK_FACTORS` carries `OAK` and `ATH` identically and no UI list contains `ATH`. Grouping
`home_team` by `game_year` for 2024+ decides which finding is live: if 2025–26 says `ATH`, the UI
cannot select the A's and `mv_team_*` splits the franchise in two; if it says `OAK`, the `ATH` entry
is dead code and `docs/VARIABLES.md:356`'s assumption — *"`pitches`/team MVs use today's codes for
historical seasons"* — is operative, so Savant **retro-relabels history** and any saved query on a
since-changed abbreviation quietly changed meaning. **(estimated — one query; do not guess.)**

---

## 3. Franchise continuity: `LAHMAN_TEAM_MAP` dissected

`lib/lahman-stats.ts:107–141`. 64 keys, 31 distinct outputs, 28 identity mappings.

| Property | Status | Consequence |
|---|---|---|
| Reverse lookup (modern → historical) | ❌ undefined | "every season of this franchise" is unanswerable |
| Source vocabulary tagged | ❌ absent | `CHA` (Lahman) and `CHW` (BBRef) share one namespace |
| Unmapped input | ❌ passes through | `modernTeamCode('KC1')` returns `'KC1'` |
| Time axis | ❌ none | `PHA → OAK` but `ATH → ATH`: one franchise, two codes |

**(a) Pass-through is the dangerous default.** An unrecognized code flows into a column consumers
read as a modern abbreviation — Lahman's `KC1` (Kansas City Athletics, 1955–67) is absent, so the
`PHA → KC1 → OAK → ATH` chain is covered two links in four. A controlled-vocabulary translation
should **throw or return null**; one that silently emits untranslated values is unauditable.

**(b) A mixed keyspace cannot detect a collision.** Lahman/Retrosheet contribute `CHA, CHN, KCA,
LAN, NYA, SDN, SFN, SLN, TBA`; BBRef/FanGraphs `CHW, KCR, SDP, SFG, WSN`; MLBAM `CWS, KC, SD, SF,
WSH`. All three are keys in one object. Today no key means two things, but nothing *prevents* it,
and the failure would be a wrong answer rather than an error.

**(c) Franchise ≠ team ≠ park.** Lahman ships `TeamsFranchises.csv` apart from `Teams.csv` because
`franchID` is the continuity key and `teamID` the club-season key; Retrosheet's `parkcode.txt`
carries per-park date ranges because a franchise changes parks independently. Triton has one column
for all three — which is why Sacramento inherits Oakland's factors. Whether the A's *should* get a
fresh factor is Soto's call (`Soto/algorithm-design/03-run-value-frameworks.md`); Li's point is that
the model **cannot express** a park change without a team change.

---

## 4. Level and league codes: six vocabularies

| Vocabulary | Values | Where |
|---|---|---|
| MLBAM `sportId` | 1 MLB · 11 AAA · 12 AA · 13 A+ · 14 A · 51 WBC | `update/milb/route.ts:10–15` |
| `milb_pitches.level` | `'AAA'` — the `SPORT_IDS` key, constant in practice | `update/milb/route.ts:298, 330` |
| `league_averages` / `league_percentiles` | `CHECK (level IN ('MLB','MiLB'))` | `create-league-averages.sql:17` |
| `docs/VARIABLES.md` §7 | `mlb \| milb` — **lowercase, matches nothing** | `docs/VARIABLES.md:309` |
| `biomech_captures.level` | `youth \| hs \| college \| pro` | `create-biomech-captures.sql:25, 64` |
| `work_athletes.level` | `HS, JuCo, NCAA, Pro, etc.` (free text) | `create-work-tables.sql:67` |

**"MiLB" is a lie of aggregation.** `refresh_league_averages` iterates
`VALUES ('MLB','pitches'),('MiLB','milb_pitches')` and stamps every MiLB benchmark `level='MiLB'` —
but `milb_pitches` is Triple-A only, so those rows are **Triple-A means wearing a four-level
label**, and the CHECK makes adding AA a migration. The day someone uncomments `AA: 12` the label
stays identical while its population changes: a metric whose denominator moves without its name
moving, the defect `metric-governance/01-metric-definition-semantics.md` catalogues. **(computed)**

**A level is an ordered dimension, not a label.** AAA > AA > A+ > A has a real difficulty gap at
each step, and the 2021 Professional Development League restructuring made league names
discontinuous across seasons besides — so the dimension needs `(level_code, level_rank, valid_from,
valid_to)`, not a text column. Translating *across* levels is
`metric-governance/08-cross-level-comparability.md`; this doc insists only that the level be
recorded well enough to **refuse** the mix.

---

## 5. Affiliate mapping: the right thing, unused

`update/milb/route.ts:168–169` reads `gameData.teams.{home,away}.team.parentOrgId` and `:299–300`
writes `parent_org_home` / `parent_org_away` onto every MiLB pitch. Correct design: the **stable
numeric id**, captured **per game**, so an affiliation change records itself instead of needing a
backfill — the cheapest possible Type-2 treatment of a slowly-changing hierarchy — and the org
rollup becomes a one-line `WHERE`.

**Nothing in the repo reads either column.** The MiLB surfaces filter on affiliate
`home_team`/`away_team` abbreviations instead — a code space disjoint from the MLB one and far less
stable, since affiliate clubs rebrand freely. Two caveats: `|| null` makes a falsy `parentOrgId`
indistinguishable from an absent one, and whether `feed/live` carries it reliably is coverage
(**Jo**, `Jo/data-quality/03-constraint-design-postgres.md`). **(computed)**

---

## 6. Player→team: inferred, not stored

`players.team` is populated on **0 of 16,931 rows**, so the player→org edge does not exist and every
surface reconstructs it:

```sql
MODE() WITHIN GROUP (ORDER BY CASE WHEN inning_topbot='Top' THEN away_team ELSE home_team END)
  AS primary_team   -- scene-stats:1086, 1666; create-materialized-views.sql:26, 125
```

| Failure | Mechanism | Effect |
|---|---|---|
| **Traded player** | one modal team per season | a 51/49 split park-adjusts 49% of his season with the wrong stadium |
| **Ties** | `mode()` returns an arbitrary tied value | non-deterministic across MV refreshes |

On top of those, the modal team's park is applied to ~100% of his PA when ~half were on the road.
But the tie case is the one to internalize: **the identity assignment is not a function of the data
alone.** Postgres documents `mode()` as returning "an arbitrary one" among ties, so `primary_team`
is irreproducible and everything derived from it inherits that. The right grain is a
**roster-membership interval** — `(player_id, team_id, valid_from, valid_to, source)`, a Type-2
SCD: park adjustment becomes a per-game join instead of a per-season guess, "his numbers with the
Mets" becomes expressible, and a trade stops rewriting history. `retro_rosters` is a ready-made
seed.

---

## 7. What a correct model looks like

Small, and none of it touches `pitches`.

```sql
CREATE TABLE teams (
  team_id       int  PRIMARY KEY,        -- MLBAM numeric id: stable across rebrands
  franchise_id  text NOT NULL,           -- Lahman franchID: spans PHA/KC1/OAK/ATH
  level_code    text NOT NULL,           -- MLB | AAA | AA | A+ | A | ROK
  level_rank    int  NOT NULL,           -- ordered: MLB=1 … ROK=6
  league_id int, division_id int, venue_id int, name text, abbrev text,
  parent_org_id int REFERENCES teams(team_id),   -- NULL for MLB clubs
  valid_from    date NOT NULL, valid_to date);   -- NULL = current (SCD Type 2)

CREATE TABLE team_code_map (             -- one row per (scheme, code) — never a bare code
  scheme  text NOT NULL CHECK (scheme IN
            ('mlbam','savant','lahman','retrosheet','bbref','triton_ui')),
  code    text NOT NULL,
  team_id int  NOT NULL REFERENCES teams(team_id),
  valid_from date NOT NULL, valid_to date,
  PRIMARY KEY (scheme, code, valid_from));
```

Four properties matter: **codes are attributes, not keys**; **every mapping is scheme-tagged**, so
§3(b)'s collision becomes impossible rather than merely unobserved; **every row is
effective-dated**, so `PHA`/`KC1`/`OAK`/`ATH` are four rows sharing a `franchise_id` instead of a
lossy `→` in a JS object; and **`parent_org_id` self-references**, making the org hierarchy a
recursive CTE. A third table — `venues (venue_id, name, team_id, valid_from, valid_to)` — is what
park factors should key on. Seed cost is low hundreds of rows, from Chadwick's databank,
Retrosheet's `TeamIDs.htm` and `parkcode.txt`, and `/v1/teams`. **(estimated)**

---

## 8. What Triton should do, in order

1. **Fix the `AZ`/`ARI` miss** — alias `AZ` in `PARK_FACTORS` (or normalize at the four read sites),
   and in the same PR replace `?.basic || 100` with a null that propagates.
2. **Collapse the seven UI pick-lists and nine id↔abbrev dictionaries into one exported constant** —
   divergence between copies is the only reason §2.1 survived.
3. **Run three probes, logged to `docs/Queries.md`:** distinct `home_team` by `game_year` (diff vs
   the 31 `PARK_FACTORS` keys); `parent_org_home` null-rate on `milb_pitches`; `SELECT DISTINCT
   level FROM milb_pitches` (expect `{'AAA'}`). Make the first a CI assertion (**Cas**,
   `Cas/testing-data-systems/02-sql-query-testing.md`) and alert on match-rate regression per
   `09-identity-quality-monitoring.md`.
4. **Ship `teams` + `team_code_map` (§7)**, seeded from Chadwick + Retrosheet + StatsAPI. Keep the
   abbreviation columns; add the join, don't migrate the data.
5. **Key park factors on `venue_id`, not team**, and give the 2025–27 Athletics their own row.
   Until then, document that Sacramento is scored as Oakland.
6. **Split `league_averages.level` into `MLB | AAA` now**, before AA ingest exists — renaming a
   population after it has consumers is a MAJOR metric bump
   (`metric-governance/02-metric-versioning-reproducibility.md`); today it costs one CHECK.
7. **Read `parent_org_*`** — an org filter on the MiLB surfaces, from a column already populated.
8. **Replace `MODE()`-derived `primary_team` with a roster-membership interval table.** Largest
   item; fixes park adjustment, trades, and level transitions at once.
9. **Reconcile `docs/VARIABLES.md`** in the same commits.

**Anti-recommendation — do not "fix identity" by adding a `team` column to `pitches`, or by finally
populating `players.team`.** The obvious move, wrong three independent ways. **(i) Wrong grain:**
`players.team` is one value per player; a traded player has two or three per season, a MiLB player
up to four across levels. A single-valued column cannot hold the fact it is asked to hold, so it
goes *stale* rather than wrong-looking — the worse failure, because it reads as authoritative.
**(ii) Wrong derivation:** the team a pitch belongs to is already fixed by `(game_pk,
inning_topbot)` plus a games dimension, so storing it denormalizes a derivable fact onto 8.88M rows
and creates a second source that can disagree with the first. **(iii) The write cost is real and
buys nothing** — `pitches` is 9,711 MB over ~8.88M rows at a measured 4.0% HOT-update rate, so a
backfill dirties nearly every index under an 8s cap to store what the row already implies. Fix the
**dimension**, not the fact table.

**Single highest-leverage next action:** run `SELECT game_year, home_team, count(*) FROM pitches
GROUP BY 1,2` and diff the distinct abbreviations against the 31 `PARK_FACTORS` keys and the seven
UI lists. One query confirms or kills the `AZ` and `ATH` findings at once, and tells you whether the
abbreviation space is stable across 2015–2026 or whether Savant has been retro-relabelling history
under saved filters this whole time.

---

## Sources

1. [MLB Stats API — `/v1/teams?sportId=1`](https://statsapi.mlb.com/api/v1/teams?sportId=1) — authoritative id/abbrev/league/division/venue; shows `AZ`, not `ARI`.
2. [MLB Stats API — `/v1/sports`](https://statsapi.mlb.com/api/v1/sports) — the canonical `sportId`→level list `SPORT_IDS` hardcodes a subset of.
3. [MLB Stats API — `/v1/divisions`](https://statsapi.mlb.com/api/v1/divisions) — live division/league membership: the replacement for a hardcoded `DIV_MAP`.
4. [toddrob99/MLB-StatsAPI wiki](https://github.com/toddrob99/MLB-StatsAPI/wiki) — endpoint docs incl. `parentOrgId` on affiliate team records.
5. [SABR — Lahman Database](https://sabr.org/lahman-database/) — `Teams.csv` + `TeamsFranchises.csv`: the `teamID`/`franchID` split §3(c) needs.
6. [Chadwick — Register](https://github.com/chadwickbureau/register) — people-level crosswalk; §7's team table follows its scheme-tagged form.
7. [Retrosheet — Team IDs](https://www.retrosheet.org/TeamIDs.htm) — the 81-code vocabulary at `build-starter-outings.ts:75` and its era boundaries.
8. [Retrosheet — `parkcode.txt`](https://www.retrosheet.org/parkcode.txt) — per-park start/end dates: venue must be modelled apart from team.
9. [Baseball-Reference — Teams index](https://www.baseball-reference.com/teams/) — franchise pages listing historical club codes: the reverse lookup `LAHMAN_TEAM_MAP` lacks.
10. [Baseball Savant — CSV field docs](https://baseballsavant.mlb.com/csv-docs) — `home_team`/`away_team` as the only team identity in Statcast exports.
11. [FanGraphs — Guts! Park Factors](https://www.fangraphs.com/guts.aspx?type=pf) — what `lib/constants-data.ts` cites, published per team-season: the dimension Triton dropped.
12. [Wikipedia — Sutter Health Park](https://en.wikipedia.org/wiki/Sutter_Health_Park) — the A's 2025–27 home; why inheriting Oakland's factors is indefensible.
13. [Wikipedia — Oakland Athletics](https://en.wikipedia.org/wiki/Oakland_Athletics) — the Philadelphia→Kansas City→Oakland→Sacramento chain incl. the omitted `KC1` link.
14. [Wikipedia — Minor League Baseball](https://en.wikipedia.org/wiki/Minor_League_Baseball) — the 2021 PDL restructuring: why league identity needs valid-time.
15. [Kimball — SCD Types 0–7](https://www.kimballgroup.com/2013/02/design-tip-152-slowly-changing-dimension-types-0-4-5-6-7/) — Type 2 effective-dating, the pattern behind §7.
16. [Kimball — Dimensional Modeling Techniques](https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/) — ragged hierarchies; the self-reference for `parent_org_id`.
17. [W3C — SKOS Reference](https://www.w3.org/TR/skos-reference/) — concept schemes and `exactMatch`: the answer to §3(b)'s untagged keyspace.
18. [PostgreSQL — Aggregate Functions](https://www.postgresql.org/docs/current/functions-aggregate.html) — `mode()` returns an arbitrary value among ties: §6's non-determinism.

**Triton-internal evidence.** All `(computed)` claims are repo source read 2026-08-12 (no DB queries
run) plus the central measurement packet of that date. **Park factors** — 31 keys for 30
franchises, `OAK`/`ATH` identical, keyed `ARI`: `lib/constants-data.ts:28–62`, consumed with a
`100` fallback at `app/api/park-adjusted/route.ts:44` and `app/api/scene-stats/route.ts:136, 398,
1098, 1671`; `computeWRCPlus` at `lib/sql.ts:53–61`. **Seven UI pick-lists** — `AZ` at
`app/(research)/reports/page.tsx:14`, `app/(milb)/milb/reports/page.tsx:14`,
`lib/imagine/widgets/{HeatMapsPanel:19, HeatMapOverlaysPanel:24}.tsx`; `ARI` at
`components/reports/GenerateReportModal.tsx:6` and
`components/visualize/{scene-composer/DepthChartConfigPanel:5, template-builder/GlobalFilterPanel:25}.tsx`;
none contains `ATH`. **Nine id↔abbrev dictionaries** in `app/api/{roster:3, depth-chart:4, chat:11,
abs:47, populate-transactions:14, scene-stats:670, cron/challenges:15, cron/briefs:1218}/route.ts`
and `lib/autoComposeTools.ts:14`; the lone `AZ`→`ARI` fix at `scene-stats/route.ts:637`.
**Franchise map** — 64 keys → 31 outputs, 28 identity keys, pass-through `modernTeamCode`:
`lib/lahman-stats.ts:107–141`; 81 Retrosheet codes at `scripts/build-starter-outings.ts:75–82`.
**Levels** — `SPORT_IDS` AAA-only at `app/api/update/milb/route.ts:10–15`, `level` from the loop key
at `:298, 330`, `parent_org_*` read `:168` / written `:299` / read nowhere; CHECKs at
`create-league-averages.sql:17` and `create-league-percentiles.sql:12`; the level loop at
`create-refresh-league-averages.sql:65`; `docs/VARIABLES.md:309, 356, 490`;
`create-biomech-captures.sql:25`; `create-work-tables.sql:67`. **Inferred team** — `MODE()` at
`scripts/create-materialized-views.sql:26, 125, 181, 224, 259, 284, 343` and
`scene-stats/route.ts:1086, 1666`; `DIV_MAP`'s silent `'Unknown'` drop at
`app/api/standings/route.ts:3–40, 57, 89`. **Packet** — `players` 16,931 rows, `team` populated on
**0 (0%)**; `pitches` ~8,877,621 rows / 9,711 MB, 2015-03-03 → 2026-08-10; `milb_pitches` ~2,508,422
rows, 2023-03-31 → 2026-08-11. The 4.0% HOT figure is Jo's
(`docs/reliability-findings-2026-08-11.md`).
