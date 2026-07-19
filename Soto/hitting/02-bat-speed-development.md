---
title: Bat Speed Development — Overload/Underload Training, Strength Correlates, Benchmarks, and Timelines
domain: hitting
tags:
  - bat-speed
  - overload-underload
  - weighted-bats
  - driveline
  - statcast-bat-tracking
  - strength-training
  - benchmarks
  - player-development
sources_reviewed: 22
last_updated: 2026-07-19
---

# Bat Speed Development — Overload/Underload Training, Strength Correlates, Benchmarks, and Timelines

## TL;DR

- **Bat speed is the single most bankable hitting power input**: per Alan Nathan's physics work, every +1 mph of bat speed ≈ +1.2 mph exit velocity ≈ 4–7 ft of carry on well-struck balls (proven). Statcast's own framing: ~6 extra feet of distance per mph on balls in the air.
- **MLB bat-tracking baselines (Statcast, measured at the sweet spot 6" from the bat head)**: league-average competitive swing ≈ 71.5 mph in 2024, ~72.3 mph among qualified hitters in 2025; a "fast swing" is 75+ mph, ~22–25% of all swings. Giancarlo Stanton is the outlier ceiling at ~80.6 mph average with 98% fast-swing rate.
- **Chronic overload/underload training works, but the "vs. control" story is nuanced**: the classic DeRenne et al. (1995) protocol — 12 weeks, 4 days/wk, 150 swings/session with bats ±12% of game weight — produced ~10% bat speed gains, the largest in the literature (proven that gains occur; promising that ±12% loading beats equal-volume game-bat swinging). Several studies (Sergo & Boatwright 1993; Nakata light-vs-heavy dry-swing study) found all groups improved with no between-group differences — high-intent swing volume itself is a large share of the effect (promising).
- **Realistic gains and timelines**: 6–12 week blocks; 4–10% bat speed improvement for trained HS/college players (≈ 2.5–6 mph at those speeds); Driveline's marketing/case-study range is 3–5 mph in 4 weeks and 4–8 mph for athletes new to the training (promising — practitioner data, not peer-reviewed). First-cycle gains are the biggest; repeat cycles yield diminishing returns.
- **Heavy on-deck donuts are a debunked warm-up strategy**: acute weighted-bat warm-ups do not raise, and often lower, subsequent game-bat speed while distorting swing kinematics; a 2025 randomized study (n=69, ages 12–pro) found no bat speed benefit (ES −0.45 to +0.28) and recommends adolescents avoid weighted warm-up bats entirely (debunked as a speed enhancer; the "feels lighter" effect is a kinesthetic illusion).
- **Strength correlates are real but moderate**: lean body mass r = 0.54, rotational med-ball throw velocity r = 0.65 (39% of bat speed variance), non-dominant grip r = 0.59, back strength r = 0.40; each +1 kg of grip strength independently predicts +0.3 mph peak exit velo in youth (n=129) (proven correlations; causal transfer of any single lift is only plausible).
- **Bat speed ages well and is trainable late**: it peaks ~age 25, holds roughly flat through 31, then declines ~0.25–0.5 mph/yr — but players in their 30s who are new to dedicated bat-speed training still gain (Arenado at 31, Betts' career-best 92.4 mph avg EV at 30) (promising).
- **2026 is a bat-speed arms race**: 34 qualified MLB hitters added ≥1 mph of average bat speed vs. 2025 (max: Miguel Vargas +3.5 mph, All-Star breakout), and 9 of them had already passed their full-2025 HR totals by the All-Star break. League-wide bat speed keeps rising even as fastball velo hit 94.7 mph.

## Why Bat Speed Matters: The Physics and the Run Value

Bat speed is the dominant controllable input to exit velocity. Alan Nathan's collision physics, echoed by Driveline and MLB's Statcast team, put the exchange rate at roughly **+1.2 mph exit velocity per +1 mph bat speed** (some sources stretch it to 1.2–1.5 depending on contact quality and pitch speed), which converts to about **4–7 feet of additional carry per mph** on well-struck balls — MLB's public framing is ~6 feet per mph on balls in the air (proven). That is the difference between a warning-track flyout and a home run on the hardest-hit 5% of a hitter's contact.

Two caveats keep this honest:

1. **Bat speed is necessary, not sufficient.** Statcast's squared-up rate compares realized exit velocity to the theoretical max available from that swing's bat speed and pitch speed; ≥80% of ceiling counts as "squared up." League average squared-up rate is ~25% per swing. A bat speed gain only converts to production if squared-up rate holds — the 2026 league-wide pattern shows bat speed rising while squared-up rate sags for some gainers, i.e., some hitters are buying speed with contact quality (proven that both dimensions matter; the speed/contact tradeoff magnitude per player is an open question).
2. **Swing length and attack angle are entangled.** Faster swings tend to be longer; Statcast reports both. Speed added by lengthening the swing costs adjustability; speed added at the same swing length is nearly pure profit.

**For Soto:** the Triton analog of Stuff+ for hitters starts here — a "Swing+" style z-score model on Statcast bat-tracking fields (bat_speed, swing_length, squared_up, fast-swing rate) mirrors the existing `100 + z*weights` architecture. Baseball Savant's bat-tracking leaderboard exports these per player since April 2024; they are the obvious next ingest alongside `pitches`.

## MLB Bat-Tracking Benchmarks and 2024–2026 Trends

Statcast has measured every MLB swing since April 2024 (Hawk-Eye, sampled at the "sweet spot," 6 inches from the bat head — critically, *not* the bat tip, which moves faster).

Key league numbers (proven — direct tracking data):

- **Average competitive swing: 71.5 mph** (2024 launch year); **~72.25 mph** among qualified hitters in 2025 — the league is drifting upward.
- **Fast swing = 75+ mph**; roughly 22–25% of MLB swings qualify.
- **Distribution tails**: Giancarlo Stanton averaged ~80.6 mph, nearly 3 mph clear of the #2 swinger (Oneil Cruz), with 98% of swings ≥75 mph — the next-best fast-swing rate was Kyle Schwarber at 73.9%.
- **2026 leaders**: Junior Caminero, Oneil Cruz (78.4 mph), Jordan Walker, Jac Caglianone, Kyle Schwarber, James Wood populate the top of the board.
- **2026 gainers**: 34 qualified hitters improved average bat speed by ≥1.0 mph year-over-year; Miguel Vargas led at **+3.5 mph**, jumping from below-average to well-above-average bat speed and making the All-Star team. Of the 21 hitters who had already exceeded their full-2025 HR total by mid-2026, nine were on the ≥1 mph gainer list (proven counts; the causal story per player is promising).
- FanGraphs' 2025 riser/faller tracking flagged Addison Barger and Ben Rice (+~2 mph average bat speed) as breakout cases where the speed gain preceded the production gain.

The meta-trend: dedicated offseason bat-speed programs (Driveline's hitting department is the most-cited vendor among big leaguers) have made **in-career bat speed gains a normal, expected event** rather than an anomaly — this is the hitting-side echo of the 2015–2020 pitching velocity revolution (promising).

**For Soto:** Triton should compute year-over-year Δbat-speed as a first-class metric — the 2025→2026 gainer list is precisely the "who changed their engine" signal that predicts breakouts before surface stats move. It slots naturally next to the Stuff+ delta views on the pitching side.

## Bat Speed Benchmarks by Age and Level

Consensus benchmark table assembled from Blast Motion's sensor database and WIN Reality's synthesis (promising — vendor data, large samples, but self-selected populations and practice-swing contexts):

| Level | Ages | Typical bat speed (mph) |
|---|---|---|
| Youth | 8–10 | 40–50 |
| Youth (advanced) | 11–12 | 48–56 |
| Middle school | 13–14 | 46–62 |
| HS JV | 14–15 | 53–67 |
| HS Varsity | 15–18 | 57–71 |
| College | 18–22 | 61–73 (D1-bound hitters typically 63–70+) |
| MiLB | — | 63–75 |
| MLB (Blast sensor) | — | 66–78 |
| MLB (Statcast, game swings) | — | avg ~71.5–72.3; elite 78–81 |

Measurement caveats that matter for any facility program (proven):

- **Instrument and context are not interchangeable.** Blast sensor numbers (tee/practice, all swings) run a few mph below Statcast game-swing averages for the same players; never mix devices in one longitudinal chart.
- **Track averages, not single-swing peaks.** Peak swings are noisy and gameable; a rolling average of max-intent swing sessions is the honest KPI.
- **Bat spec matters**: a 12-year-old's 50 mph with a −10 USSSA bat and a varsity hitter's 65 mph with a BBCOR −3 are different mechanical tasks.

Expected exit-velo conversion by bat speed (WIN Reality's ranges, consistent with the 1.2x physics): 55 mph bat speed → 68–83 mph EV; 65 → 80–98; 70 → 86–105; 75 → 92–112; 80+ → 100–120+ (plausible as ranges; the spread is contact quality).

**For Soto:** these bands are the seed for Neptune's `league_averages`-style hitter benchmark table: (age_band, level, metric) → p25/p50/p75, populated first from vendor norms, then progressively replaced by Neptune's own Compete-pipeline data as athlete sessions accumulate. Confirm Neptune's target age bands — the benchmark table and the training loads below both fork on youth vs. HS vs. college/pro.

## Overload/Underload Training: What the Literature Actually Shows

The theory is straight from Soviet-era throwing research: **overload implements train force production, underload implements train movement speed**, and alternating them shifts the athlete's force-velocity profile at the sport-specific movement (plausible as mechanism; the outcomes evidence is below).

The load-bearing studies:

- **DeRenne, Buxton, Hetzler & Ho (1995, JSCR)** — the field's anchor. College hitters, **12 weeks, 4 days/week, 150 swings/session (15×10)** with bats alternated between light (27–29 oz), standard (~30 oz), and heavy (31–34 oz) — i.e., loads within **±12% of game bat weight**. Result: **~10% bat swing velocity gain**, the largest reported in the peer-reviewed literature. Both a batting-practice group and a dry-swing group improved; the BP (hitting actual balls) group improved ~4% more (proven that the protocol produces gains; promising that BP > dry swings).
- **DeRenne's ±12% rule**: across his training and warm-up work, implements within ±12% of game weight preserved swing kinematics while still shifting load; far heavier/lighter implements distorted mechanics. This is the origin of the "12% rule" (promising — one lab's converging results, widely adopted, never adversarially replicated at modern swing-sensor resolution).
- **Sergo & Boatwright (1993)** — college players, 6 weeks, ~100 dry swings/day, three groups: game bat (29–31 oz), heavy bat (62 oz), heavy+light combination. **All three groups significantly increased bat speed with no between-group differences** (proven result; the inconvenient implication — that volume of intentful swinging, not the load, drove the gain — is the field's most under-cited finding).
- **Nakata et al. (dry-swing light-bat study)** — 34 university players, 100 dry swings/day, 2×/week for 8 weeks; light group 10.6 oz, heavy group 38.8 oz. **Both improved, no group difference**; authors note the very light bat achieved equal gains at lower physical cost (promising).
- **DeRenne's "Effects of Baseball Weighted Implement Training: A Brief Review"** (Strength & Conditioning Journal) synthesizes ~two decades of this work: weighted-implement training reliably improves swing (and throwing) velocity when loads are moderate, volume is substantial (100–150+ swings/session territory in the successful protocols), and the block runs 6–12 weeks (promising as a synthesis).

Honest evidence grading of the composite claim set:

- "A 6–12 week high-volume, high-intent swing program increases bat speed 4–10% in HS/college hitters" — **(proven)**, replicated across multiple designs.
- "±12% (or ±20%, per Driveline) mixed-load training beats an equal volume of max-intent game-bat swings" — **(promising at best)**; the two studies with proper game-bat control arms found no separation. The strongest defensible claim is that varied loads add a force-velocity training stimulus, maintain engagement, and may improve intent quality — not that the implements are magic.
- "Heavier is better" — **(debunked)**; extreme overloads (donut-style, 60+ oz) show no advantage chronically and clear harm acutely (next section).
- Marketing-tier claims of "12–20% in 6 weeks" that circulate in training-aid blogs — **(plausible only for untrained youth; debunked as a general expectation for trained hitters)**.

**For Soto:** the Sergo/Nakata null-between-groups result is the key programming insight for Neptune — the *non-negotiable* ingredients are swing volume (100–160/week minimum at max intent), measurement (every session on a sensor), and 6+ week blocks. The implement mix is the icing. This means Neptune can run an effective program even before buying $599 trainer sets — but the trainers buy intent, novelty, and a coherent progression, which is most of what athletes actually pay for.

## Acute Effects: The On-Deck Donut Is a Kinesthetic Illusion

Chronic training and acute warm-up are opposite stories, and conflating them is the most common consumer error.

- The classic finding (Otsuji-lineage warm-up studies, replicated repeatedly): swinging a heavy donut on deck makes the game bat *feel* lighter but does **not** increase — and frequently decreases — measured bat speed on the next swings, while altering swing timing and kinematics (proven; the "feels faster" perception is a documented kinesthetic aftereffect, i.e., an illusion).
- A **2025 randomized study (Frontiers in Sports & Active Living)**: 69 male players stratified from age 12 through professional; 5 dry swings with normal, weighted, or reduced-weight bats before testing. **No significant pre-post bat speed change in any group** (effect sizes −0.448 to +0.284). Significant *kinematic* disruptions appeared instead — attack angle shifts and hip rotation changes, largest in the 12–15 age bands (hip external rotation ES = 1.62 in 14–15-year-olds with the weighted bat). Authors explicitly advise that **adolescents avoid weighted or underweight bats in pre-game warm-ups** (proven for the acute null; promising for the youth-harm caution).
- The one acute effect with positive evidence: **underload/game-weight PAP-style warm-ups** — sport-specific light-bat swings or swing-specific isometrics — improved subsequent game-bat swing velocity by ~1.3–4.9% (ES 0.16–0.57) in a systematic review of upper-body post-activation performance enhancement (promising).

Bottom line: use heavy implements to *train*, not to *warm up*. If you want an acute bump, swing your game bat or something slightly lighter at max intent.

**For Soto:** this is a clean, defensible "myth-busting" content piece for the Mayday/Neptune content engine — high search volume, strong evidence, and it demonstrates the facility's evidence-graded ethos. Also a coaching rule for Neptune floor staff: no donuts, no 60 oz sledgehammer swings in warm-ups, especially U15.

## Driveline Protocols and the Commercial Landscape

Driveline is the reference implementation of modern bat-speed training:

- **Implements**: Axe Bat Speed Trainers, powered by Driveline — a 3-bat system at **±20% of standard bat weight** (not DeRenne's ±12%): a barrel-loaded (endloaded) overload (+20%, e.g., 33"/36 oz), a **handle-loaded overload** (+20%, weight shifted toward the hands to train barrel acceleration without max moment-of-inertia cost), and a balanced underload (−20%, e.g., 33"/24 oz). Overload alloy bats are rated for full game-speed pitching; the composite underload is limited to tee/flips/soft-toss speeds. **Price: ~$599** for the set, bundled with four 12-week training modules (in-season and off-season variants). Budget alternatives (SKLZ sets, DIY plate-loaded bats) exist at a fraction of the price but without programming or ball-contact ratings.
- **Program structure**: on-ramp phase → progressive blocks modulating volume and intensity; early-offseason emphasizes overload/force, mid-offseason blends, in-season drops to maintenance doses. Their 2017 in-house case study: 28 local players, both groups 160 swings/week for 6 weeks (experimental with Speed Trainers, control with game bats), tested every 3 weeks on peak exit velocity — experimental group outperformed, consistent with the weighted-implement literature (promising — practitioner case study, small n, not peer-reviewed).
- **Claimed outcomes**: 3–5 mph swing-speed gains over 4 weeks of programming; "most players gain 4–8 mph" (skewing to younger/newer trainees); Axe marketing cites 5+ mph exit-speed gains (promising to plausible — real signal, marketing selection effects certain).
- **Adoption at the top**: Driveline's hitting floor now trains a meaningful share of MLB hitters each offseason; director of hitting Tanner Stokey's public position is that bat speed is trainable at any career stage, with the biggest jumps in players *new* to the training (promising).

Other practitioner ecosystems (Tread Athletics' hitting arm, private facilities) run recognizably similar templates: sensor on every swing, intent-based dry-swing blocks with over/under implements, med-ball rotational power work, and heavy general strength work underneath.

**For Soto:** for Neptune's cage spec, the per-athlete equipment cost is modest — a Speed Trainer set ($599) serves many athletes, plus one Blast-class sensor per active athlete (or shared units per cage). The differentiator Neptune can own is the *data spine*: every swing logged into the Compete pipeline, benchmark bands by age, and Δbat-speed dashboards — the thing Driveline sells remotely but a local facility can make tangible weekly.

## Strength Correlates: What to Build in the Weight Room

Correlational literature, in descending order of signal (all proven as correlations in their samples; transfer of training any single quality is plausible, not proven):

- **Rotational medicine-ball throw velocity**: r = 0.65 with bat swing velocity (39% of variance), r = 0.53 with batted-ball velocity, in NCAA D3 players (PubMed 34570055). The single best cheap field test of hitting-specific power.
- **Lean body mass**: r = 0.542 with bat swing velocity in 78 collegiate players (mean BSV 105.2 ± 6.1 km/h ≈ 65.4 mph); LBM plus back strength were the independent predictors in multiple regression. Mass moves the bat (proven correlation — and the Statcast era's parade of "added 15 lbs, gained 2 mph" anecdotes agrees).
- **Grip strength**: non-dominant grip r = 0.59 with bat velocity; in a 129-player youth sample (age 15.5 ± 3.1), each +1 kg of dominant grip strength predicted **+0.3 mph peak exit velocity independent of age, height, and weight** (MSSE 2024). Likely partly causal (better bat control/energy transfer at contact) and partly a proxy for overall maturation and strength (promising).
- **Back/trunk strength and rotational strength**: r ≈ 0.40; D1 work links lower-body strength, rotational strength, and rotational power to both bat speed and batted-ball velocity.
- **Adolescents**: chest pass power dominated (R² = 0.70 for batted-ball speed) with body mass and lateral-to-medial jump adding small independent slices — in youth, general power and just *being bigger* carry the day.
- **Big-three lifts (squat/bench/deadlift)**: correlate through the lean-mass and force pathways (trap-bar deadlift and LBM correlate with batted-ball velocity in D2 samples), but no lift predicts bat speed directly once mass is controlled — a strong athlete with poor sequencing still swings slow (proven for the correlation; debunked as "add 50 lbs to your squat, add 3 mph automatically").

The consensus stack for a hitter's physical program: (1) add lean mass and general strength (squat/deadlift/press family), (2) convert it with rotational power work (med-ball throw variations, tracked by throw velocity), (3) express it with high-intent swing volume on implements, (4) don't neglect grip/forearm work — cheap insurance with independent signal.

**For Soto:** Neptune's intake battery writes itself from this list — bodyweight + LBM estimate, grip dynamometer (both hands, multiple positions; a dynamometer is <$50), rotational med-ball throw velocity (radar gun the facility already owns for pitching), CMJ if force plates arrive, plus sensor bat speed and Trackman exit velo. Every one of these has a published correlation to cite on the athlete report card. For Trevor personally: at 36, the aging data below says bat-speed training is still productive, and his pitcher-built lower half + fresh training stimulus is exactly the "new to the training" profile that gains fastest.

## Aging Curves and Realistic Gain Timelines

**How bat speed ages** (Statcast-era data, Driveline's Oct 2025 analysis + Tango's aging work — proven for the population curves):

- Bat speed **peaks around age 25**; max exit velocity peaks ~26.
- It holds roughly flat (or declines very gently) **through age 31**, then declines **~0.25–0.5 mph per year**.
- Average exit velocity starts eroding earlier than max — bat-to-ball and swing decisions decay on their own schedule.
- Conventional wisdom that hitters "grow into power" in their late 20s is not supported — position players are not getting stronger in their late 20s; slugging is already dropping ~10 points/year by 26 (promising — one shop's analysis, but on tracking-grade data).
- The trainability counterpoint: players in their 30s who take up dedicated bat-speed training still improve — Arenado posting career-best swing metrics at 31 after bat-speed work, Betts' career-best 92.4 mph average EV at 30 — and Driveline projects the population decline point may drift from ~29–31 out to 32–34 as training adoption spreads (promising).

**Realistic gain expectations by profile** (synthesis of the study and practitioner data above):

| Profile | Realistic 6–12 week gain | Notes |
|---|---|---|
| Youth/MS (untrained) | 4–8+ mph | Growth + training conflated; biggest % gains live here |
| HS (first structured block) | 3–6 mph (~5–10%) | DeRenne-zone; volume + intent + implements |
| College/pro (trained) | 1–3 mph | Hard-won; comes from mass gain + F-V profile shifts |
| MLB veteran (new to training) | 1–3.5 mph season-over-season | 2026 gainer list: 34 players ≥+1.0, max +3.5 |
| Repeat cycles (anyone) | Diminishing | First block is the big one; then maintenance economics |

Timeline mechanics (promising, converging practitioner + study evidence):

- **Minimum effective block: ~6 weeks** at 100–160+ max-intent swings/week; the 12-week DeRenne protocol produced the literature's best result.
- **Detraining is real**: gains recede over a layoff; in-season maintenance doses (1–2 short sessions/week) preserve most of the offseason gain.
- **Sequencing matters**: mass/strength phases potentiate later speed phases; chasing bat speed while cutting weight is swimming upstream.
- **Watch the tradeoff dials**: monitor squared-up/contact rate and swing length alongside bat speed; a +2 mph gain that costs 4 points of contact is usually a bad trade below the elite-power archetype (proven that the tradeoff exists league-wide in 2026 data).

## Program Design Template (Neptune Spine)

An evidence-consistent 12-week off-season block for a HS/college hitter (each element graded above):

1. **Weeks 0–1 — Assess & on-ramp**: sensor baseline (avg of top-N max-intent swings), grip, rot. med-ball velo, LBM; teach max-intent culture. 
2. **Weeks 1–6 — Force-biased block**: 3–4 swing days/wk, 120–160 swings/wk; overload-dominant mix (±12–20% loads), heavy general strength 3×/wk, med-ball throws 2×/wk.
3. **Weeks 7–12 — Speed-biased block**: underload/game-bat dominant, ball contact ≥50% of volume (DeRenne's BP > dry-swing edge), taper strength to maintenance, re-test every 3 weeks (Driveline cadence).
4. **In-season**: 1–2 maintenance sessions/wk, game bat + underload only; no weighted warm-ups, ever, for U15s.
5. **KPIs on the athlete card**: Δ avg bat speed, Δ rot. med-ball velo, Δ grip, squared-up proxy (EV realized / EV predicted from bat speed), swing length if sensor supports it.

## Sources

1. DeRenne, Buxton, Hetzler & Ho (1995). Effects of Weighted Bat Implement Training on Bat Swing Velocity. *JSCR*. https://journals.lww.com/nsca-jscr/abstract/1995/11000/effects_of_weighted_bat_implement_training_on_bat.9.aspx
2. DeRenne & Szymanski. Effects of Baseball Weighted Implement Training: A Brief Review. https://www.researchgate.net/publication/232216387_Effects_of_Baseball_Weighted_Implement_Training_A_Brief_Review
3. HittingResearch.com — Effects of Weighted Bat Implement Training on Bat Swing Velocity (literature summary incl. Sergo & Boatwright 1993). http://www.hittingresearch.com/2023/01/effects-of-weighted-bat-implement.html
4. Impacts of dry swing intervention on bat speed and attack angle (2025, Frontiers in Sports & Active Living; n=69 acute RCT). https://pmc.ncbi.nlm.nih.gov/articles/PMC12213483/
5. Dry swing training with a light bat increases bat speed (univ. players, 10.6 vs 38.8 oz, 8 wks). https://www.researchgate.net/publication/330749056_Dry_swing_training_with_a_light_bat_increases_bat_speed
6. Strength and Conditioning Programs to Increase Bat Swing Velocity for Collegiate Baseball Players (*Sports*, 2023; n=78). https://pmc.ncbi.nlm.nih.gov/articles/PMC10610610/
7. Rotational Medicine Ball Throw Velocity Relates to Bat Swing/Batted Ball/Pitching Velocity (PubMed, D3). https://pubmed.ncbi.nlm.nih.gov/34570055/
8. Isolating the Effect of Grip Strength on Exit Velocity in Male Baseball Players (*MSSE*, 2024; n=129). https://journals.lww.com/10.1249/01.mss.0001061296.14862.9f
9. Static Strength, Rotational Strength, Rotational Power, Bat Speed & Batted-Ball Velocity of NCAA D1 Players. https://www.researchgate.net/publication/260834951
10. Anthropometric and physiological factors affecting batted ball speed of adolescent players (chest pass R²=0.70). https://www.academia.edu/125748298
11. Driveline Baseball — Training Hitters with Weighted Bat Training (2017; 28-player case study). https://www.drivelinebaseball.com/2017/01/training-hitters-overload-underload-implements/
12. Driveline Baseball — The Complete Guide to Driveline Bat Speed Trainers (2025). https://www.drivelinebaseball.com/2025/02/the-complete-guide-to-driveline-bat-speed-trainers/
13. Driveline Baseball — Axe Bat Speed Program. https://www.drivelinebaseball.com/axe-bat/
14. Axe Bat — Speed Trainers Bat Set powered by Driveline ($599, ±20% specs). https://axebat.com/products/axe-bat-speed-trainers-powered-by-driveline-baseball-2
15. Driveline Baseball — How Power Ages (2025 aging analysis). https://www.drivelinebaseball.com/2025/10/how-power-ages-it-might-surprise-you/
16. MLB.com — What You Need to Know About Statcast Bat Tracking (2024). https://www.mlb.com/news/what-you-need-to-know-about-statcast-bat-tracking
17. Baseball Savant — Statcast Bat Tracking Leaderboard. https://baseballsavant.mlb.com/leaderboard/bat-tracking
18. MLB.com — Improved bat speed is behind some of MLB's biggest power surges in 2026. https://www.mlb.com/news/improved-bat-speed-is-behind-some-of-mlb-s-biggest-power-surges-in-2026
19. FanGraphs/RotoGraphs — Early 2025 Hitter Average Bat Speed Risers and Fallers. https://fantasy.fangraphs.com/early-2025-hitter-average-bat-speed-risers-and-fallers-a-review/
20. FanGraphs — A Way-Too-Early Look at the Importance of Bat Speed (squared-up framework). https://fantasy.fangraphs.com/a-way-too-early-look-at-the-importance-of-bat-speed/
21. WIN Reality — Bat Speed by Age (benchmark table). https://winreality.com/blog/bat-speed-by-age/
22. Blast Motion — What Is Bat Speed in Baseball? Age Benchmarks. https://blastmotion.com/blog/what-is-bat-speed-in-baseball/
