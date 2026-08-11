---
title: Trend Detection & Changepoints — Did It Actually Change?
domain: statistical-inference
tags:
  - changepoint-detection
  - cusum
  - mann-kendall
  - autocorrelation
  - clustered-inference
  - multiple-testing
  - measurement-change
sources_reviewed: 18
last_updated: 2026-08-11
---

# Trend Detection & Changepoints — Did It Actually Change?

> Grades: **(established)** published/replicated; **(computed)** measured on Triton data or read from
> Triton source; **(estimated)** reasoned from theory with stated inputs. Cross-refs:
> `01-sampling-and-sample-size.md`, `04-uncertainty-quantification.md`,
> `06-confounding-selection-survivorship.md`, `Jo/data-quality/04-distribution-drift-detection.md`.

## TL;DR

- **"Did it change?" has four gates in order — coverage, comparability, magnitude-vs-noise, corroboration — and Triton's first answer to the Povich question failed the first three.** Gates 1 and 2 are cheap and dispositive; jumping straight to gate 3 is the expensive standard error. **(computed)**
- **Gate 1 isn't statistics and is still the most common cause of a fake trend: `stuff_plus` coverage for August 2026 was 0 of 36,621 pitches.** A metric that stopped being written looks exactly like one that declined. Escalate to **Jo** before modelling. **(computed)**
- **Gate 2: May and August 2026 sit on different baseline vintages after the 2026-08-11 rescore — ±0.3–0.6 points, ~26% of the observed 2.3-point move.** Part of every 2026 within-season "trend" is the reference moving. **(computed)**
- **Gate 3: 149 pitches over 2 starts is 2 clusters, not 149 observations.** Outing ICC ρ ≈ 0.014–0.041 at cluster size ~75 gives a design effect of 2–4 and `n_eff` of 37–75; the resulting MDE is ≈2.5–3.5 Stuff+ points at 80% power against an observed move of 2.3. The comparison was underpowered before it ran — knowable in advance, and it should gate the surface. **(estimated)**
- **Gate 4 separates defensible from plausible: a composite moving is one observation and weak at any n; its inputs moving coherently is strong.** Stuff+ has **no release-position term**, so FF release height 6.05 → 5.87 ft and side 1.08 → 1.29 are *independent* evidence, not the same number restated. **(computed + estimated)**
- **CUSUM catches a 1σ shift in ~10 observations vs ~44 for a 3σ Shewhart chart — but at outing grain that is two months of a starter's season**, so in-season changepoint detection is structurally underpowered. **(established + estimated)**
- **Scanning 400 pitchers × 12 metrics is 4,800 tests — ~240 false "declines" at α = .05 before any real one exists**, and no multiplicity control exists anywhere in the repo. **(estimated)**
- **A step at a league boundary is almost never about your player: 2023's pitch timer and shift restrictions moved everyone at one instant, and Savant retro-relabels `pitch_type` — `ST`/`SV` appear in `pitches` back to 2015**, silently changing which `pitch_baselines` row scores a pitch. **(computed)**

---

## 1. The protocol

Four gates, each able to end the investigation. Run them in this order: the cost ordering and the
kill-rate ordering agree, so the cheapest check kills the most stories.

| # | Gate | Question | Owner | Fails when |
|---|---|---|---|---|
| 1 | **Coverage** | Is the number present on both sides, at comparable density? | **Jo** | A pipeline gap looks like a decline |
| 2 | **Comparability** | Same baseline vintage, level, population, weighting on both sides? | **Li** | The reference moved, not the player |
| 3 | **Magnitude vs noise** | Does the move exceed the SE *after* correcting for clustering? | **Li** | The window was chosen for looking extreme |
| 4 | **Corroboration** | Does an independent measurement point the same way? | **Li → Soto** | The story rests on one composite |

The last gate you passed sets the claim you are entitled to make. Gates 1–3 buy "the move exceeds
noise." Only gate 4 buys a **mechanism**, the only thing an operator can act on.

### 1.1 Gate 1 — coverage

```sql
-- Gate 1. Run before any trend query. Log to docs/Queries.md.
SELECT date_trunc('month', game_date)::date AS mo, count(*) AS pitches,
       count(stuff_plus) AS scored,
       round(100.0 * count(stuff_plus) / count(*), 1) AS coverage_pct
FROM pitches WHERE pitcher = :pitcher_id AND game_year = 2026
GROUP BY 1 ORDER BY 1;
```

**Stop rule:** if either side is below ~95% coverage, or the two differ by more than a few points,
the trend question is void and the ticket goes to Jo. For Povich, the August cell read
**0 / 36,621 league-wide** (`metric-governance/02` §3.1). (computed)

### 1.2 Gate 2 — comparability

| Break | Triton instance | Detect |
|---|---|---|
| **Baseline vintage** | `pitch_baselines` recomputed nightly season-to-date; the 2026-08-11 repair rescored ≈249k Jun–Aug rows on current baselines while Feb–May kept nightly vintages | No column marks it — infer from `game_date` × repair date |
| **Population / level** | July AAA rows scored against `milb_pitch_baselines`; a 100 there and a 100 in MLB are different claims (`metric-governance/08`) | Join level explicitly; never `UNION` silently |
| **Classification vintage** | Savant relabels `pitch_type` retroactively; Slider→Sweeper changes the baseline row, not the pitch | Same pitch, different `pitch_name` across two pulls |

For Povich, May 100.0 → Aug 97.7 **crosses the rescore seam**, carrying ±0.3–0.6 points of vintage
bias, ~26% of the move; only Jun→Aug is fully clean. **The rule:** a comparison of a metric whose
baseline is recomputed mid-season is not a comparison — rescore both sides, or stay in one vintage.

### 1.3 Gate 3 — magnitude vs noise, with clustering

The pitch is not the unit of independent information: consecutive pitches share an outing, a batter,
a count sequence, a fatigue state and a game plan. The correction is the **design effect**:

```
deff = 1 + (m̄ − 1)·ρ          n_eff = n / deff
```

For 149 pitches over 2 starts, `m̄ ≈ 75`, so `deff = 2` needs only `ρ ≈ 0.014` and `deff = 4` needs
`ρ ≈ 0.041` — both unremarkable at outing level. Effective n is **37–75, not 149**. With pitch-level
Stuff+ SD ≈ 6.5 (`metric-governance/05`), `σ_eff = 6.5·√deff ≈ 9.2–13.0`, so against a ~400-pitch
May window:

```
MDE(80% power, α=.05) = 2.80 · σ_eff · √(1/149 + 1/400) ≈ 2.5 – 3.5 Stuff+ points
```

The observed move was **2.3** — below the MDE across the plausible `deff` range, a gate-3 fail
**computable before looking at the answer**. Harsher still: cluster at the outing (honest, since arm
slot, plan and fatigue are outing-level) and August has **2 clusters**, against a rule of thumb
needing 30–50 for cluster-robust SEs. (estimated)

### 1.4 Gate 4 — independent corroboration

A composite is a single scalar; when it moves you have **one observation**, and one observation
supports arbitrarily many stories. "Plausible" becomes "defensible" when a second measurement points
the same way *and* is **not a function of the first**. Stuff+ is
`100 + 4.5·z(velo) + 3.5·z(movement) + 2.0·z(ext)` — no release-position term.

| Signal | May | Aug | Independent of `stuff_plus`? |
|---|---|---|---|
| Composite / FF Stuff+ | 100.0 / 98.4 | 97.7 / 95.8 | No — the claim and its component |
| FF usage | 43% | 49% | **Yes** — mix, not quality |
| FF release height (ft) | 6.05 | 5.87 | **Yes** — not in the formula |
| FF release side (ft) | 1.08 | 1.29 | **Yes** — not in the formula |
| CU / CH Stuff+ | 97.6 / 98.5 | 98.8 / 99.9 | No — but the *sign split* is informative |

(computed — measured 2026-08-11, n = 149 August window; `metric-governance/08` §5.1)

The slot dropped ~2.2 in and moved ~2.5 in to the side. A lower, wider slot predicts worse four-seam
ride specifically — and the four-seam is the pitch that declined while breaking ball and changeup
*improved*, with usage shifting **toward** the weakening pitch. Four facts in a mechanism, three
outside the metric. **The asymmetry:** a composite has many paths to the same value, so its movement
constrains little; inputs moving *coherently* is strong because each independent corroborant
multiplies the implausibility of the null. **The caveat:** corroboration counts as independent only
if you didn't go looking after seeing the result — say which order you did it in.

**Li's call on Povich:** the composite decline sits inside the noise band and is partly a baseline
artifact — **not established**. The corroborated *four-seam* decline is a hypothesis worth monitoring
at n = 149, graded **estimated**: a monitor and a note to Soto, not a headline.

---

## 2. Methods, and which one this platform can support

| Method | Model | Best at | Verdict for Triton |
|---|---|---|---|
| **Shewhart** | point vs μ ± kσ | large abrupt shifts | Blunt; ARL₁ ≈ 44 at 1σ |
| **CUSUM** (Page 1954) | running Σ of deviations past slack `k`; EWMA is the smoother twin | small **sustained** shifts | **Best default.** ARL₁ ≈ 10 at 1σ |
| **Binseg** | greedy recursive splits | quick multi-CP scan | Approximate — misses offsetting pairs; wild binseg (2014) is the fix |
| **PELT** (Killick 2012) | exact penalized cost, pruned | **exact** segmentation | Right offline; overkill at n ≈ 30 |
| **Bayesian online CPD** | run-length posterior + hazard | streaming; gives a *probability* | Honest UI primitive: "62% chance of a change since Jun 14" |

**Grain sets n, and that constrains the outcome more than the choice does.** A starter throws ≈30
outings/season, so CUSUM's ~10-observation latency at 1σ is ~2 months of starts, and PELT at BIC
penalty `2·log(30) ≈ 6.8` with min segment length 5 admits 5–6 segments at most. Pitch grain gives
n = thousands and `deff` = the same thousands — autocorrelated pseudo-information. So the useful
in-season product is a **CUSUM monitor anchored to a fixed reference window**, not a changepoint
*detector*, plus a rule that no alert fires below a stated `n_eff`.

### 2.1 CUSUM in SQL, at a grain that means something

The tabular reset-at-zero CUSUM needs a recursive CTE; the *un-reset* path is a plain window
function and enough to read by eye, with a useful property — **the path's slope is the mean
deviation, so a kink is a step change and curvature is a drift.**

```sql
WITH outing AS (
  SELECT p.game_pk, min(p.game_date) AS game_date, count(*) AS n, avg(p.stuff_plus) AS sp
  FROM pitches p
  WHERE p.pitcher = :pitcher_id AND p.game_year = 2026
    AND p.pitch_name = 'Four-Seam Fastball' AND p.stuff_plus IS NOT NULL
  GROUP BY p.game_pk
  HAVING count(*) >= 20                 -- min cell size; drops openers and rain-outs
),
anchor AS (                             -- FIXED reference, not a trailing window
  SELECT avg(sp) AS mu0, stddev_samp(sp) AS sd0
  FROM outing WHERE game_date BETWEEN '2026-04-01' AND '2026-05-31'
)
SELECT o.game_date, o.n, round(o.sp::numeric, 1) AS sp,
       round(((o.sp - a.mu0) / nullif(a.sd0, 0))::numeric, 2) AS z,
       round(sum(o.sp - a.mu0) OVER (ORDER BY o.game_date)::numeric, 1) AS cusum
FROM outing o CROSS JOIN anchor a ORDER BY o.game_date;
```

Settings matter more than code: `k = δσ/2` for the shift δ you care about, `h ≈ 4–5σ`; at
`k = 0.5σ, h = 5σ`, ARL₀ ≈ 465 (NIST). **Anchor to a fixed healthy window, never a trailing one** —
a trailing baseline chases a slow decline until it is normal, which is how the 2026 coverage
collapse stayed invisible.

### 2.2 Trend tests: `regr_slope`, Mann–Kendall, Sen's slope

One aggregate over the CTE above gives the parametric slope —
`regr_slope(sp, extract(epoch FROM game_date)/86400)`, with `regr_r2` beside it. It assumes
independent, homoskedastic, normal errors (none hold), is not robust to one blowup start, and its
p-value is wrong under autocorrelation.

**Mann–Kendall** is the nonparametric alternative: `S = Σ_{i<j} sign(x_j − x_i)`, tie-corrected
`Var(S) = n(n−1)(2n+5)/18`, `Z = (S∓1)/√Var(S)`. It **assumes independence**, and positive serial
correlation inflates its false-positive rate substantially; use the Hamed & Rao (1998) variance
correction or Yue–Wang prewhitening. **Sen's slope** (Theil–Sen) is the matching robust estimator —
`percentile_cont(0.5)` over all pairwise slopes `(sp_j − sp_i)/(t_j − t_i)` from a self-join,
breakdown ≈ 29%. (established)

**Its interval is not the 10th/90th percentile of those pairwise slopes** — that common shortcut
carries no sample-size information. Use rank positions `(N ∓ C_α)/2`, `C_α = z_{1−α/2}·√Var(S)`.

### 2.3 Step versus drift

Mann–Kendall fires on both, because a step is monotone. Three separators, increasing in cost: **read
the CUSUM path** (§2.1 — free, usually sufficient); **fit both and compare BIC** — level shift
`sp ~ 1 + 1[t > τ]` against slope `sp ~ 1 + t`, which at n ≈ 30 usually land within a couple of
units; **Pettitt's test** to localize a single step. The difference is operational: a **step** points
at a discrete cause (mechanics, injury, grip, rule date, deploy), a **drift** at accumulation
(fatigue, workload, aging).

---

## 3. Changed pitcher vs changed measurement

The highest-value discrimination here, and the one no statistical test performs for you.

| Evidence | Points to the **pitcher** | Points to the **measurement** |
|---|---|---|
| Timing | A start, an injury, a mechanical cue | A **deploy, cron change, rescore, or vendor update** |
| Scope | This pitcher, maybe a handful | **League-wide at the same instant** |
| Raw inputs | `release_speed` / `pfx_*` / `release_extension` move too | Raw inputs flat; only the derived value moves |
| Coverage | Unchanged | Coverage or NULL rate moves at the same date |
| `pitch_name` mix | Stable | A category share jumps, or a **new category appears** |
| Reproducibility | Re-running the old query gives the old answer | **Re-running it gives a new answer** |

**The provider case.** `pitch_type` / `pitch_name` is a *model output*, restated retroactively — Jo
measured `ST` and `SV` in `pitches` back to **2015**, impossible unless the classifier was
retro-applied, plus retired code `FT` reappearing in 2026 with 13 rows. (computed) Stuff+ joins
`pitch_baselines` on `(pitch_name, game_year)`, so a pitch reclassified Slider→Sweeper is **scored
against a different population** — one with far larger mean horizontal movement — and its movement z
falls with no physical change. The relabel being retroactive, the step can appear *in the past* on
the next pull. No `classification_vintage` column exists; the only detector is a mix table:

```sql
SELECT game_year, pitch_name, count(*),
       round(100.0*count(*) / sum(count(*)) OVER (PARTITION BY game_year), 2) AS pct
FROM pitches WHERE pitcher = :pitcher_id GROUP BY 1, 2 ORDER BY 1, 3 DESC;
```

A share that jumps while velo and movement hold is a relabel, not a repertoire change. Check it
before every "he changed his slider" claim.

**The league-wide case.** 2023 shipped a pitch timer, shift restrictions and larger bases at one hard
boundary; sweeper share went 1.06% of pitches in 2020 → 7.79% in 2026. A per-player detector run
across 2022→2023 fires on much of the league, every alert correct and useless. **The fix is a
control, not a threshold** — a difference in differences, matched on pitch type and role:

```
Δ_adjusted = (player_after − player_before) − (league_after − league_before)
```

Plus-stats do a partial version of this within one season — which is why §1.2's vintage problem
matters: when the control itself moves and isn't recorded, the adjustment becomes part of the effect.

---

## 4. Multiple testing when you scan for changes

Every "most improved," "trending up," and red-arrow badge is a maximum statistic over a large
family, displayed without its family.

| Scan | Family size | Expected false alarms at α = .05 |
|---|---|---|
| One metric, 400 qualified pitchers | 400 | 20 |
| 12 metrics × 400 pitchers | 4,800 | **240** |
| + 20 candidate changepoint dates per player | ~96,000 | **~4,800** |

(estimated)

Three multiplicities compound and only the first is usually noticed: across players, across metrics,
and **across candidate changepoints within a player**. The third is what changepoint methods were
built for — a naive t-test at the best-fitting split has no valid null distribution, hence CUSUM's
ARL-calibrated `h` and PELT's penalty in place of a p-value.

- **Control FDR, not FWER.** Benjamini–Hochberg at q = 0.10; Bonferroni at these family sizes leaves
  nothing detectable, producing a monitor nobody trusts.
- **Pre-register the window.** "Last 30 days," fixed in advance, is defensible; "since his June 14
  start," chosen after plotting, is a changepoint estimate wearing a hypothesis test's clothes.
- **Gate on `n_eff`, not n** — suppress alerts below the metric's stabilization threshold
  (`02-reliability-stabilization.md`). None are encoded in the repo: the blocking gap.

---

## 5. What Triton should do, in order

1. **Wire gate 1 into the trend surface, not into the analyst's habits** — any view rendering a
   period-over-period delta computes coverage on both sides first and refuses to render below a
   threshold. One query; it would have ended the Povich investigation in thirty seconds. **Cas**
   builds, contract from **Jo**.
2. **Measure the two numbers this document is parameterized by, and store them:** per-pitcher,
   per-pitch-type within-season SD of `stuff_plus`, and the outing-level ICC. Every figure in §1.3 is
   *estimated* off a league SD of 6.5 and an assumed ρ; one query per pitch type upgrades the chain
   to computed. **Highest-leverage next action.**
3. **Add `n_eff` and MDE to `MetricDef`** beside the stabilization threshold, so delta surfaces print
   "this window can detect ≥3.0 points" rather than a red arrow.
4. **Ship one CUSUM monitor at outing grain, anchored to a fixed window** for Stuff+ by pitch type
   (`k = 0.5σ`, `h = 5σ`), printing its ~10-outing latency.
5. **Make gate 4 a required field** — no "X declined" ships without a named independent corroborant
   and whether it was checked before or after the result was seen.
6. **Compute every player delta league-relative** (§3), matched on pitch type and role, so rule
   changes and league drift subtract out.

**Anti-recommendation: do not build a changepoint service that scans all pitchers × all metrics
nightly and alerts on the hits.** The obvious build, wrong four ways. (i) **It fails gate 1 by
construction** — the 2026 Stuff+ collapse would have produced a league-wide wave of confident
"decline" changepoints, each statistically valid and every one an artifact. (ii) **The grain won't
support it**: ~30 outings/starter against a ~10-observation latency means real changes surface after
they stop mattering, and anything faster is noise. (iii) **The third-level multiplicity is
unmanageable** — BH across ~96,000 tests leaves a list nobody will action, reproducing
`checkNewPitchNames`, warned 54 times and never once actioned. (iv) **It automates the wrong gate**:
gates 1, 2 and 4 decided the Povich question; gate 3 only returned "marginal." Build the coverage
gate, the σ/ICC measurement and the corroboration requirement first; revisit once a within-season
Stuff+ comparison is comparable at all (`metric-governance/02` item 1).

---

## Sources

1. [Page (1954), *Biometrika* 41(1)](https://doi.org/10.2307/2333009) — the original CUSUM.
2. [NIST/SEMATECH §6.3.2.3 — CUSUM charts](https://www.itl.nist.gov/div898/handbook/pmc/section3/pmc323.htm) — the `k`/`h` settings and ARL figures in §2.
3. [NIST/SEMATECH §6.3.2.4 — EWMA charts](https://www.itl.nist.gov/div898/handbook/pmc/section3/pmc324.htm) — λ ≈ 0.2, the smoother alternative.
4. [Killick, Fearnhead & Eckley (2012), *JASA* 107(500)](https://arxiv.org/abs/1101.1438) — PELT: exact segmentation, linear cost.
5. [Fryzlewicz (2014), *Ann. Statist.* 42(6)](https://doi.org/10.1214/14-AOS1245) — wild binseg; plain binseg misses offsetting changes.
6. [Truong, Oudre & Vayatis (2020), *Signal Processing* 167](https://doi.org/10.1016/j.sigpro.2019.107299) — survey of offline CP methods.
7. [Adams & MacKay (2007), arXiv:0710.3742](https://arxiv.org/abs/0710.3742) — Bayesian online changepoint detection.
8. [Pettitt (1979), *JRSS-C* 28(2)](https://doi.org/10.2307/2346729) — nonparametric single-step detection.
9. [Mann (1945), *Econometrica* 13(3)](https://doi.org/10.2307/1907187) — the nonparametric trend test.
10. [Sen (1968), *JASA* 63(324)](https://doi.org/10.1080/01621459.1968.10480934) — robust slope estimator, rank-based interval.
11. [Helsel et al. (2020), USGS TM 4-A3](https://doi.org/10.3133/tm4a3) — practical Mann–Kendall/Sen, incl. the §2.2 CI.
12. [Hamed & Rao (1998), *J. Hydrology* 204](https://doi.org/10.1016/S0022-1694(97)00125-X) — MK variance correction under autocorrelation.
13. [Yue et al. (2002), *Hydrological Processes* 16](https://doi.org/10.1002/hyp.1095) — prewhitening under autocorrelation.
14. [Cameron & Miller (2015), *J. Human Resources* 50(2)](https://doi.org/10.3368/jhr.50.2.317) — the 30–50 cluster rule.
15. [Benjamini & Hochberg (1995), *JRSS-B* 57(1)](https://doi.org/10.1111/j.2517-6161.1995.tb02031.x) — FDR: the right control for a scan.
16. [PostgreSQL — Aggregate Functions](https://www.postgresql.org/docs/current/functions-aggregate.html) — `regr_slope`, `regr_r2`, `percentile_cont`.
17. [MLB Glossary — Pitch Timer](https://www.mlb.com/glossary/rules/pitch-timer) / [Shift Restrictions](https://www.mlb.com/glossary/rules/shift-restrictions) — the 2023 step boundary.
18. [Baseball Savant — CSV docs](https://baseballsavant.mlb.com/csv-docs) — `pitch_type` is a model output, not a measurement.

**Triton-internal evidence (2026-08-11; measured or read at the cited location, not re-queried):**
Povich monthly Stuff+, FF splits, usage and release position from `Li/metric-governance/08` §5.1
(n = 149). Coverage (Apr 99.5% → Aug 0 / 36,621) and the ≈249,188-row repair from
`Li/metric-governance/02` §3.1–3.2. Pitch-level SD ≈ 6.5 and the ±0.3–0.6-point vintage bias from
`Li/metric-governance/05`. Pitch-mix shares, retro-applied `ST`/`SV` back to 2015, and 54 unactioned
`checkNewPitchNames` warnings from `Jo/data-quality/04`. Stuff+ formula and baseline join read at
`app/api/update/route.ts:251-333`.
