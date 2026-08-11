---
title: Qualification Thresholds — Who Gets Counted, and What That Costs
domain: metric-governance
tags:
  - qualification
  - playing-time-minimums
  - leaderboard-eligibility
  - selection-bias
  - survivorship
  - role-classification
  - proportional-thresholds
  - reference-population
sources_reviewed: 20
last_updated: 2026-08-11
---

# Qualification Thresholds — Who Gets Counted, and What That Costs

## TL;DR

- **A qualification rule is two policies wearing one number: who *builds* the reference population, and who is *allowed to be shown* a value. Triton writes only the first.** A pitcher with 11 pitches still renders a percentile. **(computed)**
- **MLB's official rule is a rate per *scheduled* game, and that is the whole design.** 3.1 PA/game (502 at 162) for AVG/OBP/SLG; 1 IP/scheduled game for ERA. It auto-scaled to 1981, 1994, and 2020 untouched. **(established)**
- **Rule 9.22's hitless-AB provision (1967–) asks the better question — not "is n big enough" but "could the missing sample change the answer."** Gwynn 1996: .353 on 498 PA → +4 hitless AB → .349, still ahead of Burks' .344. It exists because Williams hit .345 in 1954 on 386 AB with 136 BB and lost the title to an *at-bat* minimum. **(established)**
- **Triton anchors to `MAX(leader)`, giving one row n=1 leverage over the qualified pool** — and since SP innings leaders have fallen over the last decade, the floor drifted down with it, no rule change and no record. Its floors land a quarter to a third of official, below even Savant's minimums. **(computed / estimated)**
- **Because `league_averages` is the denominator of every plus-stat, the threshold *is* a metric parameter — and it moves the two metric families opposite ways.** Loosening lowers μ and raises σ: ratio-form plus-stats inflate, z-form compress toward 100. **(estimated)**
- **Qualification conditions on the performance being measured, so `league_averages.value` is a truncated-from-below mean, not a league mean** — and among qualifiers luck and talent become negatively correlated (Berkson), so marginal qualifiers need harder shrinkage than 1/√n implies. **(established — mechanism; estimated — magnitude)**
- **Triton's SP/RP classifier is conditioned on performance too, a double penalty:** a starter who cannot reach 50 pitches is bucketed RP, then graded against the tougher reliever benchmark. A 3-game / 50-pitch cliff on a noisy count. **(estimated)**
- **The DDL and the function that fills it document two different SP/RP rules for the same table** — "first-inning game share > 0.5 → SP" versus ≥3 games with 50+ pitches. **(computed)**
- **46 days of staleness does not just freeze the numerator — it loosens the qualification.** `qual_floor` holds late-June leader values, so the stored benchmark was built on a looser pool than today's rule admits. **(estimated)**

---

## 1. Two thresholds, two purposes, one number

| Purpose | Protects | Wants | Triton today |
|---|---|---|---|
| **Reference-population membership** | accuracy of μ, σ in `league_averages` | strict, stable, schedule-anchored | `max(25 AB, 0.20 × leader)` — loose, leader-anchored |
| **Leaderboard ranking eligibility** | against a noise-driven top rank | strictest of the four | none |
| **Individual display** | against reading noise as skill | per-metric, stabilization-derived, *marked not hidden* | none |
| **Award / championship** | fairness and tradition | fixed rate per *scheduled* game | n/a |

Rows 1 and 3 pull opposite ways — strict makes μ precise but truncates harder, loose keeps the population honest but makes each member noisy — so they cannot be one number. In Triton they are. **Qualification gates the denominator only:** a September call-up with 16 IP is out of the SP benchmark but still *scored against* it, unmarked.

---

## 2. Fixed vs. proportional anchors

| Anchor | Form | In-season | Short season | Data dep. | Used by |
|---|---|---|---|---|---|
| **Fixed absolute** | `PA >= 502` | step function | breaks (2020: nobody) | none | FG / Savant custom minimums |
| **Rate × scheduled games** | `PA >= 3.1 × G_sched` | linear, known in advance | scales by construction | none | **MLB Rule 9.22** |
| **Rate × games played** | `PA >= 2.1 × G_played` | grows with actual play | scales | none | Savant percentiles |
| **Proportional to leader** | `IP >= 0.20 × MAX(IP)` | grows with the *max*; jumpy | pool scales, precision does not | **n=1** | **Triton** |
| **Fixed floor** | `IP >= 5` | binds only early | far too loose | none | Triton (`GREATEST` term) |

The leader-anchored form is the only one whose threshold is itself a *statistic* — an order statistic, upward-biased, with variance that does not shrink with league size, inheriting every defect in whichever row is the maximum. The larger cost: it makes the *reference population* a function of league behavior, so two seasons of `league_averages` describe differently-selected pools though the rule text never changed. That is `05-baseline-normalization-design.md`'s vintage drift in another coordinate — there the baseline moved under a fixed population; here the population moves under a fixed recipe.

---

## 3. MLB's official rules, and why they are shaped that way

**Rule 9.22, "Minimum Standards for Individual Championships."** AVG/OBP/SLG titles require **3.1 plate appearances per game originally scheduled** — 502 PA over 162. The ERA title requires **IP ≥ games scheduled** — 162 IP. Three decisions worth stealing:

1. **Per *scheduled* game.** Removes data dependence and the incentive to rest a player to protect a title. 2020 produced a 186 PA / 60 IP standard with no rule change and no argument.
2. **Plate appearances, not at-bats.** Williams 1954 forced the 1957 change. Pick the denominator the skill does not suppress.
3. **The hitless-AB provision.** A worst-case bound rather than a threshold: compute the adversarial completion, see whether the ranking survives. It generalizes to any bounded rate stat. Triton has no such construct; nor does the ERA title.

FanGraphs and Baseball-Reference default to the 9.22 rates but expose custom minimums, because 1 IP/scheduled game qualifies essentially zero relievers. Savant's percentile leaderboard uses **2.1 PA/team game (batters), 1.25 (pitchers)** — looser than official, because a percentile slider needs a populated pool. It made Triton's tradeoff at twice the strictness, and prints the rule.

---

## 4. Triton's rule, worked through

```sql
-- scripts/create-refresh-league-averages.sql
floor_ab AS (SELECT GREATEST(25.0, 0.20 * COALESCE(v,0)) AS v FROM lead_ab),
SELECT GREATEST(5.0, 0.20 * COALESCE(sp_lead,0)) AS sp_floor,
       GREATEST(5.0, 0.20 * COALESCE(rp_lead,0)) AS rp_floor
```

### 4.1 The threshold moves all season, and the two terms trade places

| Role | Proportional term overtakes the floor when… | Approx. calendar | Season-end floor | Official equivalent |
|---|---|---|---|---|
| Hitter | `AB_leader ≥ 125` | ~team game 31, early May | ~130–136 AB (≈150 PA) | 502 PA |
| SP | `SP_IP_leader ≥ 25` | ~5 starts, late April | ~40–44 IP | 162 IP |
| RP | `RP_IP_leader ≥ 25` | ~19 appearances, mid-May | ~15–18 IP | (none workable) |

*Crossover arithmetic is exact; calendar and season-end values are **estimated** from recent leader workloads (~650–680 AB, ~200–220 SP IP, ~75–90 RP IP).*

**For the first five to six weeks of every season the pool is governed by the 25 AB / 5 IP floors** — 5 IP is two relief outings — so April's `league_averages` row benchmarks a pool of marginal players. And **the threshold is unknowable in advance**: you cannot tell a user in March what will qualify in September, because it depends on a maximum that has not happened.

### 4.2 Cross-season comparability, including 2020

The proportional anchor gets 2020 exactly half right.

- **Pool composition: correct.** 60 games → AB leader ~245 → `0.20 × 245 ≈ 49 > 25`, so the proportional term binds and the pool is the same *fraction* of the league as a full season. A fixed 502 PA rule would have qualified nobody — the property that makes MLB's rule work.
- **Per-player precision: not correct, and unfixable by any threshold.** Each qualifier carries ~0.37× the observations. With σ²_obs = σ²_true + σ²_noise and σ_noise ∝ 1/√n, the noise term is **1.64× larger**; where noise is ~40% of full-season variance, σ_obs inflates by √(0.6 + 0.4 × 2.70) ≈ **1.30**. Since the DDL feeds `stddev` into "mean ± 3σ color-scale extremes," **2020's color scales run ~30% wider than 2021's for the same league**, and its breakpoints pull outward at the tails (`10-benchmarking-percentiles.md`). So does every in-season snapshot. **(estimated)**

### 4.3 Staleness loosens the rule, it does not just freeze it

`league_averages` is 46 days stale as of 2026-08-11, so `qual_floor` holds **late-June leader values** — roughly 40% below where they sit now. The frozen benchmark was **built on a looser pool than the current rule admits**, pushing μ down, σ up, and inflating every ratio-form plus-stat read against it. Freshness is Jo's lane; this second-order effect is Li's. **(estimated)**

---

## 5. The threshold is a metric parameter

`league_averages.value` is `AVG(...)` over qualified players (not a median — see `05-baseline-normalization-design.md` §1). It is the denominator of every plus-stat and the anchor of every percentile.

| Move the threshold | Qualified pool | μ (higher-is-better) | σ | Ratio-form plus-stat | z-form plus-stat |
|---|---|---|---|---|---|
| **Looser** | larger, more marginal | falls | rises (left tail extends) | **inflates** | **compresses toward 100** |
| **Stricter** | smaller, more elite | rises | falls (truncation) | **deflates** | **stretches from 100** |

The two families move *differently* — the non-obvious part. One threshold change re-scales them in opposite directions, so a platform carrying both watches its metric families drift apart with no formula change. The threshold belongs under the same change control as a Stuff+ weight: `0.20 → 0.25` is the same class of edit as `4.5 → 5.0` on `z(release_speed)`, with none of the discipline attached.

**The sensitivity sweep**, once per season, logged in `docs/Queries.md`: aggregate per-pitcher IP and the metric, re-derive the floor at `GREATEST(5.0, f × MAX(ip))` for `f` in `(0.10, 0.15, 0.20, 0.25, 0.35, 0.50, 0.80)`, report `n_qualified`, `AVG(val)`, `STDDEV_SAMP(val)` at each step. If the mean moves further across that sweep than the year-over-year change someone wants to interpret, the threshold is doing more work than the baseball is.

---

## 6. The selection bias qualification introduces

Not one bias — three, with different signs and different fixes.

### 6.1 Survivorship: the pool is truncated on the metric itself

Playing time is assigned by people watching the rate stat. A hitter batting .180 in April never reaches 130 AB — he is benched, optioned, or released. The pool is **truncated from below on a noisy realization of the quantity being averaged**, and truncation has an unambiguous direction, E[X | X > c] > E[X] and Var(X | X > c) < Var(X):

> **`league_averages.value` systematically overstates true league-wide performance, and `league_averages.stddev` systematically understates true dispersion. Both worsen as the threshold rises.**

Magnitude is unknown on Triton data and should not be guessed; direction is not. Wald's returning-aircraft problem with roster decisions in place of flak — and note the asymmetry: elite players survive a bad month, so the right tail is fully observed and the truncation shifts the mean rather than narrowing the range (`06-confounding-selection-survivorship.md`).

### 6.2 Conditioning on a descendant of the outcome — and Berkson

For a rate stat the threshold sits on the *denominator*, but the denominator is **caused by** the numerator. Not confounding — selection on a descendant of the outcome, making qualification a **collider** between talent and luck:

> Among qualified players, luck and talent are negatively correlated even though they are independent in the full population, because clearing the bar requires enough of one or the other.

A marginal qualifier cleared the bar partly *because* his rate ran hot early, so his value overstates his talent by more than naive 1/√n shrinkage predicts. **Shrink marginal qualifiers harder than sample size alone says: the coefficient should be a function of *distance above the threshold*, not just n.** A player at 4× the floor is unaffected — selection never operated on him. At 1.05×, regress hard (`03-regression-to-mean-shrinkage.md`).

### 6.3 Two-stage selection on the leaderboard

`0.20 × MAX(...)` is itself a winner's-curse draw, and the leaderboard then selects again — qualify, then rank, both stages on the same noise, compounding rather than cancelling. Its top is disproportionately a low-n qualifier who ran hot, which Triton's floors make the expected case (`05-multiple-comparisons-leaderboards.md`).

---

## 7. Role-dependent thresholds: Triton's SP/RP classifier

```sql
roles AS (
  SELECT pitcher,
    CASE WHEN COUNT(*) FILTER (WHERE pc >= 50) >= 3 THEN 'SP' ELSE 'RP' END AS role
  FROM per_game GROUP BY pitcher   -- per_game excludes pitch_type IN ('PO','IN')
)
```

Splitting by role is right in principle — an RP will never clear an SP innings bar, which is why FanGraphs abandons the official rule for relievers. The problem is *how* the role is decided.

### 7.1 Two documented rules for one table

The DDL for `league_averages` states in its header: `-- SP/RP classification: first-inning game share > 0.5 -> SP else RP`. The function that populates that table implements ≥3 games with 50+ pitches, as do `CLAUDE.md` and `docs/VARIABLES.md` §7. **The table's own DDL documents a rule the platform does not use** — a defect under the repo's own convention, and the first thing to fix. **(computed)**

### 7.2 The classifier is conditioned on performance

A starter throws 50+ pitches when he gets through four innings; one who cannot throws 45. So:

> **A bad enough starter is reclassified as a reliever and then graded against the reliever benchmark — harder on every rate stat, because relievers face fewer batters per outing at max effort.** Poor performance moves him to a tougher denominator. Double penalty.

Selection bias on the *role* rather than the pool, and invisible: nothing records which branch fired.

### 7.3 Edge cases

| Case | Season shape | Class | Assessment |
|---|---|---|---|
| **Opener** | 30 "starts," ~20–25 pitches | **RP** | Fine for rate comparison; misleading if the UI labels the bucket "Starters" |
| **Bulk reliever** | 60–80 pitches, ≥3 games | **SP** | Right on workload, surprising to anyone reading GS |
| **Swingman** | 5 starts of 55+, 35 relief apps | **SP** | ~75% relief innings entering the **SP** benchmark |
| **Failing starter** | 12 starts, avg 3.1 IP / 46 pitches | **RP** | §7.2 double penalty |
| **April injury** | 2 starts at 95 pitches, then done | **RP** | Off by one game; a *displayed* plus-stat uses the RP denominator |
| **Sept. call-up** | 3 starts of 50+, 16 IP | **SP** | Below the ~42 IP floor → out of the benchmark, still scored against it |

Two properties do the damage. **It is a cliff on a noisy count** — a 49-pitch game is worth nothing, so one rain-shortened start flips the benchmark a pitcher is measured against. And **it is season-level and retrospective**: the `roles` CTE groups over the calendar year with no as-of cutoff, so a pitcher classified RP in May silently becomes SP in July and re-buckets to a different denominator. A May screenshot is not reproducible in July — not because the data changed but because the *population definition* did (`01-as-of-correctness.md`). Fix: a continuous role share, **stored per player-season with its computation date**.

And **the `_ip` the floor is applied to is not innings pitched.** It counts each PA-ending out event as one out, but the four double-play events record two and `triple_play` three, and outs on the bases are not counted. Mostly benign — the bias hits leader and candidate alike and cancels inside `0.20 × leader` — but the pool tilts mildly fly-ball, and `_ip` disagrees with `player_season_stats.IP`, which is correct. **(estimated)**

---

## 8. What Triton should do, in order

1. **Fix the DDL comment conflict in `scripts/create-league-averages.sql`, restating the rule in `docs/VARIABLES.md` §7 in the same commit.** Zero risk; it misdocuments the qualification rule of the table every plus-stat divides by.
2. **Re-anchor from `0.20 × MAX(leader)` to a rate per team game.** Starting point, *calibrate against §5's sweep first*: hitter `AB >= 1.5 × team_games`, SP `IP >= 0.35 ×`, RP `IP >= 0.12 ×`, hard floors kept three weeks. Kills the n=1 leverage, makes the threshold publishable in March, handles 2020 as MLB's rule does.
3. **Persist the rule applied.** `league_averages` already stores `n_qualified`, `leader_value`, `qual_floor` — better governance than most of the platform. Add `qual_rule_version` and `computed_through_date`.
4. **Split "builds the benchmark" from "is shown a number."** Add a per-metric display minimum from stabilization (`02-reliability-stabilization.md`); hand it to Cas to render as a marker, not a suppression.
5. **Store role per player-season, as-of its computation date, from a continuous share.**
6. **Weight multi-out events in `_ip`, or source IP from `player_season_stats`** (prefer the latter; already correct).
7. **Publish the caveat.** `league_averages.value` is a *qualified-player* mean biased upward by survivorship. One tooltip.

### Anti-recommendation

**Do not simply raise the floors to the MLB-official 502 PA / 162 IP.** The obvious move, and wrong here:

- **It makes the survivorship bias worse**, cutting further into the left tail so `league_averages.value` drifts *further* above the true league mean. Strictness buys precision at the cost of representativeness, and a plus-stat denominator needs representativeness.
- **It empties the pools that matter.** No reliever qualifies at 1 IP/scheduled game — why FanGraphs abandons that rule for relievers — and MiLB pools, fragmented by promotion, collapse.
- **Small `n_qualified` makes the benchmark itself noisy**, and the benchmark is what every plus-stat divides by. A narrow unstable denominator is no upgrade over a wide contaminated one.

Change the **anchor**, publish `n_qualified` beside every benchmark, and let the caveat carry the residual bias.

**Highest-leverage next action:** run the §5 sweep on 2025 for three metrics — one ratio-form, one z-form, one skewed rate — and log it in `docs/Queries.md`. Until we know how far the benchmark moves between a 10% and a 35% floor, recommendation 2 is theory.

---

## Sources

1. [MLB.com — Rules glossary](https://www.mlb.com/glossary/rules) — cited for what it lacks: no qualification entry. It lives only in Rule 9.22 of the linked OBR PDF.
2. [Wikipedia — Batting average](https://en.wikipedia.org/wiki/Batting_average_(baseball)) — 3.1 PA/scheduled game since 1957; the 1967– hitless-AB provision; Gwynn 1996; Williams 1954.
3. [Wikipedia — MLB batting champions](https://en.wikipedia.org/wiki/List_of_Major_League_Baseball_batting_champions) — the Gwynn arithmetic: 498 PA, +4 hitless AB → .349 vs. Burks .344.
4. [Wikipedia — Earned run average](https://en.wikipedia.org/wiki/Earned_run_average) — no "add the innings" analogue to §3's provision.
5. [Savant — Percentile Rankings](https://baseballsavant.mlb.com/leaderboard/percentile-rankings) — **2.1 PA/team game (batters), 1.25 (pitchers)**, printed on the page.
6. [Savant — Custom leaderboard](https://baseballsavant.mlb.com/leaderboard/custom) — "Qualified / 10 / 25 / … / 600" min-PA control.
7. [FanGraphs — Major League Leaders](https://www.fangraphs.com/leaders/major-league) — "Qualified" default plus a 0–10,000 min-PA ladder.
8. [FanGraphs Library — Sample Size](https://library.fangraphs.com/principles/sample-size/) — K% 60 PA, BB% 120, HR 170, BABIP 820 BIP, SLG 320 AB, AVG 910 AB.
9. [BP — Carleton, "It's a Small Sample Size After All" (2012)](https://www.baseballprospectus.com/news/article/17659/baseball-therapy-its-a-small-sample-size-after-all/) — the Kuder-Richardson r = .70 method.
10. [Wikipedia — Survivorship bias](https://en.wikipedia.org/wiki/Survivorship_bias) — Wald/SRG armor; also immortal time bias.
11. [Wikipedia — Selection bias](https://en.wikipedia.org/wiki/Selection_bias) — attrition and post-treatment conditioning; §6's taxonomy.
12. [Wikipedia — Berkson's paradox](https://en.wikipedia.org/wiki/Berkson%27s_paradox) — the collider result behind §6.2.
13. [Wikipedia — Truncated distribution](https://en.wikipedia.org/wiki/Truncated_distribution) — E[X | X > y]; §6.1's direction claim.
14. [Wikipedia — Regression toward the mean](https://en.wikipedia.org/wiki/Regression_toward_the_mean) — selection on extremes plus measurement error.
15. [Wikipedia — Winner's curse](https://en.wikipedia.org/wiki/Winner%27s_curse) — the max of noisy estimates is biased upward; §6.3.
16. [Wikipedia — Order statistic](https://en.wikipedia.org/wiki/Order_statistic) — [F(x)]ⁿ for the sample maximum; §2's error-bar argument.
17. [Wikipedia — 2020 MLB season](https://en.wikipedia.org/wiki/2020_Major_League_Baseball_season) — the 60-game schedule; it does *not* state 186 PA / 60 IP.
18. [Wikipedia — Opener (baseball)](https://en.wikipedia.org/wiki/Opener_(baseball)) — 154 uses in 2023 → ~33 in 2024; §7.3's edge case.

**Triton-internal evidence** (read 2026-08-11; no queries run). `scripts/create-refresh-league-averages.sql` — the `roles`/`floor_ab`/`floors`/`qual` CTEs, the `_ip` out-event list, `AVG`+`STDDEV_SAMP`. `scripts/create-league-averages.sql` — DDL, `n_qualified`/`leader_value`/`qual_floor`, the "mean ± 3σ" comment, the conflicting first-inning-share comment. `app/api/scene-stats/route.ts` L841–848. `docs/VARIABLES.md` §6.3, §7, L302, L442.
