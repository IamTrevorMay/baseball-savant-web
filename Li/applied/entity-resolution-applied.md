---
title: Entity Resolution & Master Data — Applied Playbook
domain: applied
tags:
  - entity-resolution
  - crosswalk
  - chadwick-register
  - identity-monitoring
  - athlete-linking
  - master-data
  - triton-platform
last_updated: 2026-08-22
---

# Entity Resolution & Master Data — Applied Playbook

> Turns `Li/entity-resolution/` into sequenced work and runs Slice F of
> `docs/research-app-audit-scope.md`. Ordered for dependency: a crosswalk is worthless if its
> source is dead, and monitoring is worthless if what it measures repairs itself first.

## TL;DR

- **The crosswalk plan must name a source that resolves today.** `chadwickbureau/register` is alive,
  republished weekly (checked 2026-08-22), and read by `scripts/ingest-retrosheet.ts:176`;
  `scripts/import-lahman.ts:17-18` reads a 2022 fork while `:6` names a retired repo. (computed)
- **`name` is not a join key and the routing table encodes one anyway.**
  `app/(research)/umpire/[name]/page.tsx:71` turns a URL segment into SQL equality at
  `app/api/umpire/route.ts:69` while the MLBAM official ID sits unread in the same rows. (computed)
- **Six copies of one broken reformatter decide what a player is called** —
  `lib/dataIntegrity.ts:21`, `app/api/cron/roster/route.ts:46`, `app/api/cron/janitor/route.ts:453`,
  `app/api/backfill-players/route.ts:47`, `app/api/populate-players/route.ts:46`,
  `app/api/update/milb/route.ts:314` — all last-token-is-surname, mangling every suffix. (computed)
- **`team` on 0 of 16,931 rows is a modeling error, not a gap.** Surfaces re-derive it with
  `MODE() WITHIN GROUP` (`app/api/scene-stats/route.ts:1086`) and `:1098` feeds that arbitrary
  tie-broken value into a park factor. (computed)
- **Compete's athlete link column has never been written once.**
  `lib/compete/pitchSchema.ts:282-287` defaults `athlete_profile_id` to null and
  `app/api/compete/performance/upload/route.ts:45` omits it; Captury made the same link `not null`
  and is fully linked (`scripts/create-biomech-captures.sql:18`). (computed)
- **A crosswalk assuming MLBAM is the hub fails for the population Compete serves.** Amateur
  athletes have no MLBAM ID, and a missing `players` row is not evidence one does not exist. The hub
  must be a Triton-owned `person_id`. (established)
- **The MLB orphan rate is pinned at zero by the code that reports it.**
  `lib/dataIntegrity.ts:97-116` repairs orphans then returns `pass`, and returns `pass` on query
  error too. Count inflow, not residual. (computed)
- **You cannot date an identity association, so restatement is off the menu** — `pitches` has no
  `created_at`/`updated_at`. Annotate history; never recompute it. (established)

## NOW (0–6 weeks)

Repair of what already exists; nothing here needs a new table.

### 1. Point the Lahman import at a source that resolves, and stamp what it used

`scripts/import-lahman.ts:6` documents a fetch from `chadwickbureau/baseballdatabank`;
`scripts/import-lahman.ts:17-18` actually fetches `cbwinslow/baseballdatabank`, a fork whose raw CSVs
still return 200 from 2022 content — so it cannot map anyone who debuted 2023+, which is precisely
what the platform queries. Silent staleness, not an outage. **(computed)**

**Do:** split the dependencies. Identity keys from `chadwickbureau/register` only, which
`scripts/ingest-retrosheet.ts:176` already reads; Lahman *season statistics* from the SABR archive,
with the release stamped per row as `scripts/ingest-retrosheet.ts:474` does. SABR re-issued the CSVs
for byte-order marks, so `scripts/import-lahman.ts:29` needs `bom: true`.
**Stop condition:** a dry run prints the release tag, the count of `lahman_id` rows whose `mlb_id`
would change, and the count that would gain a mapping; a nonzero first number is a finding.

### 2. Fix the wrong join column in the Lahman crosswalk

`scripts/import-lahman.ts:89-91` keys the register dictionary on `key_bbref`;
`scripts/import-lahman.ts:104` probes it with Lahman's `playerID`; `scripts/import-lahman.ts:106`
stores the correct `bbrefID` and never uses it for the lookup. They coincide for most modern players
but are not the same field, and each divergence yields a NULL `mlb_id` reading as an honest "no
MLBAM ID exists" — plausibly a share of the 19% `lahman_id` fill rate. And
`scripts/import-lahman.ts:233-243` counts `.update()` calls rather than matches. **(computed)**

**Do:** probe on `bbref_id`, falling back to `playerID` only when `bbrefID` is absent and counting
that separately; replace the per-row loop with one `UPDATE … FROM` over a staged table; NULL a
mapping upstream has withdrawn. **Stop condition:** `matched` and `attempted` print separately, and
three sampled players whose `playerID` and `bbrefID` differ resolve correctly.

### 3. Make the register conflict detector able to fire

`scripts/ingest-retrosheet.ts:641-646` asks for `retro_id` values mapping to more than one
`mlbam_id`, grouping by the table's primary key (`scripts/create-retro-tables.sql:20-21`), so the
count is 1 or 0 and that conflict cannot be emitted. The dead half is the one that matters: it would
catch a register row *changing* its `key_mlbam` between releases, which the upsert at
`scripts/ingest-retrosheet.ts:484` overwrites with no history — and `docs/retrosheet.md:163` reads
the empty log as "empty = clean". **(computed)**

**Do:** stage the incoming register, diff `key_mlbam` per `key_retro` against the live row, log
changes before promoting, and give `retro_id_map_conflicts` a natural key on
`(retro_id, mlbam_id, reason, register_version)` — it is INSERT-only
(`scripts/create-retro-tables.sql:243-252`), so a weekly job stacks one problem repeatedly. Correct
`docs/retrosheet.md:163` in the same commit. **Stop condition:** a staged row with an altered
`key_mlbam` produces exactly one conflict row, and none on a second identical ingest.

### 4. Stop `retro_people` from dropping the players Triton actually queries

`scripts/ingest-retrosheet.ts:437-438` returns null for any register person without `key_retro`,
because `retro_id` is the primary key. Every debutant holding an MLBAM ID but not yet a Retrosheet ID
is discarded before the database, capping coverage of *modern* players at the slowest ID space in the
register — the source-ID-as-primary-key argument in `Li/entity-resolution/11-id-schema-design.md`.
**Do:** land those rows in a staging table keyed on `key_mlbam`; do not re-key `retro_people` now,
since it has dependents (`scripts/create-retro-tables.sql:128-134`) and that migration belongs with
item 8. **Stop condition:** a register load reports the dropped-row count, queryable not printed.
**(computed / established)**

### 5. Define what makes a record an orphan, then hand the plumbing to Jo

Li owns the definitions; scheduling, routing and the dead-man switch are
`Jo/applied/data-reliability-applied.md`. Five counts, each its own grain:

1. `pitches` orphan **inflow**, pre-repair (`lib/dataIntegrity.ts:97-116`) — the only series that
   has variance.
2. `milb_pitches` orphan inflow — absent; both checks hard-code `FROM pitches`
   (`lib/dataIntegrity.ts:101`, `:161`), so MiLB identity is unobserved.
3. Unlinked **rows** versus unlinked **subjects** (`scripts/create-compete-pitches.sql:51`) — rows
   size the exposure, subjects the human work; one percentage hides both.
4. The `players.name = 'Unknown'` backlog run over run — written by
   `app/api/update/milb/route.ts:439-441`, drained 500/run by `app/api/cron/roster/route.ts:14`.
5. One `lahman_id` resolving to two people — a crosswalk invariant violation, not a data gap.

Count one is the argument. `lib/dataIntegrity.ts:97-116` finds orphans, repairs them, *then* reports,
so the residual is zero by construction and stays zero through any outage of the loop producing it —
and it returns `pass` when the query itself errors (`:108-116`, `:168-176`). **(computed)**

**Thresholds that mean something:** alert on the *count* below ~200 trials and the *rate* above,
carrying `n` either way; use a Wilson interval, since a match rate legitimately sits at 1; test slope
as well as level, because the failure mode here is decay, not a step; compare to the same phase of
last season, since call-ups make churn seasonal
(`Li/entity-resolution/09-identity-quality-monitoring.md` §7). **Stop condition:** five numbers on
one page with `n` attached, and a deliberately orphaned test ID appearing in the inflow series.

### 6. One name normalizer, six deletions, one stored normalized column

`app/api/update/route.ts` writes both conventions inside a single function: pitchers take Savant's
`player_name`, `"Last, First"` (`app/api/update/route.ts:38-40`); batters take MLB Stats API
`fullName`, `"First Last"` (`app/api/update/route.ts:53`), and the upsert at
`app/api/update/route.ts:60` uses `ignoreDuplicates: true`, so neither is corrected afterwards —
the whole mechanism behind the mixed name forms, in one file. The six repair copies listed in the
TL;DR then disagree — all last-token-is-surname, turning `"Vladimir Guerrero Jr."` into
`"Jr., Vladimir Guerrero"` and mangling every Spanish double surname. Since no writer updates a
non-`'Unknown'` name that string is the player's identity permanently, while display copies flip it
back (`lib/video/clip.ts:14`, `app/api/hot/route.ts:37`). **(computed)**

**Do:** one exported, suffix-aware normalizer reading the API's structured `firstName`/`lastName`
rather than splitting a display string, emitting a canonical `name` plus a *stored*
`name_normalized` — stored because Postgres does not normalize Unicode on input
(`Li/entity-resolution/03-name-matching-algorithms.md`). **Anti-recommendation:** no fuzzy matching
here; all six paths hold the MLBAM ID already, and fuzzy matching belongs to item 9. **Stop
condition:** six writers import one function, under a golden test covering suffixed, hyphenated,
accented and double-surname inputs.

## NEXT (6 weeks – 6 months)

### 7. Treat `team` as a time-varying fact, not a column to backfill

`players.team` is populated on 0 of 16,931 rows. The tempting fix — a nightly job writing the current
team — is wrong the next time someone is traded, and retroactively for every row it touches. Team is
an attribute of a player-season *interval*, and Triton knows this implicitly:
`app/api/scene-stats/route.ts:1086` and `:1666`, plus `scripts/create-materialized-views.sql:26`,
reconstruct a `primary_team` with `MODE() WITHIN GROUP`. A traded player gets one modal team and
`app/api/scene-stats/route.ts:1098` applies that stadium's park factor to his whole season; Postgres
returns an arbitrary value among `mode()` ties, so `primary_team` is not reproducible across
refreshes. Read sites meanwhile render the empty column
(`app/api/daily-highlights/route.ts:70`). **(computed)**

**Do:** a Type-2 roster-membership interval, `(player_id, team_id, valid_from, valid_to, source)`.
`retro_rosters` seeds it but is season-grain (`scripts/create-retro-tables.sql:128-134`), so it gives
membership, not trade dates; those come from the transaction feed or first/last `game_date` per
`(player, team)`, and park adjustment becomes a per-game join
(`Li/temporal-modeling/06-slowly-changing-dimensions.md`;
`Li/entity-resolution/06-team-league-hierarchies.md`). **Stop condition:** one surface reads the
interval table and a traded player's split season park-adjusts each half; until then, delete the
`pl.team` selects.

### 8. Build `person` and `person_external_id` beside `players`, never instead of it

The registry shape from `Li/entity-resolution/02-crosswalk-construction-maintenance.md` §4: a
Triton-owned `person_id` plus one long-format external-ID table carrying `id_space`, `external_id`,
`source`, `source_version`, `match_method`, `confidence`, `valid_from`, `valid_to`, with a unique
index on `(id_space, external_id) WHERE valid_to IS NULL`. Long, not wide: seven spaces in seven
columns makes "unmapped" and "not applicable" the same NULL. It supersedes `retro_id_map`
(`scripts/create-retro-tables.sql:228-238`), which crosswalks four spaces but only for people
Retrosheet knows. `players.id` stays MLBAM and stays the FK target for ~8.88M `pitches` rows;
`person` sits beside it, bridged by `id_space = 'mlbam'`.
**Stop condition:** a coverage query returns one row per `id_space` with a count and fill rate, the
live-mapping unique index survives a full register load, and item 4's dropped rows are
representable. **(established)**

### 9. Bind facility identity at ingest, the way Whoop and Captury already do

Three sources, three outcomes, and the difference is not difficulty. Whoop binds at the OAuth
callback, where the athlete authenticates to the source itself
(`app/api/compete/whoop/callback/route.ts:46-52`); Captury requires the athlete on upload against a
`not null` FK (`scripts/create-biomech-captures.sql:18`); both are fully linked. TrackMan made it
optional: `lib/compete/pitchSchema.ts:282-287` defaults `athlete_profile_id` to null and
`app/api/compete/performance/upload/route.ts:45` passes only `session_id` and `uploaded_by`, so
`scripts/create-compete-pitches.sql:51` has never been written; `trackman_pitches` has no link column
at all (`scripts/create-trackman-schema.sql:44-45`). The row is not wrong, it is unattributable —
`uploaded_by` is whoever dropped the CSV, so every athlete-level Compete metric is computed over a
population defined by who uploaded. **(computed)**

**Do:** resolve every distinct `tm_pitcher_id` to an `athlete_profiles` row before insert, asserted
once per athlete rather than per pitch, as `docs/compete-performance.md:59-63` sketches; and change
`on delete set null` at `scripts/create-compete-pitches.sql:51` to `restrict`, so *de-linked* stays
distinguishable from *never linked* (`Li/entity-resolution/08-facility-athlete-linking.md`).
**Stop condition:** new sessions insert fully linked, and the backlog reports `unlinked_subjects`
alongside `unlinked_rows`.

### 10. Record the provenance of `athlete_profiles.player_id` — it is an assertion, not a fact

The one point where the facility ID space meets MLBAM, written from request bodies on create and
update (`app/api/compete/profile/route.ts:58`, `:106`) with self-service creation allowed, and
trusted downstream — `app/api/mechanics/report/route.ts:39-42` joins `players.name` on it. There is
no `create table public.athlete_profiles` anywhere in `scripts/`, only FK references, so no guarding
constraint is verifiable. This is survivorship, not validation
(`Li/entity-resolution/07-master-data-management-patterns.md`): a claimed MLBAM ID and an
operator-verified one are different-confidence assertions in one column, and the golden record
inherits the weakest. Item 8's `match_method`/`confidence` are where this belongs. **(computed)**

**State plainly, in the schema comment and the UI:** a missing `players` row is not evidence that an
athlete has no MLBAM ID — `players` lists only people who have thrown or faced a tracked
professional pitch, and amateur athletes may never hold one. **A crosswalk treating MLBAM as the hub
fails for exactly the population Compete serves** — hence `person_id` in item 8. **(established)**

**Stop condition:** every `player_id` carries a `match_method`, and a report rendering a name pulled
through a self-asserted link says so.

### 11. Retire the name-keyed umpire route — the ID is already stored

`app/(research)/umpire/page.tsx:138` pushes `encodeURIComponent(name)`;
`app/(research)/umpire/[name]/page.tsx:71` decodes it; `app/api/umpire/route.ts:69` interpolates it
into SQL equality, and the whole scorecard keys on that string (`:78`, `:151`). The MLBAM official ID
is written on every row by `app/api/cron/roster/route.ts:112` and again by
`app/api/cron/challenges/route.ts:66`, and no query reads it. **(computed)**

A name-keyed URL is an identity decision baked into the routing table, which is what makes it dearer
later than now. Standing cost: any spelling variation from the feed silently splits one umpire into
two scorecards, and `app/api/umpire/route.ts:44` groups the leaderboard on the same string, so the
split reads as two under-gamed umpires rather than a fault. Replacement cost: a route rename plus a
redirect, since every shared `/umpire/<name>` link must keep resolving.

**Stop condition:** `/umpire/[id]` serves the page, `/umpire/[name]` resolves through a lookup and
301s, and the API groups by `hp_umpire_id` with the name carried for display only.

### 12. Stop `historical/[lahmanId]` from forking identity on a nullable column

`app/(research)/historical/[lahmanId]/page.tsx:32-35` redirects to `/player/<mlb_id>` or
`/hitter/<mlb_id>` whenever `d.player.mlb_id` is non-null — which means only that the register held a
key, not that Triton has Statcast rows. The sibling search route computes the right predicate,
`EXISTS (SELECT 1 FROM players pl WHERE pl.id = p.mlb_id)` (`app/api/lahman/search/route.ts:21-23`);
the player route does not (`app/api/lahman/player/route.ts:15-23`). A 1990s debutant is redirected
off the page holding his data, on a value from item 2's defective lookup. **(computed)**

**Stop condition:** the redirect fires only when a `players` row exists *and* has pitch data; a
pre-2015 player with a register MLBAM ID is the test case.

## LATER (6+ months)

### 13. Measure the duplicate-person base rate before building any duplicate alarm

513 of 16,931 `players` rows share a name with an earlier row and four MLBAM IDs answer to
`Gonzalez, Jose`, overwhelmingly distinct people. If *D* is the number of true duplicates, a
name-equality alarm has positive predictive value at most *D*/513 — about 4% at *D* = 20 — unusable
as a page (`Li/entity-resolution/09-identity-quality-monitoring.md` §4), and a duplicate written once
each way evades it entirely. `players` carries no birth date, and that column is already fetched and
discarded: `lib/dataIntegrity.ts:26-42` returns only `{name, position}` while
`app/api/game/player-meta/route.ts:31` parses `birthDate` from the identical payload.
**(estimated — arithmetic on the measured 513; *D* is unmeasured)**

**Do first, and possibly only:** non-overlapping career spans — same-named IDs with disjoint
`game_date` ranges are merge candidates, two in one game are conclusively different people, and no
new column is required. **Stop condition:** a measured PPV on a hand-reviewed sample, published
before any alarm ships; candidates stay a queue, not an alert, until it clears ~50%.

### 14. Name history, and merges that can be undone

Once item 6 stores a normalized name and item 8 owns `person_id`, add an append-only name history
and a `person_merge_log`. Retrosheet's biofile carries `birthname` and `altname`, both discarded at
`scripts/ingest-retrosheet.ts:438-448`. A merge nobody can reverse is a merge nobody will authorize,
which is why this gates item 13 ever *acting* rather than only reporting.
**(established) Stop condition:** a merge can be reversed and the leaderboard it changed explained.

### 15. Decide restatement now, in writing: annotate, do not recompute

Several items above mean numbers already shown to users were attached to the wrong person or to no
person. Make the call explicitly. **Do not recompute history.** `pitches` has no `created_at` or
`updated_at`, so the date an association was made is unrecoverable; `players.updated_at` is
overwritten in place by `app/api/cron/roster/route.ts:52`; and `scripts/ingest-retrosheet.ts:484`
destroys a corrected mapping's predecessor. A retroactive repair cannot be dated, so a restated
number is no more defensible than the original. The temporal half is
`Li/applied/temporal-modeling-applied.md`. Fix forward, stamping `source_version` on every mapping
from item 8 onward. **(established)**

**Stop condition:** a paragraph in `docs/VARIABLES.md` naming the date from which identity mappings
are versioned, and what "before that date" means.

## Standing Rules

- **Exact name equality is a blocking step, never a decision step**, and never add a new name-keyed
  URL, column or join — item 11 is the cost of one that already exists.
- **A NULL link and an inapplicable link are different facts.** Model absence as a missing row in a
  long table, not a NULL in a wide one — null-versus-zero, in the identity layer.
- **Every mapping carries `source`, `source_version`, `match_method`, `confidence`.** A mapping
  without provenance cannot be audited, reversed, or ranked against a competing assertion.
- **Bind identity at write time; resolve only at the margin.** Whoop and Captury are fully linked
  because the link is a precondition of the write.
- **Monitor inflow, not residual, wherever a repair loop exists.** A self-healing check reports the
  health of the healer, not of the data.
- **`players.id` stays MLBAM, and MLBAM is one ID space, not the hub.** A design unable to represent
  an athlete who will never have an MLBAM ID is not a Triton-wide crosswalk.
- **Hand off by filename.** Scheduling, alerting and query performance are
  `Jo/applied/data-reliability-applied.md` and `Jo/applied/postgres-performance-applied.md`; how an
  unresolved identity is shown is `Cas/analytics-ux/`. On the audit's suggested order: pipeline
  repair first is right, but that list predates the `players` measurement and holds no identity item
  — items 1–6 are blocked by nothing on it and should run in parallel rather than after.

**Triton-internal evidence.** Fill rates from the read-only measurement pass of 2026-08-12 —
`players` 16,931 rows, 16,418 distinct names (513 shared), `team` 0%, `lahman_id` 19%; planner
statistics were NULL everywhere inspected, so counts are approximate. `pitches` ≈ 8.88M rows /
9.7 GB, 2015→2026, no `created_at`/`updated_at`. Every `file:line` above was read
against commit `6679363`; the load-bearing ones are `scripts/import-lahman.ts:89-91` with `:104`;
`scripts/ingest-retrosheet.ts:437-438`, `:641-652`; `lib/dataIntegrity.ts:97-116`;
`app/api/update/route.ts:38-40` with `:53`; `lib/compete/pitchSchema.ts:282-287` with
`app/api/compete/performance/upload/route.ts:45`. External sources checked 2026-08-22: `chadwickbureau/register` live, `data/people-{0..f}.csv`
present, republished roughly weekly; Lahman v2025 from SABR, released 2026-01-02, CSVs re-issued
2026-02-18 for byte-order marks; `chadwickbureau/baseballdatabank` retired, dead in six docs at the
2026-08-12 link sweep.
