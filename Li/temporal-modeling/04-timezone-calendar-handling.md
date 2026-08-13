---
title: Timezones & the Baseball Calendar — Why Game Date Is Not a UTC Date
domain: temporal-modeling
tags:
  - timezones
  - timestamptz
  - game-date
  - doubleheaders
  - suspended-games
  - dst
  - business-date
  - cron-scheduling
sources_reviewed: 17
last_updated: 2026-08-12
---

# Timezones & the Baseball Calendar — Why Game Date Is Not a UTC Date

> Grades: **(established)** spec or published rule; **(computed)** verified against Triton source at
> the cited line, read not queried; **(estimated)** from theory, assumptions stated.

## TL;DR

- **`timestamptz` does not store a time zone.** It stores an instant; the input offset normalizes and
  is discarded. The most expensive misnomer in Postgres. **(established)**
- **`date` is the right type for `game_date`, and Triton got it right.** A business date carries no
  instant; the danger is at the edges, where it is *derived* or joined to one.
  **(computed — `app/api/data-export/route.ts:15`)**
- **MLB's game date is scheduled, not computed** — the official ET-anchored date, recoverable from no
  instant by any rule; a UTC-derived one misdates the home night games of **16 of 30 clubs**.
  **(established / estimated)**
- **Triton stores no instant on either fact table** — `game_date` (`date`) + `game_year` (int), no
  timestamp column — so doubleheaders are separable only by `game_pk` and `max(game_date)` is the only
  watermark available. **(computed — packet, 2026-08-12)**
- **Two competing date derivations, and the wrong one is 3× more common**: `ymdInTimeZone()` (ET,
  exact) in 10 files; the UTC-truncating `toISOString().slice(0,10)` idiom at **42 call sites across
  30 files**, three of them wrong. **(computed — grep, 2026-08-12)**
- **One live off-by-a-day in the broadcast path**: `scene-stats`' `yesterdayScores` default is
  UTC-yesterday, so from 20:00 ET to midnight it returns **today's** ET games under a "yesterday"
  label. **(computed — `app/api/scene-stats/route.ts:620`)**
- **Doubleheaders survive only because Triton keys on `game_pk`**; matchup's "last 15 games" groups by
  `game_date` and merges both halves. **(computed — `app/api/models/matchup/route.ts:64`)**
- **Suspended-game stats are credited to the *original* date**, so `game_date` is not monotone in
  ingest order and that watermark cannot see the correction. **(established)**
- **All 18 `vercel.json` crons are UTC-scheduled against an ET calendar**, and DST defects can only
  fire Feb–mid-March and after early November, since the season sits inside EDT. **(computed /
  estimated)**

---

## 1. The three time types, and what each refuses to remember

| Type | Stores | Remembers a zone? | Correct use in Triton |
|---|---|---|---|
| `timestamptz` | an **instant** (µs since 2000-01-01 UTC) | **No** — input offset discarded | *When something happened*: `updated_at`, `uploaded_at`, `created_at` |
| `timestamp` | wall-clock digits, no instant | No, and no offset | Almost never — a "3:07 pm" naming no moment |
| `date` | a calendar day | No zone by construction | **Business dates**: `game_date`, `session_date`, `pitch_date` |

The trap is the name: `timestamptz` is *absolute*, `timestamp` *floating*. Neither records "7:10pm in
Denver" — that needs instant plus IANA zone id, two columns, as RFC 9557 standardized. Insert
`'2026-08-12 19:10:00-07'` and it returns rendered in the *session's* `TimeZone` (UTC on Supabase):
the offset is gone, silently.

---

## 2. `AT TIME ZONE` — one operator, two opposite meanings

Direction depends on the **input** type; backwards is wrong by exactly one offset, silently.

| Expression | Input | Result | Meaning |
|---|---|---|---|
| `ts_tz AT TIME ZONE 'America/New_York'` | `timestamptz` | `timestamp` | **Render** the instant as ET wall clock |
| `ts AT TIME ZONE 'America/New_York'` | `timestamp` | `timestamptz` | **Interpret** these digits as ET → an instant |
| `ts_tz::date` | `timestamptz` | `date` | Truncate in the **session's** `TimeZone` |
| `date_col::timestamptz` | `date` | `timestamptz` | Midnight in the **session's** `TimeZone` |

Three exposures. **(1)** `created_at::date` is not stable — a UTC cron and an ET analyst get different
days for one row, so always name the zone. **(2)** That expression is unindexable:
`timezone(text, timestamptz)` is `STABLE`, not `IMMUTABLE`, so the index is rejected; the fix is
**storing the business date as a real `date` column at write time**, not an immutable-wrapper hack.
**(3)** `WHERE created_at >= '2026-08-01'` casts the literal in the session `TimeZone`, so one query
returns different rows for a service role than for an analyst.

---

## 3. Why the game date is a business date, not a derived date

A game's date is its **scheduled official date**, anchored to the Eastern baseball calendar — never
computed from first pitch, last out, or any UTC instant.

| Situation | ET date of first pitch | UTC date of first pitch | Official `game_date` |
|---|---|---|---|
| 7:10pm PT start, Aug 12, ending 10:20pm PT | Aug 12 (22:10 ET) | **Aug 13** (02:10 UTC) | **Aug 12** — no rollover at either end |
| 10:10pm PT start after a rain delay | **Aug 13** (01:10 ET) | Aug 13 | **Aug 12** — the *scheduled* date |
| Suspended Jun 26, resumed Aug 26 | Aug 26 | Aug 26 | **Jun 26** (§7) |

Row 2 kills every derivation rule: the game date is not even the ET date of first pitch — it lives
only in the schedule. **A business date is recorded, never inferred.**

**Magnitude.** At the modal 7:10pm local start, 14 of 30 clubs host in Eastern; the other **16**
(8 Central, 2 Mountain, 6 Pacific) start 20:10 ET or later under EDT — at or after 00:10 UTC — so a
UTC-derived date pushes their home night games to the next day: plausibly half the schedule, daily.
*(estimated — zone counts exact, modal start assumed.)* The schema is right; the risk is derived
dates (§5) joined to `timestamptz` metadata (§4).

---

## 4. Triton's time-type census

| Column | Type | Note |
|---|---|---|
| `pitches.game_date`, `milb_pitches.game_date` | `date` | business date; correct — **no timestamp column on either table** |
| `pitches.sv_id` | `text` | Savant per-pitch id, exempt from numeric coercion and never parsed — **not a time source until validated** |
| `players` / `player_season_stats` / `league_averages` `.updated_at` | `timestamptz` | transaction time — the only instants near the metric stack |
| `compete_pitch_sessions.session_date` / `.uploaded_at` | `date` / `timestamptz` | one row, two time frames |
| `compete_pitches.pitch_date` / `.pitch_time` | `date` / **`text`** | TrackMan-native text, not a Postgres time type |

**The instant a pitch was thrown is not in the database** — only its business date. Defensible
(nothing in Stuff+, command or deception needs a wall clock), but day/night splits and delay length
are unanswerable from `pitches`, and **doubleheaders cannot be separated by time**.

**`compete_pitches` splits one measurement across three frames** — `pitch_date` zone-less, `pitch_time`
an unparsed string, `created_at` an instant — and reassembling the moment needs the facility's zone,
stored nowhere. All 443 rows land on 2026-04-13 — never yet across a DST boundary or a second
facility: latent, not benign. Worse, **the raw TrackMan string goes straight into the `date` column**
— `rowToDb` passes the CSV `Date` through untouched, so Postgres parses it under the session
`DateStyle` (default `ISO, MDY`): `01/02/2026` is January 2nd under MDY, February 1st under DMY. **A
text date from an external instrument must be parsed explicitly, never coerced.** Format validation is
**Jo**'s; a session date wrong by up to eleven months with no error is Li's.

---

## 5. How Triton derives dates in code

`lib/dateTz.ts:10–18` is the correct primitive: `ymdInTimeZone()` reads `Intl.DateTimeFormat` parts in
`America/New_York` and formats via `en-CA` — exact, because it never round-trips a `Date` constructor.
Ten files use it. Against that, `new Date().toISOString().slice(0,10)` and its `.split('T')[0]` twin
appear at **42 call sites across 30 files**, mostly harmless. Three are not.

### 5.1 The double conversion, live in three routes

`lib/dateTz.ts:4–6` names this bug in a comment and exists to replace it. It is still running, as
`new Date(now.toLocaleString('en-US', {timeZone:'America/New_York'}))` → `setDate(getDate()-1)` →
`toISOString().slice(0,10)`. It parses ET wall-clock digits as **runtime-local**, then reads them back
as **UTC**. Those frames cancel only when the runtime's `TZ` is UTC — true on Vercel, false on a
developer machine, documented nowhere; from a Pacific laptop every ET evening yields tomorrow. And
`toLocaleString('en-US')` emits `M/D/YYYY, h:mm:ss AM`, which ECMA-262 does **not** require
`Date.parse` to accept; the value feeds `resolveAllBindings(tmpl.blocks, sendDate)`, so a wrong day
sends a correct-looking newsletter about the wrong slate. Sites: `emails/send:44–46`, `emails/preview:34–36`, `newsletter/preview:16–18`. Two
more in `lib/gameConstants.ts:4,12` are round-trip-safe but share the unspecified-parse fragility.

### 5.2 The one that is wrong in production right now

`app/api/scene-stats/route.ts:620` defaults `yesterdayScores` to `new Date()` → `setDate(getDate()-1)`
→ `toISOString().slice(0,10)`: *UTC* yesterday, no ET anywhere. From 20:00 ET to midnight (19:00
under EST) the UTC clock has already rolled, so "yesterday" resolves to **today's** ET date — a
four-hour window every evening, precisely when a broadcast is live, labelling today's partial slate
"Yesterday's Scores." Fix: `addDaysToYmd(ymdInTimeZone(), -1)`. Showing the resolved date on screen is
**Cas**'s call; the resolution rule is Li's.

### 5.3 A UTC year, and UTC crons

`app/api/cron/player-stats/route.ts:17` picks its season with `new Date().getFullYear()` (the runtime,
i.e. UTC, year) while `/api/cron/pitches` uses `ymdInTimeZone()` — safe at 09:30 UTC on Jan 1, but an
inconsistent rule a schedule change would expose. All 18 `vercel.json` cron entries are UTC; Vercel
offers no zone option. `/api/cron/pitches` at `0 9 * * *` fires at 05:00 EDT / 04:00 EST, computes
today's ET date and re-syncs `[today−3, today]`.
**The three-day window is what makes the seam survivable** — a West Coast game finishing at 01:30 ET
on the ET date *after* its `game_date` sits well inside it, and Savant's late delivery dominates the
timezone effect anyway (`03-late-arriving-data.md`).

---

## 6. Doubleheaders

Two official games share one `game_date`. Traditional (single-admission) and split (day-night) both
yield two schedule rows; 2020–21 also made them seven innings, changing per-game denominators.

| Site | Grain | Safe? |
|---|---|---|
| `app/api/update/route.ts:148` — upsert key `game_pk,at_bat_number,pitch_number` | game | **Yes** — halves never collide |
| SP/RP rule — `GROUP BY pitcher, game_pk HAVING COUNT(*) >= 50` (`scene-stats:844`) | game | **Yes** — both halves count toward ≥3 |
| `app/api/models/matchup/route.ts:57–66` — velo trend, `GROUP BY game_date … LIMIT 15` | **date** | **No** — "last 15 games" is last 15 *dates* |

**Rule: never let `game_date` be the game grain** — it is the *day* grain, and both halves counting as
one is the commonest way a reliever's workload spike gets understated.

**The join hazard is worse than the grain hazard.** Retrosheet's key *is* date-based: `game_id` =
team + date + DH digit (`ATL198304080` — trailing `0` single, `1` first, `2` second), and
`retro_games.game_number` stores the same ordinal. `pitches` has `game_pk` and **no** `game_number`,
so a Retrosheet↔Statcast join on (date, teams) is ambiguous for exactly the games where both halves
exist — two systems keying one business date differently
(`entity-resolution/06-team-league-hierarchies.md`).

---

## 7. Suspended and resumed games

MLB credits a suspended game's statistics to its **original** date, not the resumption date. The 2024
Blue Jays–Red Sox game is canonical: suspended June 26, completed August 26, Danny Jansen appearing
for both clubs in one game, all recorded against June 26 — the rule that lets a player log a stat
before his listed debut.

So **`game_date` is not monotone in ingest order**: June 26 rows can land in late August, a
`max(game_date)` watermark skips them, and the 3-day re-sync cannot reach back two months — the
sharpest case for `03-late-arriving-data.md`'s rule that watermarks track *transaction* time, not
*valid* time. It also means **as-of queries over `game_date` silently gain history**: "ERA through
June 30, as of July 1" differs today, with no restatement flag (`01-as-of-correctness.md`,
`09-retroactive-restatement.md`).

---

## 8. DST and calendar arithmetic

US Eastern runs EDT (UTC−4) from the second Sunday in March to the first Sunday in November, EST
otherwise — fixed in 2007 by the Energy Policy Act of 2005 and distributed through the IANA tz
database, shipping several releases a year as governments change the rules.

1. **Never do date arithmetic on an instant.** `d.setDate(d.getDate() - 1)` subtracts a calendar day
   in the *runtime's* zone; `t - interval '1 day'` on a `timestamptz` subtracts one in the *session's*
   (Postgres treats `'1 day'` as a calendar step, not 24 hours). Triton's helpers are right:
   `addDaysToYmd` does UTC-midnight math on a `YYYY-MM-DD` string (`lib/dateTz.ts:27–32`) and
   `addDaysUtc` carries the comment *"in UTC so DST can't shift a boundary"*
   (`app/api/update/route.ts:287–291`) — safe because a `date` has no zone to shift.
2. **A wall-clock difference is not an elapsed duration.** `lib/gameConstants.ts:10–17` gets
   seconds-until-11am-ET by subtracting two zone-shifted `Date` objects, so across spring-forward it
   overstates the interval by 3,600 s (understates by the same on fall-back). Only a CDN TTL — but
   archetypes get copied.
3. **Not every US park observes DST.** Arizona is MST year-round — ET−2 in winter, ET−3 in summer — so
   any fixed offset from ET is wrong at Chase Field seven months a year. Use IANA zone ids.

**Why these hide.** The regular season runs late March to early October — entirely inside EDT — so
both transitions fall in the offseason or spring training, when volume is lowest and nobody is
watching. A defect here gets a two-week window each year to be noticed in and eleven months to
accumulate wrong rows. *(estimated — from schedule structure and transition dates, both established.)*

---

## 9. What Triton should do, in order

1. **Fix `app/api/scene-stats/route.ts:620` today** — `addDaysToYmd(ymdInTimeZone(), -1)`. One line,
   wrong four hours a night, and those are broadcast hours.
2. **Replace the three double-conversion sites** (`emails/send:44`, `emails/preview:34`,
   `newsletter/preview:16`), then `lib/gameConstants.ts:4,12` — currently correct, the most dangerous
   state for a fragile idiom.
3. **Ban the idiom mechanically** — an ESLint `no-restricted-syntax` rule on `toISOString()` followed
   by `.slice(0,10)`/`.split('T')[0]`, and on `new Date(x.toLocaleString(…))`, allowlisting filename
   and lookback uses. Discipline decayed at 42 sites; a lint rule will not.
4. **Write the rule into `docs/VARIABLES.md`:** `game_date` is the *official ET-anchored business
   date*, never derived from an instant, and is the **day** grain; `game_pk` is the game grain.
5. **Give `compete_pitches` a real instant** — `pitch_at timestamptz` plus a facility IANA zone on the
   session, from `pitch_date` + `pitch_time` at upload, parsing the TrackMan string under a declared
   format, not the session `DateStyle`.
6. **Add `game_number` or a `game_pk`↔`retro_game_id` crosswalk** before any Retrosheet↔Statcast join
   ships; until then treat doubleheader dates as unjoinable. Move matchup's velo trend to
   `GROUP BY game_pk` and relabel `game_date` axes "by date," not "by game."
7. **Make watermarks transaction-time** — suspended games and Savant restatement both write into the
   past and `max(game_date)` sees neither. Detection is **Jo**'s; separating valid from transaction
   time is `02-bitemporal-modeling.md`.

**Anti-recommendation — do not convert `pitches.game_date` to `timestamptz`, or add a `first_pitch_at`
and derive the date from it.** Intuitive, wrong on three independent grounds. **(i) A type error about
the domain:** the date is assigned by the schedule, and the rain-delayed 10:10pm PT start (§3) and the
June-26/August-26 suspended game (§7) both have a correct date no rule over first pitch reproduces.
**(ii) The instant does not exist to migrate:** neither fact table stores a timestamp, so a backfill
would synthesize one from the schedule API across ~11.4M rows and round-trip it back to the date it
already has — invented precision at Jo's worst measured write cost. **(iii) It costs the safe
property:** `date` comparisons are zone-independent while
`timestamptz` comparisons depend on the session `TimeZone` (§2), so every string-interpolated
`game_date >= '…'` filter in the stats routes would quietly become session-dependent. The real gap is
`game_number` discipline (§6): a column, not a type change.

**Single highest-leverage next action:** fix `scene-stats:620` and add the ESLint rule in the same
commit. That turns a live nightly wrong answer into a regression test, and it is the only item that
stops the defect class regrowing at the 42 sites already in the tree.

---

## Sources

1. PostgreSQL — [Date/Time Types](https://www.postgresql.org/docs/current/datatype-datetime.html) — §1's authority: `timestamptz` stores an instant and discards the offset; `date` has no zone.
2. PostgreSQL — [Date/Time Functions and Operators](https://www.postgresql.org/docs/current/functions-datetime.html) — the input-type-dependent `AT TIME ZONE` table in §2.
3. PostgreSQL wiki — [Don't Do This](https://wiki.postgresql.org/wiki/Don%27t_Do_This) — the project's case against `timestamp without time zone`; §1's last column.
4. PostgreSQL — [Client Connection Defaults](https://www.postgresql.org/docs/current/runtime-config-client.html) — the `TimeZone` and `DateStyle` GUCs behind §2 and §4's MDY/DMY hazard.
5. PostgreSQL — [Indexes on Expressions](https://www.postgresql.org/docs/current/indexes-expressional.html) — the `IMMUTABLE` rule that blocks an ET-truncation index; §2's stored-column fix.
6. IANA — [Time Zone Database](https://www.iana.org/time-zones) — zone-id authority and release cadence behind §8's rule: IANA ids, not offsets.
7. IETF — [RFC 9557](https://www.rfc-editor.org/rfc/rfc9557.html) — adds an IANA zone annotation to RFC 3339: §1's "two columns," standardized.
8. TC39 — [ECMA-262 Date Time String Format](https://tc39.es/ecma262/#sec-date-time-string-format) — date-only strings parse as UTC, offsetless ones as local, non-conforming ones implementation-defined: §5.1.
9. MDN — [`Date.parse()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/parse) — the explicit warning against parsing `toLocaleString` output; §5.1's indictment.
10. MDN — [`Intl.DateTimeFormat`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat) — the `timeZone` option and `en-CA` output that make `ymdInTimeZone()` exact.
11. Node.js — [CLI environment variables (`TZ`)](https://nodejs.org/api/cli.html#tz) — the undocumented dependency making §5.1 correct on Vercel, wrong elsewhere.
12. Vercel — [Cron Jobs](https://vercel.com/docs/cron-jobs) — cron expressions evaluate in UTC, no zone option; §5.3's constraint.
13. Martin Fowler — [Patterns for things that change with time](https://martinfowler.com/eaaDev/timeNarrative.html) — "actual time" vs "record time," §7's watermark vocabulary.
14. Retrosheet — [Game log field descriptions](https://www.retrosheet.org/gamelogs/glfields.txt) — the "Number of game" codes (`1`/`2`/`3`, `A`/`B`) `retro_games.game_number` mirrors.
15. Retrosheet — [Event file format](https://www.retrosheet.org/eventfile.htm) — the `ATL198304080` decomposition (team + date + DH digit) in §6.
16. Wikipedia — [Doubleheader (baseball)](https://en.wikipedia.org/wiki/Doubleheader_(baseball)) — single-admission vs split/day-night; the 2020–21 seven-inning rule.
17. Wikipedia — [Suspended game](https://en.wikipedia.org/wiki/Suspended_game) — statistics credited to the original game date, with the 2024 Jansen case: the whole of §7.

**Triton-internal evidence (code-verified 2026-08-12; nothing here came from querying the database).** From the central measurement packet: `pitches`/`milb_pitches` carry `game_date date` + `game_year int` and **no** timestamp column; `players`/`player_season_stats`/`league_averages` `.updated_at`, `compete_pitches.created_at` and `compete_pitch_sessions.uploaded_at` are `timestamptz`; `compete_pitches.pitch_date` is `date` while `pitch_time` is `text`, 443 rows all on 2026-04-13; `pitches` 2015-03-03→2026-08-10 (≈8,877,621 rows) and `milb_pitches` 2023-03-31→2026-08-11 (≈2,508,422) — ≈11.4M combined, the anti-recommendation's figure. Repo: `lib/dateTz.ts:4–6,10–18,27–32`; `app/api/scene-stats/route.ts:620,844`; `app/api/emails/send/route.ts:44–46`, `emails/preview:34–36`, `newsletter/preview:16–18`; `lib/gameConstants.ts:4,10–17`; `app/api/cron/pitches/route.ts:27–38`; `app/api/cron/player-stats/route.ts:17`; `app/api/update/route.ts:130,148,287–291` with `lib/savantCsv.ts:85`; `app/api/models/matchup/route.ts:57–66`; `lib/compete/pitchSchema.ts:291–292` with `app/api/compete/performance/upload/route.ts:21,30`; `scripts/create-compete-pitches.sql:30,33,58,59,143`; `scripts/create-retro-tables.sql:77`; `docs/VARIABLES.md:512–514`; `app/api/data-export/route.ts:15`; `vercel.json` (18 UTC crons; `pitches` `0 9`, `refresh` `10 9`, `player-stats` `30 9`). **Grep counts, 2026-08-12:** 42 `toISOString().slice(0,10)`/`.split('T')[0]` sites across 30 files under `app/`, `lib/`, `scripts/`; 10 files importing `ymdInTimeZone`; 5 uses of `new Date(x.toLocaleString(…,{timeZone}))`, 3 of which mix frames.
