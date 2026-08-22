# Slice 07 — MiLB Cross-Level Correctness

**Verdict.** The MiLB app reuses the MLB compute layer wholesale, and the reuse is unsafe in three
independent ways at once. (1) `milb_pitches.events` speaks a different vocabulary from `pitches`:
586,959 of 659,265 PA-outcome rows (**89.0%**) are Title Case, which no app-layer metric matches —
so on `/api/milb/report` and every JS dashboard tab, 2023–2025 K%, BB%, BA and IP come out as
literal **0.0 / .000**, and 2026 comes out at almost exactly **half** its true value because a
mid-season ingest change on **2026-06** split the column. The error is directional, not noisy:
numerators string-match on `events`, denominators count `events IS NOT NULL`. (2) MiLB `pfx_x` /
`pfx_z` are on a different numeric scale than MLB's, and the shared code multiplies both by 12 —
`league_averages` stores a MiLB SP induced-vertical-break benchmark of **47.86 inches**, and the
MiLB dashboard plots 4-seamers at ~103" IVB. (3) Baselines are level-mixed by omission: the MiLB
player page's Ranks tab asks `/api/league-percentiles` without a `level` param, so it silently
takes MLB breakpoints even though MiLB rows for 2026 exist in the table; Cmd+/Brink+/Cluster+ are
normalized against hardcoded MLB constants while Stuff+ on the same screen is normalized against
AAA — two plus-stats, two reference populations, both labeled "100 = average." Separately,
`milb_sos_scores` is **0 rows** (its inputs are 100% NULL) while the MiLB Explore page joins the
**MLB** `sos_scores` table onto MiLB stat lines. The MiLB compute layer that *is* correct —
`refresh_league_averages` — proves the fix is already written in this repo and was never carried
into `lib/reportMetrics.ts`.

Denominators used throughout: `milb_pitches` = 2,580,622 rows, AAA only, 2023-03-31 → 2026-08-xx
(2023: 680,960 / 2024: 673,753 / 2025: 669,773 / 2026: 556,136); 659,265 of those rows carry a
non-null `events`. `pitches` = 8,877,621 rows. 15 queries run this session.

---

## F1. `milb_pitches.events` carries two vocabularies; every app-layer metric matches only one

- **Impact:** **critical** — `/api/milb/report` (MiLB Explore, MiLB Reports Builder) and every
  client-computed tab on `/milb/player/[id]` and `/milb/hitter/[id]`: K%, BB%, K-BB%, BA, OBP,
  SLG, OPS, IP, H, 2B, 3B, HR, BB, K, HBP, RE24, ERA/FIP, and the Overview "traditional" and
  "advanced" tables. For 2023, 2024 and 2025 these render as **0 / .000**. For 2026 they render at
  **~50%** of truth. For any range spanning the June-2026 seam they render as an uninterpretable
  blend of the two.
- **Location:**
  - `lib/reportMetrics.ts:9` (`ip`), `:23` (`k_pct`), `:24` (`bb_pct`), `:29` (`ba`), `:30` (`slg`),
    `:31` (`obp`), `:44-51` (`h`, `singles`…`hbp_count`), `:53` (`k_minus_bb`) — all match MLB
    lowercase literals.
  - `lib/pitcherStats.ts:63-69, 97-101, 124-127` — `calcTraditionalByYear` / `calcAdvancedByYear`,
    same lowercase literals, case-sensitive.
  - `components/dashboard/PercentileTab.tsx:114-115`, `GameLogTab.tsx:20-22`,
    `HitterGameLogTab.tsx:16-22`, `GameDetail.tsx:30-37,119-121`, `LocationTab.tsx:53-64`.
  - Origin: `app/api/update/milb/route.ts:245` —
    `events: event ? (EVENT_NORMALIZE_MAP[event] ?? event.toLowerCase().replace(/ /g, '_')) : null`
    with `EVENT_NORMALIZE_MAP` added at `:75`. No backfill accompanied it.
- **What's wrong:** the ingest writes the Stats API's **display** string (`result.event`, Title
  Case). Before the `EVENT_NORMALIZE_MAP` commit it wrote it raw; after, it normalizes. Nothing
  rewrote the history. The metric SQL matches `events = 'walk'`, `events LIKE '%strikeout%'`,
  `events IN ('single','double',...)` — every one of which is case-sensitive in Postgres and in JS
  `String.includes`. Meanwhile the denominators are `COUNT(DISTINCT ... WHERE events IS NOT NULL)`
  and `COUNT(*) FILTER (WHERE events IS NOT NULL AND events NOT IN (...))`, which are vocabulary-
  **in**sensitive. Numerator shrinks, denominator does not: the bias is one-directional and
  downward for every rate, and the BA/SLG denominator is additionally *inflated* because the
  exclusion list `('walk','hit_by_pitch','sac_fly','sac_bunt','catcher_interf')` fails to exclude
  `Walk` (8,092), `Hit By Pitch` (909), `Sac Fly` (562) and `Sac Bunt` (254) in 2026 — those count
  as at-bats.
- **Evidence:**
  - Vocabulary census, `milb_pitches` 2026 (Q3), 68 distinct values, both casings side by side:
    `field_out` 27,776 / `Strikeout` 15,824 / `strikeout` 15,684 / `Groundout` 11,209 /
    `single` 10,528 / `Single` 10,067 / `Walk` 8,092 / `walk` 7,892 / `Flyout` 7,684 …
    Title Case total **70,266**, lowercase total **72,306**, non-null total **142,572** →
    Title Case share **49.28%**.
  - Ran the exact `lib/reportMetrics.ts` expressions against `milb_pitches`, alongside a
    case-normalized control (Q6):

    | season | k_pct impl | k_pct true | bb_pct impl | bb_pct true | ba impl | ba true | ip impl | ip true |
    |---|---|---|---|---|---|---|---|---|
    | 2025 | **0.0** | 22.6 | **0.0** | 10.8 | **.000** | .257 | **0.0** | 38,035.7 |
    | 2026 | **11.0** | 22.2 | **5.5** | 11.2 | **.123** | .259 | **15,840.3** | 31,285.7 |
  - 2023 and 2024 (Q5): `ev_titlecase` = `ev_rows` exactly (172,713 / 172,713 and 172,435 /
    172,435) and `k_pct` as implemented = **0.0** for both.
- **Expected vs actual:** across the whole table, **586,959 of 659,265** event-bearing rows
  (89.0%) are invisible to the app's metric layer. Season-over-season, MiLB K% appears to move
  **0.0 → 0.0 → 0.0 → 11.0** (2023→2026) against a true **~21–23** flat line. Every point of that
  "trend" is artifact.
- **Fix:** three steps, in order.
  1. **Backfill `milb_pitches.events`** with the normalizer that already exists and is already
     correct at `scripts/create-refresh-league-averages.sql:88-118` (`CASE events WHEN 'Strikeout'
     THEN 'strikeout' … END`). The collapse `Groundout/Flyout/Lineout/Pop Out → field_out` is
     *recoverable*, not lossy: `bb_type` is populated on 16.65% of rows — i.e. on essentially every
     batted ball — so batted-ball granularity survives the rewrite. Run it as a one-shot UPDATE per
     season, not nightly.
  2. **Change the ingest to stop generating the problem.** `app/api/update/milb/route.ts:208`
     already extracts `result.eventType` and then discards it; `eventType` is the Stats API's
     snake_case form and is a direct match for the Statcast vocabulary. Write `eventType` instead
     of mapping `event`. *(Confirm against one live game feed before switching — this is the one
     claim here I did not measure.)*
  3. **Add a contract test** (Cas owns) asserting `SELECT count(*) FROM milb_pitches WHERE events
     ~ '[A-Z]'` = 0, so the next ingest change fails loudly instead of silently.
- **Confidence:** verified.

---

## F2. MiLB `pfx_x`/`pfx_z` are on a different scale than MLB's, and shared code multiplies both by 12

- **Impact:** **critical** — every movement number on the MiLB surface. `avg_hbreak_in` /
  `avg_ivb_in` on `/api/milb/report` (Explore → Stuff, Reports tiles), `MovementProfile` and the
  arsenal table on `/milb/player/[id]` Overview, `MovementTab`, the Ranks → Movement view, and the
  stored `league_averages` MiLB benchmarks.
- **Location:** `app/api/update/milb/route.ts:255-256` (`pfx_x: coords.pfxX`, `pfx_z: coords.pfxZ`,
  comment: *"Stats API gives feet, same as Savant raw"*); consumed at
  `lib/reportMetrics.ts:15-16` (`AVG(pfx_x * 12)`), `lib/pitcherStats.ts:301`
  (`avg(hb.map(v => v * 12))`), `components/charts/MovementProfile.tsx:36-37`,
  `app/(milb)/milb/player/[id]/page.tsx` `fetchData` (`p.pfx_x_in = p.pfx_x * 12`),
  `components/dashboard/PercentileTab.tsx:264-265`.
- **What's wrong:** MLB `pitches.pfx_x/pfx_z` are Savant's feet-of-break over the full flight; the
  MiLB ingest stores the Stats API game-feed `coordinates.pfxX/pfxZ`, which are a different unit
  **and** a different measurement interval. Measured ratio ≈ **6.8–7.0×**. The `× 12` in shared code
  is correct for MLB and wrong for MiLB.
- **Evidence:**
  - Q11, `milb_pitches` 2026 4-Seam Fastball (n = 180,486): `AVG(pfx_z)` = **8.586**,
    `AVG(pfx_x)` = −2.421, `AVG(SQRT(pfx_x²+pfx_z²))` = 10.148. Slider 2026 (n = 97,747):
    `AVG(pfx_z)` = 1.119, raw movement 3.683.
  - Q10, baselines for 2026: `milb_pitch_baselines.avg_movement` for 4-Seam = **121.79**
    vs `pitch_baselines` = **17.87**; Sinker 121.78 vs 17.61; Slider 44.17 vs 6.42;
    Changeup 104.65 vs 15.40. Ratios 5.9–6.9×.
  - Q14, stored benchmarks: `league_averages` `avg_ivb_in`, role SP —
    MiLB **47.86** (2026) vs MLB **6.80**; `avg_hbreak_in` MiLB **−10.63** vs MLB **−1.55**.
    MiLB `n_qualified` = 213, MLB = 214.
  - Arithmetic from the measured means: `AVG(pfx_z*12)` on a MiLB 4-seamer = 8.586 × 12 =
    **103.0 inches of IVB**. `MovementProfile.tsx:73` draws reference circles at 6/12/18/24 inches.
- **Expected vs actual:** MiLB 4-seam IVB should read ~15–17"; it reads ~103". MiLB SP league
  average IVB should read ~7"; `league_averages` stores 47.86". Affects 100% of MiLB rows with
  `pfx_x` non-null (99.87% of 2025, 99.68% of 2026).
- **Fix:** decide the storage contract, don't patch the display. Convert at ingest — divide
  `pfxX/pfxZ` by 12 so `milb_pitches.pfx_*` means the same thing as `pitches.pfx_*`, backfill the
  existing 2.58M rows, then re-run `computeMilbStuffPlus` and `refresh_league_averages` for
  2023–2026. Record the conversion factor and the interval difference in `docs/VARIABLES.md`;
  after conversion the two columns are the same *unit* but still not the same *quantity* (see the
  caveat in F4), so the glossary entry must say so.
- **Confidence:** verified for the magnitude and the propagation. The *mechanism* (Stats API
  reports inches over the final ~40 ft of flight, Savant reports feet over the full flight, so the
  net is 12 × 0.53 ≈ 6.4) is probable, not verified — I measured the ratio, I did not confirm the
  API's definition.

---

## F3. The MiLB Ranks tab silently uses MLB percentile breakpoints — and MiLB breakpoints exist

- **Impact:** **critical** — the "Ranks" tab on `/milb/player/[id]`. Every percentile shown for a
  AAA pitcher is his rank **among qualified MLB pitchers**. The Movement view is worse: MiLB
  movement values inflated ~7× (F2) are compared against MLB inch-scale breakpoints, so every AAA
  pitcher pegs the 99th percentile on both H-break and IVB.
- **Location:**
  - `components/dashboard/PercentileTab.tsx:47` —
    `fetch('/api/league-percentiles?season=${season}&role=${role}')`, no `level`.
  - `app/api/league-percentiles/route.ts:13` — `const level = params.get('level') || 'MLB'`.
  - `components/dashboard/PercentileTab.tsx:305` —
    `fetch('/api/movement-percentiles?season=…&hand=…&entries=…')`; that route's SQL is
    `FROM pitches` (`app/api/movement-percentiles/route.ts`, `WITH pool AS (… FROM pitches …)`),
    hardcoded, with no level parameter at all.
  - Mounted at `app/(milb)/milb/player/[id]/page.tsx` → `{tab === 'percentile' && <PercentileTab
    data={data} />}`.
- **What's wrong:** a default parameter. The route defaults `level` to `'MLB'`; the caller never
  overrides it. There is no error and no empty state — a full set of breakpoints comes back, so the
  UI looks healthy.
- **Evidence:** Q13 — `league_percentiles` holds **MiLB / 2026 / SP: 30 metrics, RP: 30,
  hitter: 23**, alongside MLB / 2026 / SP: 48, RP: 48, hitter: 37. The correct population is
  populated and unused. `league_averages` likewise carries MiLB rows for 2023–2026 (SP 29, RP 29,
  hitter 23 per season).
- **Expected vs actual:** a AAA starter at 87.7 mph average velocity (the MiLB SP league mean,
  Q14, n=213) is graded against an MLB SP distribution whose mean is 89.36 — so the entire AAA
  population is shifted downward roughly one league-difficulty step, uniformly, with no label.
- **Fix:** thread a `level` prop through `PercentileTab` from the page (`LocationTab` already does
  this correctly — `level="MiLB"` at `app/(milb)/milb/player/[id]/page.tsx`), pass it to
  `/api/league-percentiles`, and add a `level` parameter to `/api/movement-percentiles` that
  switches the source table. Until the movement route is level-aware, **hide the Movement view on
  MiLB pages** rather than render a 99th percentile for everyone. Also: make
  `/api/league-percentiles` require `level` explicitly instead of defaulting — a silent default is
  what turned this into a wrong answer instead of an error.
- **Confidence:** verified.

---

## F4. Two reference populations for plus-stats on the same MiLB screen, both labeled "100"

- **Impact:** **high** — `/milb/player/[id]` Overview (arsenal table), Pitch Level, and Ranks.
  Stuff+ is normalized to AAA; Cmd+, RPCom+, Brink+, Cluster+, ClusterR/L+, HDev+, VDev+,
  Missfire+ and Close+ are normalized to MLB. A reader comparing "Stuff+ 108, Cmd+ 88" on one row
  is comparing two different claims.
- **Location:**
  - MiLB Stuff+: `app/api/update/milb/route.ts:466-509` — baselines built from `milb_pitches` into
    `milb_pitch_baselines`, scored with the same 4.5/3.5/2.0 weights.
  - MLB-referenced command: `lib/leagueStats.ts:1` — *"League-level pitcher distributions by year
    (2015-2025 …)"* — `BRINK_LEAGUE_BY_YEAR`, `CLUSTER_LEAGUE_BY_YEAR`, `HDEV_…`, `VDEV_…`,
    `MISSFIRE_…`, `CLOSE_PCT_…`, consumed via `getLeagueBaseline()` at
    `lib/pitcherStats.ts:183-185` and `lib/outingCommand.ts:124-127`, and via
    `computeYearWeightedPlus`/`computeCommandPlus`/`computeRPComPlus` in
    `components/dashboard/PercentileTab.tsx` and `PitchLevelTab.tsx` — all mounted on the MiLB
    player page.
  - `components/charts/MovementProfile.tsx:50` — the arsenal table's "lgAvg" velocity column is
    `STUFF_ZSCORE_BASELINES[name].avg_velo`, which is `BL_BY_YEAR[2026]` — MLB (`4-Seam Fastball:
    avg_velo 94.20`).
- **What's wrong:** neither choice is inherently wrong; having both on one screen without labels
  is. A MiLB-referenced Stuff+ answers "how does this pitch rate in AAA"; an MLB-referenced Cmd+
  answers "how does this command rate in the majors." Placed in adjacent columns under the same
  "+ = 100 is average" convention, they read as one scale.
- **Evidence:** Q10 — the two baseline tables for 2026 differ materially: 4-Seam mean velo
  MiLB 93.65 vs MLB 94.67 (Δ −1.01); Slider 84.64 vs 86.05 (Δ −1.41); Knuckle Curve 80.59 vs 82.69
  (Δ −2.10); Split-Finger 84.94 vs 86.48 (Δ −1.54). Q14 — MiLB SP league-average velocity 87.70 vs
  MLB SP 89.36 (2026, n = 213 / 214). So the same pitch scores ~0.4 Stuff+ points higher against
  the MiLB baseline per 0.25σ of velocity difference, and the arsenal table's "lgAvg" column
  overstates the relevant league mean by ~1.0–2.1 mph for every AAA pitcher.
- **Fix:** pick one policy and encode it, then state it in `docs/VARIABLES.md`. My recommendation:
  keep MiLB plus-stats MiLB-referenced (that is what a development org wants), which means
  building `milb_*` league distributions for the command metrics rather than importing
  `lib/leagueStats.ts`. Until that exists, label the command block on MiLB pages "vs MLB" and the
  Stuff+ block "vs AAA" — an explicit mixed scale beats an implicit one. Independently: replace
  the hardcoded `STUFF_ZSCORE_BASELINES` lgAvg column with a level-aware lookup, or drop the
  column on MiLB.
- **Confidence:** verified (code read + baseline tables measured).

---

## F5. One metric key, two implementations, ~22 points apart — and the correct one is in the repo

- **Impact:** **high** — governance. `league_averages.k_pct` for MiLB/2023/hitter is **22.257**;
  `/api/milb/report` computing `k_pct` over the identical table, season and population returns
  **0.0**. Both are labeled `k_pct`. The same holds for `bb_pct`, `ba`, `obp`, `slg`, `whiff_pct`
  and `ip`.
- **Location:** `scripts/create-refresh-league-averages.sql:88-118` and `:296-326` (a 25-branch
  `CASE events … END AS events_n` normalizer, applied in a CTE, documented in the header comment at
  `:18-22`) vs `lib/reportMetrics.ts` (no normalizer anywhere).
- **What's wrong:** the SQL function that populates `league_averages` and `league_percentiles`
  handles MiLB Title Case correctly and has since it was written. The application metric layer
  never received the same treatment. So the platform's *benchmark* is right and the platform's
  *player value* is wrong — which means MiLB percentile and color-scale comparisons are being made
  between a correct denominator and a broken numerator.
- **Evidence:** Q14, MiLB rows, all four seasons present and all plausible:
  `k_pct` hitter 22.26 / 22.80 / 22.47 / 22.83 (2023–26, n=444 for 2026);
  `bb_pct` hitter 11.79 / 10.81 / 10.71 / 11.26; `ba` hitter .2639 / .2587 / .2584 / .2558.
  Compare Q6's implemented values: 2025 k_pct 0.0, ba .000.
- **Expected vs actual:** the divergence is the full magnitude of F1 — up to 22.6 percentage points
  on K%, .257 on BA, 38,036 innings on IP for a single season.
- **Fix:** after the F1 backfill both surfaces converge automatically. Until then, the highest-value
  single action is to lift the `CASE` block out of `create-refresh-league-averages.sql` into a
  shared SQL fragment and reference it from `lib/reportMetrics.ts`'s MiLB path — one definition,
  one place. Add the two residual mappings the existing normalizer is missing (below).
  Per repo convention this change updates `docs/VARIABLES.md` in the same commit.
- **Confidence:** verified.

---

## F6. Three whole Explore stat sets fail on MiLB because the columns don't exist

- **Impact:** **high** — `/milb/explore`. Selecting **pitching:advanced**, **hitting:advanced**,
  **team:advanced**, **pitching:stuff**, or **hitting:battedball** produces an empty table with no
  error message. Not a missing column — the entire result set.
- **Location:**
  - `lib/leaderboardColumns.ts:171,180,186` include `avg_xslg`; `:172` includes `avg_arm_angle`;
    `:181` includes `avg_attack_angle`, `avg_swing_path_tilt`, `ideal_attack_angle_rate`.
  - `lib/reportMetrics.ts` maps those keys to `AVG(estimated_slg_using_speedangle)`,
    `AVG(arm_angle)`, `AVG(attack_angle)`, `AVG(swing_path_tilt)`, and an `attack_angle` FILTER.
  - `app/api/milb/report/route.ts` → `buildReportQuery({ table: 'milb_pitches', … })`.
  - `app/(milb)/milb/explore/page.tsx:227` — `catch { setRows([]) }`.
- **What's wrong:** `buildReportQuery` validates metric *keys* against `METRICS` but never against
  the target table's columns, so it emits `AVG(arm_angle)` against `milb_pitches`. Postgres fails
  the whole statement; the route returns 500; the page's catch swallows it and renders zero rows.
- **Evidence:** Q9 — `information_schema` diff. Present in `pitches`, absent from `milb_pitches`:
  `arm_angle`, `attack_angle`, `attack_direction`, `swing_path_tilt`,
  `estimated_slg_using_speedangle`, `n_thruorder_pitcher`, plus 39 others. My first null-rate query
  failed with `ERROR: 42703: column "arm_angle" does not exist` — the exact failure the route hits.
  `n_thruorder_pitcher`, `attack_angle`, `attack_direction`, `swing_path_tilt` and `arm_angle` are
  also in `BASE_FILTER_COLS` (`lib/reportQueryBuilder.ts:41-52`), so filtering on any of them from
  the MiLB Filter Engine fails the same way.
- **Expected vs actual:** 5 of 9 Explore stat-set × view combinations are non-functional on MiLB;
  the user sees "no results," which reads as "no MiLB data" rather than "this query is invalid."
- **Fix:** give `ReportQueryConfig` an `unsupportedMetrics: Set<string>` (mirroring what
  `refresh_league_averages` already does with `e_arm_angle := 'NULL::numeric'` at
  `scripts/create-refresh-league-averages.sql:70-84`), substitute `NULL::numeric` for unsupported
  keys, and have `getMetricsForStatSet` accept a level so the columns are dropped from the header
  rather than rendered as a column of em-dashes. Stop swallowing the 500 in the page catch.
- **Confidence:** verified.

---

## F7. MiLB SOS is empty by construction, and the Explore page fills the gap with MLB SOS

- **Impact:** **high** — `/milb/explore` advanced views show a strength-of-schedule column derived
  from **MLB** opponents next to **AAA** production. `/milb/player/[id]` Overview shows no SOS at
  all. Both are silent.
- **Location:**
  - `app/(milb)/milb/explore/page.tsx:193` — `.from('sos_scores')` (the MLB table), keyed on
    `player_id` = MLBAM ID, filtered only by `game_year` and `role`.
  - `app/(milb)/milb/player/[id]/page.tsx` `loadPlayer` — `.from('milb_sos_scores')` (correct
    table, but empty).
  - `app/api/update/milb/route.ts:534-570, 613-640` — `computeMilbSOS` builds every aggregate from
    `SUM(COALESCE(estimated_woba_using_speedangle, woba_value))`.
- **What's wrong:** neither `estimated_woba_using_speedangle` nor `woba_value` is ever written by
  the MiLB ingest (the row object at `app/api/update/milb/route.ts:216-300` has no such keys). So
  `total_xwoba_sum` is NULL for every pitcher, `lg_avg`/`lg_std` are NULL, `loo_xwoba IS NOT NULL`
  filters everything out, and the function upserts nothing — successfully, every night, with
  `ok: true`. The Explore page then reaches for the MLB table, which *does* have rows for those
  same MLBAM IDs.
- **Evidence:** Q12 — `milb_sos_scores` = **0 rows** (`pg_class.reltuples` = −1: never analyzed,
  16 kB). `sos_scores` 2026 = 1,310 rows, of which **644** match a pitcher in
  `milb_player_summary` and **497** match a batter in `milb_batter_summary`. Q8 —
  `estimated_woba_using_speedangle`, `estimated_ba_using_speedangle`, `woba_value`,
  `delta_run_exp`, `launch_speed_angle`, `bat_speed`, `if_fielding_alignment` are **0.00%**
  populated for both 2025 (n = 669,773) and 2026 (n = 556,136).
- **Expected vs actual:** up to 644 pitcher rows and 497 hitter rows per season can display an
  MLB-schedule SOS on a MiLB leaderboard, unlabeled. Meanwhile `xwOBA`, `xBA`, `wOBA`, `RE24`,
  `Barrel%`, `Bat Speed` and the whole swing block are structurally NULL on MiLB and should not be
  offered as columns at all.
- **Fix:** (a) remove the `sos_scores` join from the MiLB Explore page — a blank column is honest,
  an MLB number is not; (b) either compute a MiLB xwOBA surrogate (there is no `launch_speed_angle`
  either, so this is a modeling decision → **Soto**) or delete `computeMilbSOS` rather than run a
  nightly no-op; (c) the "0 rows written but `ok: true`" pattern is a monitoring gap → **Jo**.
- **Confidence:** verified.

---

## F8. Deception and command tables are MLB-only; the MiLB dashboard queries them without a level filter

- **Impact:** **medium-high** — the Deception panel in `PercentileTab` and the per-pitch command
  block in `PitchLevelTab`, both mounted on `/milb/player/[id]`. For a pitcher who threw in both
  MLB and AAA in the same season, values computed from his **MLB** pitches render inside the AAA
  dashboard, beside his AAA arsenal, with no label.
- **Location:** `components/dashboard/PercentileTab.tsx:72` and
  `components/dashboard/PitchLevelTab.tsx:35` —
  `SELECT … FROM pitcher_season_deception WHERE pitcher = ${id} AND game_year IN (…)`, no level
  predicate. Source of those tables: `app/api/compute-deception/route.ts:36` — `FROM pitches`;
  `app/api/compute-triton/route.ts:36,54` — `FROM pitches`.
- **What's wrong:** MLB and MiLB share the MLBAM ID space, so the join succeeds and returns MLB
  rows. There is no MiLB equivalent of either table, so nothing distinguishes "this pitcher has no
  AAA deception score" from "here is his deception score."
- **Evidence:** Q12 — of 1,985 `pitcher_season_deception` rows for 2026, **1,757** are for pitcher
  IDs that also appear in `milb_player_summary`; of 2,368 `pitcher_season_command` rows, **2,097**
  are. (These counts bound the exposure; they do not by themselves prove each display is
  contaminated, because a shared ID means the pitcher appears in both populations.) The source-table
  reads are code-verified: both tables are built exclusively from `pitches`.
- **Expected vs actual:** the panel should be empty for MiLB; instead it renders MLB-derived
  numbers. `pitcher_season_command`'s pitch-weighted season aggregates are also weighted by *MLB*
  pitch counts, so even the weighting is from the wrong population.
- **Fix:** gate both queries on a `level` prop and render an explicit "not computed for MiLB" state.
  If cross-level display is ever wanted, it needs a label and its own denominator, not a silent
  join. Longer term, `pitcher_season_command`/`_deception` need a `level` column and a MiLB build.
- **Confidence:** verified for the mechanism; the per-player contamination count is probable.

---

## F9. The MiLB Explore filter dropdowns are populated from MLB

- **Impact:** **medium** — `/milb/explore` Filter Engine. The `events`, `description`, `game_year`,
  `if_fielding_alignment` and `of_fielding_alignment` option lists come from `pitches`.
- **Location:** `app/(milb)/milb/explore/page.tsx:96-108` — `supabase.rpc('get_distinct_values',
  { col_name: col })` for `['type','events','description','if_fielding_alignment',
  'of_fielding_alignment']` and again for `game_year`.
- **What's wrong:** the RPC is hardcoded to MLB. Verified body (Q15):
  `'SELECT DISTINCT CAST(%I AS TEXT) as value FROM pitches WHERE %I IS NOT NULL ORDER BY value'`.
- **Evidence + expected vs actual:**
  - `events`: the dropdown offers MLB lowercase values only. It therefore *never* offers the Title
    Case values that make up 100% of 2023–2025 MiLB and 49.28% of 2026 — and selecting `strikeout`
    returns 0 rows for 2023–2025.
  - `game_year`: offers 2015–2026; `milb_pitches` starts 2023-03-31. Eight of twelve options
    return nothing.
  - `if_fielding_alignment` / `of_fielding_alignment`: fully populated dropdowns over a column that
    is **0.00%** populated in MiLB (Q8) — every selection returns zero rows.
  - The page does hardcode the 30 AAA team abbreviations for `home_team`/`away_team`
    (`:92-93`), so the author was aware of the level mismatch for some columns but not these.
- **Fix:** add a table parameter to `get_distinct_values` (or add a `get_distinct_milb_values`
  companion) and pass `milb_pitches` from this page. Drop the fielding-alignment filters from the
  MiLB filter set entirely.
- **Confidence:** verified.

---

## F10. The MiLB Explore game-type filter is a silent no-op

- **Impact:** **medium** — every MiLB Explore leaderboard pools regular season, spring training and
  postseason regardless of the selected game type. Qualification thresholds (`minPitches`,
  `minPA`) are therefore applied to a mixed population.
- **Location:** `app/(milb)/milb/explore/page.tsx:162` —
  `filters.push({ column: 'game_type', op: '=', value: gameType })`. `buildReportQuery`
  (`lib/reportQueryBuilder.ts:118-134`) handles only `'in'`, `'gte'`, `'lte'`, `'eq'` and
  `'between'`. `'='` matches nothing, appends no WHERE part, and raises no error.
- **Evidence:** `grep -rn "op: '='"` across `lib app components` returns exactly one hit — this
  line. Every other caller uses the supported vocabulary, so this is MiLB-specific.
- **Expected vs actual:** the UI shows a game-type selector that does nothing. MiLB spring games
  are present (`game_type` 'S' is ingested — the cron sets it by month at
  `app/api/cron/milb-pitches/route.ts:16-19`), so the contamination is real, not hypothetical.
- **Fix:** change `op: '='` to `op: 'eq'`. Separately, make `buildReportQuery` return
  `{ error: 'Unknown operator' }` for unrecognized ops instead of dropping the clause — a filter
  that silently doesn't apply is worse than one that errors.
- **Confidence:** verified.

---

## F11. MiLB landing pages display MLB row counts and MLB last-game dates

- **Impact:** **medium** — `/milb/pitchers` and `/milb/hitters` show "8,877,621 pitches" and an
  MLB `last_date` in the nav chrome. A user reading the MiLB app's own freshness indicator is
  reading MLB's.
- **Location:** `app/(milb)/milb/pitchers/page.tsx:25-26` and
  `app/(milb)/milb/hitters/page.tsx:36-37` — `supabase.from('pitches').select('*', { count:
  'exact', head: true })` and `.from('pitches').select('game_date').order(...).limit(1)`, rendered
  at `pitchers/page.tsx:57` as `{dbInfo.total.toLocaleString()} pitches`.
- **Evidence:** Q2 — `pitches` = 8,877,621 est. rows; `milb_pitches` = 2,508,422 est. (2,580,622
  measured). The displayed number is off by ~3.4×, and the "last date" tracks the MLB ingest, so a
  stalled MiLB cron would still show a current date.
- **Fix:** point both at `milb_pitches`. This is also the wrong place for a freshness signal —
  → **Cas** for how to surface per-source freshness honestly, → **Jo** for the underlying
  MiLB-ingest dead-man switch.
- **Confidence:** verified.

---

## F12. `milb_pitch_baselines` has no `level` key, is destructively upserted, and contains junk rows

- **Impact:** **medium** — MiLB Stuff+ on every MiLB surface. Three separate governance problems in
  one 64-row table.
- **Location:** `app/api/update/milb/route.ts:466-495` (baseline build, `ON CONFLICT (pitch_name,
  game_year) DO UPDATE`), `:497-509` (scoring UPDATE), `SPORT_IDS` at `:11-16`.
- **What's wrong:**
  1. **No level key.** The primary key is `(pitch_name, game_year)`. `SPORT_IDS` currently enables
     AAA only (`AA`, `High-A`, `Single-A` are commented out at `:13-15`), so today the pool is
     homogeneous. The moment another sport ID is uncommented, four levels pool into one baseline
     with no schema change and no error — and every stored AAA Stuff+ silently changes meaning.
  2. **Vintage drift.** The baseline is a full-season-to-date aggregate recomputed nightly, and the
     scoring UPDATE covers `game_date BETWEEN startDate AND endDate` (a 3-day window) with no
     `stuff_plus IS NULL` guard. An April pitch was scored against April-to-date AAA baselines; an
     August pitch against a nearly complete season. There is no `baseline_version` column, so the
     `milb_pitches.stuff_plus` column is not internally comparable across a season.
  3. **Junk baseline rows.** Q10 shows `milb_pitch_baselines` 2026 contains `Fastball`
     (`pitch_count` 361, `std_velo` **13.13**), `FO` (116), `FT` (4, `std_velo` 0.16) — raw Stats
     API codes that fell through `PITCH_NAME_MAP` at `app/api/update/milb/route.ts:19-38`. Any pitch
     landing in those rows gets a z-score against a 4-pitch or 361-pitch distribution. There is no
     `pitch_count` floor.
- **Evidence:** Q8 — `stuff_plus` coverage is **99.87%** for 2025 but **95.63%** for 2026
  (n = 556,136), while `release_speed` coverage is 99.68% — a ~4-point gap between "scorable" and
  "scored" that the 3-day scoring window and the unmapped pitch names together explain.
- **Fix:** add `level` to the `milb_pitch_baselines` primary key **before** enabling any other
  sport ID; add a `pitch_count >= 500` floor to the baseline INSERT and let unmatched pitches score
  NULL rather than against noise; add `PITCH_NAME_MAP` entries for `FO`/`FT`/`FA` or reject
  unmapped codes at ingest; and either add `baseline_version` or commit to an end-of-season full
  rescore. The 4% unscored gap is a coverage question → **Jo**.
- **Confidence:** verified.

---

## F13. Even post-seam, the MiLB event fallback emits values outside MLB's vocabulary

- **Impact:** **low-medium** — residual bias in MiLB BA/OBP/SLG denominators and IP, on top of F1,
  and *also* present in the otherwise-correct `refresh_league_averages` output.
- **Location:** `app/api/update/milb/route.ts:245` — fallback
  `event.toLowerCase().replace(/ /g, '_')`; `EVENT_NORMALIZE_MAP` at `:75-99` has no entry for
  `Catcher Interference`, `Bunt Groundout`, `Bunt Pop Out`, `Bunt Lineout`, `Wild Pitch`,
  `Passed Ball`, `Caught Stealing Home`, `Caught Stealing 3B`, `Triple Play`, `Sac Fly Double Play`.
  `scripts/create-refresh-league-averages.sql:116` maps `'Catcher Interference' → 'catcher_interf'`
  but its `ELSE events` passes the lowercase `catcher_interference` through unchanged, and it has
  no mapping for the lowercase `bunt_*` values.
- **What's wrong:** MLB Statcast writes `catcher_interf`; the MiLB fallback writes
  `catcher_interference`. MLB writes `field_out` for bunt outs; the MiLB fallback writes
  `bunt_groundout` / `bunt_pop_out` / `bunt_lineout`.
- **Evidence:** Q3, 2026 — `catcher_interference` 44 + `Catcher Interference` 41 = 85;
  `bunt_groundout` 80 + `bunt_pop_out` 53 + `Bunt Groundout` 116 + `Bunt Pop Out` 48 +
  `Bunt Lineout` 4 = 301.
- **Expected vs actual:** 85 catcher's-interference plate appearances counted as at-bats in the BA
  and SLG denominators for 2026 (of 142,572 event rows — a .0006 effect on league BA, larger for an
  individual). ~301 bunt outs missing from IP. Both are small league-wide and can be material for a
  single pitcher over a short window.
- **Fix:** fold into the F1 backfill; add the four missing mappings to both the ingest map and the
  `refresh_league_averages` CASE. If step 2 of F1 (`result.eventType`) is adopted, this class of
  defect disappears at the source.
- **Confidence:** verified.

---

## What is working on the MiLB side

- **`description` is clean and MLB-compatible.** Of 1,225,879 rows in 2025+2026, only **35**
  (`Pitchout` 34, `Intent Ball` 1 — 0.003%) fall outside the MLB vocabulary. Every value present —
  `ball`, `foul`, `hit_into_play`, `called_strike`, `swinging_strike`, `foul_tip`,
  `swinging_strike_blocked`, `hit_by_pitch`, `foul_bunt`, `missed_bunt` — is matched correctly by
  `whiff_pct`, `csw_pct`, `swstr_pct`, `contact_pct`, `chase_pct`, `zone_pct`, `z_swing_pct` and
  `o_contact_pct`. `DESCRIPTION_MAP` (`app/api/update/milb/route.ts:41-55`) did its job; the events
  map did not. This is why MiLB `whiff_pct` in `league_averages` (SP 22.43 in 2026, n=213) is
  believable while `k_pct` from the app layer is not.
- **`refresh_league_averages` and `refresh_league_percentiles` handle MiLB correctly** — level-keyed
  storage, Title Case normalized in a CTE, missing columns substituted with `NULL::numeric` so the
  affected metrics drop out cleanly rather than error. `league_averages` holds MiLB rows for
  2023–2026 (SP 29 / RP 29 / hitter 23 metrics per season); `league_percentiles` holds MiLB/2026
  (SP 30 / RP 30 / hitter 23). The correct pattern exists in this repo already.
- **`LocationTab` and the Reports `TileViz` are level-aware.** `app/(milb)/milb/player/[id]/
  page.tsx` and `hitter/[id]/page.tsx` pass `level="MiLB"`, `app/(milb)/milb/reports/page.tsx:806`
  passes `level="MiLB"`, and `lib/useLeagueBaseline.ts` → `app/api/league-baseline/route.ts`
  filters `league_averages` on `.eq('level', level)`. Heatmap color scales on MiLB pages are
  centered on the MiLB mean. This is the model the Ranks tab should have followed.
- **Stuff+ is not broken by the pfx units bug.** The z-score is scale-invariant: both the pitch and
  its baseline are computed as `SQRT((pfx_x*12)² + (pfx_z*12)²)`, so the erroneous factor cancels
  in `(m − μ)/σ`. MiLB Stuff+ is internally consistent within AAA. It is still not comparable to
  MLB Stuff+, for two reasons rather than one: different reference population *and* a movement term
  measured over a different flight interval.
- **MiLB Stuff+ uses a MiLB baseline, not an MLB one.** `computeMilbStuffPlus` joins
  `milb_pitch_baselines`, not `pitch_baselines`. The top-impact failure mode the brief asked about
  — MiLB Stuff+ scored against MLB constants — **does not occur**.
- **Brink / Cluster / HDev / VDev raw inputs are on the right scale.** They derive from `plate_x`,
  `plate_z`, `sz_top`, `sz_bot`, all in feet in both tables and all well populated (`sz_top`
  100.00%, `zone` 99.68–99.87%). Only their *baselines* are the wrong population (F4).
- **The routing is right.** `/api/milb/player-data`, `/api/milb/report` and `computeMilbStuffPlus`
  all target `milb_pitches`; `search_milb_players` / `search_milb_batters` /
  `milb_player_summary` / `milb_batter_summary` / `milb_report_templates` are all MiLB-scoped.
  `/api/milb/report` correctly exposes `level`, `parent_org_home` and `parent_org_away` as extra
  group and filter columns.
- **The SP/RP rule matches the canonical repo convention.** `PercentileTab.tsx:31-40` implements
  ≥3 games with 50+ pitches excluding `PO`/`IN`, identical to `refresh_league_averages`.
- **Level is homogeneous today.** All 2,580,622 rows across 2023–2026 are `level = 'AAA'`
  (Q5, Q8), so the level-pooling hazards in F12 are latent, not active.

---

## What I could not determine

- **Whether the app ever renders MLB and MiLB values on a single axis or list.** I found no chart
  or table that unions `pitches` and `milb_pitches`. What I *did* find is the adjacent failure —
  MiLB rows scored or ranked against MLB populations (F3, F4, F7, F8, F9, F11). I did not audit
  `(research)`, `(visualize)`, `(broadcast)` or the Imagine/asset surfaces for MiLB players, so a
  mixed-axis display could exist outside my lane's seven pages.
- **The precise mechanism behind the pfx scale difference.** I measured the ratio (≈6.8–7.0×) and
  its propagation into baselines and `league_averages`. The explanation that the Stats API reports
  inches over the final ~40 ft while Savant reports feet over the full flight (12 × 0.53 ≈ 6.4) fits
  the data but is inference. Before the F2 backfill, confirm the correct divisor empirically —
  match a handful of pitches that appear in both tables (a rehab start, or a September call-up
  whose AAA and MLB games are both ingested) and regress one against the other. If the relationship
  is not a clean constant, the two columns are different *quantities* and no single divisor is
  correct; that becomes a modeling question → **Soto**.
- **How many MiLB dashboard views are actually showing contaminated deception/command values.**
  I established the tables are MLB-sourced and the queries carry no level filter (both code-
  verified), and bounded the exposure at 1,757 of 1,985 deception rows and 2,097 of 2,368 command
  rows for 2026 sharing IDs with `milb_player_summary`. Turning that into a per-player count needs
  a join against per-level appearance that I did not have query budget for.
- **Whether `result.eventType` is safe to write directly.** The ingest already extracts it
  (`app/api/update/milb/route.ts:208`) and discards it. I did not fetch a live game feed to confirm
  it is snake_case across every event type, so F1's step 2 needs one verification call first.
- **2023/2024 null profiles.** I measured null rates for 2025 and 2026 only (Q8). The ingest code
  path never writes `estimated_*`, `woba_value`, `delta_run_exp`, `launch_speed_angle`, `bat_speed`
  or the fielding-alignment columns for any season, so 2023/2024 should match — but that is read
  from code, not measured.
- **Whether a `k_pct` shown anywhere has already been used in a decision.** `milb_pitches` has no
  `created_at`/`updated_at` and `milb_pitch_baselines` is destructively upserted, so I cannot
  reconstruct what a given MiLB screen showed on a given date. Any MiLB report exported before this
  is fixed is unreproducible.

---

### Single highest-leverage next action

Backfill `milb_pitches.events` with the normalizer that already exists at
`scripts/create-refresh-league-averages.sql:88-118`, plus the four missing mappings from F13. It is
one UPDATE per season over 659,265 event-bearing rows, it is non-destructive (`bb_type` preserves
the batted-ball granularity the collapse discards), and it converts K%, BB%, BA, OBP, SLG, OPS, IP
and every counting stat on the MiLB Explore, Reports and player pages from **0.0 / half** to
correct — while simultaneously closing the 22-point disagreement between `league_averages` and
`/api/milb/report` (F5). Then, and only then, thread `level` through `PercentileTab` (F3), because
correct percentiles over broken inputs would still be wrong.
