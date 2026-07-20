---
title: Bat Tracking Analytics — Statcast Metrics, Tradeoffs, and Facility Application
domain: hitting
tags:
  - bat-tracking
  - bat-speed
  - swing-length
  - squared-up-rate
  - attack-angle
  - swing-path
  - blast-motion
  - facility-metrics
sources_reviewed: 21
last_updated: 2026-07-19
---

# Bat Tracking Analytics — Statcast Metrics, Tradeoffs, and Facility Application

## TL;DR

- **Statcast bat tracking (live since April 3, 2024; five high-frame-rate Hawk-Eye cameras per park) measures bat speed at the sweet spot — 6" from the bat head — on "competitive" swings**: MLB average is ~72 mph, two-thirds of swings fall 68–77 mph, "fast swing" = 75+ mph (~23% of swings), and average swing length is 7.3 ft.
- **The compound metrics carry the signal, not raw bat speed**: squared-up contact (actual EV ≥ 80% of theoretical max) hits .372/.659 with +11 runs per 100 swings vs. .127/.144 and −6 when not squared up; a "blast" (squared-up% × 100 + bat speed ≥ 164, ~7% of swings) produces .546 AVG / 1.116 SLG / 99% hard-hit. Blast rate correlates with wRC+ at r = 0.361 — the strongest of the new metrics — while raw bat speed explains only ~1% of wRC+ variance (r = 0.11) (proven).
- **The bat speed ↔ swing length ↔ contact tradeoff is real but roughly value-neutral for the average hitter**: swings longer than 7.3 ft whiff 30% vs. 19% for shorter swings but slug .422 vs. .359; Powers & Yurko's causal analysis (arXiv 2507.01238, *The American Statistician* 2026) finds shortening up with two strikes cuts strikeouts but the power loss "approximately counteracts the benefit to the average batter" (proven).
- **Bat speed is extremely sticky and ages late**: player averages stabilize within a handful of swings (regression amount ≈ 3 swings per Tango), stay roughly flat through age 31, then decline 0.25–0.5 mph/year — but year-over-year bat speed *changes* predict wRC+ changes at only r² = 0.03 (proven).
- **1 mph of bat speed ≈ +1.2 mph exit velocity ≈ ~5–7 ft of fly-ball carry** (Alan Nathan / Driveline), and peak wOBAcon occurs at ~90–95% of max-effort bat speed — max intent on every swing is not the target (proven).
- **The 2025 swing-path suite added shape**: swing path tilt (league avg 32°, range ~20–50°), attack angle at contact (avg 10°; "ideal" 5–20° produces .272/.487 vs. .250/.354 outside it), ideal attack angle rate (leaders ~72–74%), and attack direction (avg +2° pull-side). Attack angle is substantially a *timing* metric — it moves with contact depth (proven).
- **Overload/underload bat training produces real but modest gains** — classic randomized work (DeRenne-era, 12-week protocols) shows ~6–10% swing-velocity improvement, and Driveline's 6-week/160-swings-per-week internal study replicated the direction of effect (promising); acute weighted-bat *warm-ups* do not raise bat speed and can distort attack angle in adolescents (Frontiers 2025, n=69, ES ≤ 0.08 for speed) (proven, for the null).
- **Facility-grade sensors are good enough for training decisions, with caveats**: across four commercial sensors vs. 500 Hz Vicon mocap, swing-speed ICC averaged 0.78 (Blast 0.67; Diamond Kinetics 0.82) with ~8% random error and systematic underestimation at high speeds; swing-angle metrics were far less reliable (ICC < 0.60 for 3 of 4 sensors) — trust speed trends, be skeptical of single-swing angle readings (proven).
- **Benchmarks by level (Blast Motion)**: bat speed MLB 66–78, college 61–73, HS varsity 57–71, middle school 46–62, youth 40–56 mph; rotational acceleration MLB ~17.2 g vs. D1 ~13.3 g; on-plane efficiency target ≥ 70%.

## 1. The Statcast Bat Tracking Suite: Definitions and League Benchmarks

MLB's bat tracking went public in May 2024 (data collected from April 3, 2024, with partial data back to the second half of 2023). Five high-frame-rate Hawk-Eye cameras per stadium track the bat in 3D alongside the pitch. Core definitions and league numbers:

- **Bat speed** — linear speed of the "sweet spot," measured 6 inches from the head of the bat, at contact (or nearest to it on whiffs). League average **72 mph**; two-thirds of swings between 68–77 mph; average bat speed on home runs **75 mph**. A player's seasonal average uses only "competitive" swings: the fastest 90% of his swings plus any 60+ mph swing producing 90+ mph exit velocity — deliberately excluding check swings and defensive pokes.
- **Fast swing rate** — share of competitive swings at **75+ mph** (~23% league-wide). 75 mph is where per-swing run value crosses from negative to average: fast swings produce .306/.603, .388 wOBA, 52% hard-hit, +0.5 runs/100 swings; sub-75 swings produce .247/.371, .267 wOBA, 36% hard-hit, −3 runs/100. Range of hitters is enormous: Giancarlo Stanton averaged 81 mph with a ~99% fast-swing rate; Luis Arraez averaged ~62 mph with zero fast swings.
- **Swing length** — total distance traveled by the bat head in XYZ space from start of tracking to contact. League average **7.3 ft**. Longer ≠ worse: above-average-length swings slug .422 (vs. .359) but whiff 30% (vs. 19%).
- **Squared-up rate** — a swing is "squared up" if actual exit velocity is ≥ **80% of the maximum theoretical EV** given that swing's bat speed and the pitch speed (a smash-factor concept; Driveline had used "smash factor" internally for years). Squared-up contact: .372/.659, .439 wOBA, 59% hard-hit, +11 runs/100. Not squared up: .127/.144, 1% hard-hit, −6 runs/100.
- **Blast** — squared-up contact achieved *with* bat speed: technically `squared_up% × 100 + bat_speed ≥ 164`. Only ~7% of swings. Blasts: **.546 AVG / 1.116 SLG / .706 wOBA, 99% hard-hit, +32 runs/100 swings**. Everything else: .178/.224. This is the "got the A-swing off and squared it" metric.
- **Sword** — the pitcher-side novelty stat: an *incomplete* swing (bat head crosses a line 5" in front of the plate and never comes back through it) with bat speed at or below the **10th percentile**, i.e., a hitter frozen/fooled into an ugly, non-competitive hack. Popularized by Rob Friedman (Pitching Ninja), formalized on Savant in 2024.

**April 2025 additions (swing path suite)** — measured over the final 40 ms before contact:

- **Swing path tilt** — angular orientation of the swing plane vs. the ground. League average **32°**, observed range roughly 20° (flattest: Anthony Santander LHB 23°, Jake Burger 24°) to ~50° (steepest: Riley Greene 46°, Freddie Freeman 42°). Hitters do change it: Spencer Torkelson went 33° → 40° year over year.
- **Attack angle** — vertical direction the sweet spot is traveling *at contact*. League average **10°** (Blast-sensor populations report ~8° with a 2–16° MLB range — different measurement conventions, same neighborhood). Extremes: Tyler O'Neill/Eugenio Suárez ~20° (fly-ball profiles) vs. Vladimir Guerrero Jr. ~1° (ground-ball tendency despite elite EV).
- **Ideal attack angle rate** — % of competitive swings with attack angle in **5–20°**, the band matching typical pitch descent angles. In the ideal band since mid-2023: .272 AVG / .487 SLG / .323 wOBA; outside it: .250/.354/.261. 2025 leaders: Ketel Marte (LHB) and Corbin Carroll ~74%, Kyle Schwarber 72%.
- **Attack direction** — horizontal bat direction at contact; 0° neutral, positive = pull-side. League average **+2°**. Isaac Paredes +15° (extreme pull), Brice Turang −11° (oppo-oriented).

**For Soto:** These definitions are the canonical vocabulary for any Triton hitting module. If/when bat-tracking fields land in the Statcast feed we ingest (`pitches` already carries the pitch-level spine), `bat_speed`, `swing_length`, `squared_up`, and `attack_angle` columns should mirror Savant semantics exactly — including the competitive-swing filter — so league percentiles port over cleanly. Blast-rate (the 164 threshold) is trivially derivable and is the single best per-swing quality flag.

## 2. What Bat Speed Does — and Doesn't — Buy You

The physics is clean; the season-level statistics are messier than intuition suggests.

**Physics (proven):** Alan Nathan's bat-ball collision work gives the canonical exchange rate: **+1 mph bat speed ≈ +1.2 mph exit velocity**, and ~1.2 mph EV ≈ 4–7 ft of carry on well-struck fly balls. That's the difference between warning track and the first row, which is why bat speed is worth training at all. But collision efficiency means EV also depends on *where* on the bat you hit it — which is exactly what squared-up rate isolates.

**Season-level correlations (proven):** Ben Clemens (FanGraphs, May 2024) found bat speed vs. wRC+ correlates at just **r = 0.11 (~1% of variance)**. Juan Soto and Aaron Judge sit atop both lists, but Arraez-type hitters thrive at 62 mph. Squared-up rate vs. wRC+: r = 0.142. **Blast rate vs. wRC+: r = 0.361** — the compound metric beats its components. Predictively, 2023 bat speed correlates with 2024 wOBAcon at 0.35, marginally better than barrel rate (0.33) (promising). Lesson: bat speed is a *capacity* metric — it widens the space of viable approaches — not a production metric. Driveline's Jack Lambert put it well after clustering 440+ MLB hitters into six swing profiles: "A higher bat speed opens the door to a multitude of different approaches. With lower bat speed, the options are significantly lower and the margin for error is incredibly small."

**Stability and aging (proven):** Average bat speed and swing length are among the stickiest metrics in public baseball data — Tango's regression amounts are on the order of **three swings** to minimize predictive error (compare: exit velocity needs 30–50 BIP; barrel rate far more). Practically, ~15–25 competitive swings give a trustworthy player average, though single hot/cold games can still move tiny early-season samples ~1.5 mph (Chad Young, RotoGraphs, March 2026). Tango's aging curve: bat speed is **flat through age 31, then declines 0.25–0.5 mph/year**, with the first sharp drop between ages 32–33.

**Changes are real but not destiny (promising):** Year-over-year gainers of +3 mph exist (Yuli Gurriel +3.2, Colton Cowser +3.0, Tyler O'Neill +2.7 from 2023→24), yet the correlation between bat speed change and wRC+ change was r² = 0.03. The Acuña 2024 case is instructive: bat speed unchanged, but blast rate collapsed 21.8% → 12.7% — the *quality-of-contact compound*, not the engine, explained the decline.

**Effort management (promising):** Driveline's batted-ball data shows peak wOBAcon at ~**90–95% of max bat speed** — hitters perform best slightly below red-line, where barrel accuracy is preserved. This matches the game data: blasts require both speed *and* squareness.

**For Soto:** For Neptune athletes, treat bat speed like velo for pitchers: a trainable capacity KPI with fast-stabilizing measurement (one assessment session of ~20 competitive swings is a valid baseline), reported alongside a contact-quality compound (facility "blast rate" = squared-up% + speed threshold scaled to the athlete's level). For Trevor's own content/analysis: bat-speed leaderboards are engagement gold, but the analytical takes should always route through blasts and squared-up rate.

## 3. The Bat Speed / Swing Length Tradeoff

This is the most studied question in the public bat-tracking literature, and the best work is Powers & Yurko, *"Swinging, Fast and Slow"* (arXiv 2507.01238; *The American Statistician*, 2026).

**The confounds (proven):** Both metrics are measured *at contact*, so timing contaminates them. Meet the ball deeper and the same physical swing reads shorter and slower; meet it out front (pulling) and it reads longer and faster. Swing length is heavily correlated with pull rate for exactly this reason. And pitch recognition confounds outcome analysis: hitters take their fastest swings when ahead in the count against fastballs they've identified.

**The causal estimate (proven, within model assumptions):** Powers & Yurko fit a Bayesian hierarchical skew-normal model of swing intention conditional on count and pitch location, decomposed variance (between-batter differences dominate both bat speed and swing length variation), then used batter-specific count effects as instruments to estimate causal effects of bat speed/swing length on contact and power. Headline: **hitters can reduce strikeout rate by slowing down / shortening up as strikes accumulate, but for the average batter the power sacrificed approximately cancels the contact gained.** Two-strike swing modification is a real, measurable behavior (hitters demonstrably slow down and shorten with two strikes) but is close to value-neutral on average — meaning it should be an *individualized* decision, driven by whether a given hitter's contact gain outruns his power loss.

**Raw tradeoff numbers (proven):** Longer-than-average swings: 30% whiff, .422 SLG. Shorter-than-average: 19% whiff, .359 SLG. Longer swings buy time/distance to accelerate; the cost is contact margin. Neither end is "correct" — Stanton (very fast, relatively short for his speed) and Arraez (slow, short, 80+ squared-up leader) are both stable equilibria; Lambert's six-cluster analysis (Fast & Long / Efficient / Average / Slow-Efficient / High-Variance / Struggling) shows multiple viable archetypes, with the "Struggling" cluster defined by low speed *and* low acceleration — no margin anywhere.

**Derived path metrics (promising):** From public speed + length you can derive average swing acceleration (a ≈ v²/2d) and time-to-contact (t ≈ 2d/v... Lambert's kinematic approximations). These correlate moderately with Blast sensor biomechanics at the player level, but assume constant, planar acceleration — both false — so treat them as ranking tools, not physical truth.

**For Soto:** Two direct Triton plays. (1) A **two-strike delta profile** per hitter: Δbat speed, Δswing length, Δwhiff, Δpower with two strikes vs. otherwise — the Powers & Yurko result says the league-average delta is value-neutral, so hitters with strongly positive or negative individual deltas are genuinely interesting (adjusters vs. non-adjusters, and whether adjusting even helps them). (2) Any facility swing-length number must be interpreted jointly with **contact-point depth** (TrackMan B1 reports 3D contact point) — otherwise you'll "coach away" swing length that's actually a pull-side contact point.

## 4. Swing Path Modeling: Tilt, Attack Angle, and Direction

The 2025 suite turned public data from "how fast" to "what shape," enabling real swing-path modeling:

- **Tilt (32° avg) is the stable, structural descriptor** of a hitter's swing plane — it's a trait, changes deliberately (Torkelson +7°), and maps to batted-ball profile: steeper tilt → more loft-oriented contact, flatter tilt → more slap/line orientation (promising).
- **Attack angle (10° avg) is state, not trait**: it varies swing-to-swing with contact depth. A hitter with a fixed swing shape shows a higher attack angle on balls met out front and lower on balls hit deep — which is why Statcast frames **ideal attack angle rate (5–20°)** as "largely reflective of timing" (proven). The 5–20° band works because it approximately matches the descent angle of pitches, keeping the barrel on the pitch plane longer.
- **Attack direction (+2° avg)** quantifies pull orientation at contact and is the horizontal complement — Paredes' +15° is the geometric signature of his short-porch pull game.
- Blast's sensor-world equivalents: attack angle "ideal" often quoted as 6–14° for line drives, **on-plane efficiency ≥ 70%** as the target, MLB typical attack angle range 2–16° (plausible — vendor conventions differ slightly from Statcast's contact-point definition).

The modeling insight practitioners converged on: a swing is well described by (plane tilt, where along the plane contact happens, bat speed at contact). Squared-up rate then measures barrel accuracy on that plane, and ideal attack angle rate measures timing consistency. Pitch-level context matters — matching swing plane to pitch plane is the mechanism, so four-seamers up (flat approach angle) punish steep swings while sinkers down punish flat ones (promising; consistent with swing-plane matchup analyses across FanGraphs/Driveline).

**For Soto:** This trio is the schema for a facility swing model: `tilt` (trait, tracked monthly), `attack_angle` distribution + `ideal_attack_angle_rate` (timing KPI, tracked per session), `attack_direction` (approach descriptor). It also feeds pitching-side work already in Triton: a pitcher-vs-swing-plane matchup layer (e.g., flat-VAA four-seamers vs. steep-tilt hitters) is a natural extension of the existing Stuff+/deception models and a differentiated Compete feature.

## 5. Training Bat Speed: What the Evidence Says

**Overload/underload (long-term programs) (promising, direction proven):** The classic literature — DeRenne and colleagues' 12-week randomized protocols with ~60 university players (batting-practice and dry-swing groups alternating overweighted/underweighted/standard 30-oz bats) — found significant swing-velocity gains vs. control in both training modes, with the field's usual summary being **~6–10% swing velocity improvement** over 12 weeks. Driveline's implement system uses **±20% of game bat weight** (barrel-load +20%, handle-load +20% distributed toward hands, underload −20%); their 2017 internal study (n=28, 6 weeks, 160 swings/week, Axe Bat Speed Trainers vs. game-bat control, tested every 3 weeks) reported results "consistent with previous research." A representative program: 8 swings each of barrel-load / handle-load / underload / game bat, 3–4×/week. Grade the *direction* proven (multiple RCT-style studies agree), the *magnitude* promising (6–10% is from small older samples; expect less in trained athletes).

**Weighted-bat warm-ups (acute) (debunked as a speed enhancer):** The 2025 Frontiers study (Li, Cheng & Zhang; n=69 across 12–14y, 14–15y, 16–18y, university, professional; 5 warm-up swings with normal/heavy/light bats) found **no significant acute bat speed change in any group** (ES −0.055 to +0.081) and *did* find attack-angle disruption (12–14y normal-bat ES −0.315; university ES +0.456), with hip-rotation kinematics shifting significantly. Authors explicitly advise against weighted warm-up swings for adolescents. This matches the older warm-up literature: the on-deck donut "feels faster" via kinesthetic illusion but doesn't add speed.

**Strength and intent (promising):** Driveline's practitioner position is that bat speed responds to (a) general force production (body mass and lower-half strength correlate with EV in their gym data), (b) high-intent swing training with feedback (radar/sensor numbers visible per swing), (c) implement variation for movement-quality reasons — handle-load for hitters who "cast" early, underload for intent/speed. Sensor feedback loops matter: the same motor-learning logic (Schmidt & Lee specificity) as velocity training on the pitching side.

**Equipment physics (proven):** Swing-weight (MOI about the knob), not scale weight, governs swingability. The 2025 torpedo-bat episode is the clean case study: Nathan's April 2025 analysis found the MLB torpedo designs kept MOI *identical* to conventional bats, so there is **no bat-speed gain**; the actual benefit is a wider sweet spot — collision efficiency improves toward the handle-side contact zone at a cost near the tip, with a maximum EV gain of only ~+0.25 mph but "gains on the inside far exceed losses on the outside." Marketing said power; physics says forgiveness. For youth players, lower-MOI bats are a legitimate, immediate bat-speed lever — the mass-vs-speed tradeoff in the collision equation slightly favors speed.

**For Soto:** Neptune's bat-speed program spine writes itself: baseline assessment (20 competitive swings, sensor + radar), ±20% implement work 3–4×/week in 6–12-week blocks, retest every 3 weeks, general strength as the base layer, and *no weighted warm-up swings for the youth groups* — that's an evidence-backed differentiator vs. every donut-swinging travel-ball program. Expected honest marketing claim: "2–4 mph in a training block for developing hitters" (the conservative end of 6–10% on a 55–65 mph youth/HS swing), not the 8–10 mph some vendors imply.

## 6. Measuring Swings Outside the Big Leagues: Sensors, Accuracy, and Benchmarks

**Sensor accuracy (proven):** Morishita & Jinji (*Sports*, 2022) tested four commercial sensors — Mizuno Swing Tracer, **Blast Motion**, Garmin Swing Coach, **Diamond Kinetics** — against 16-camera, 500 Hz Vicon mocap (7 players, ~50 trials/sensor). Swing speed ICCs: Mizuno 0.91, Garmin 0.91, Diamond Kinetics 0.82, **Blast 0.67** (mean 0.78), with **all sensors underestimating speed**, accuracy degrading above ~30 m/s (67 mph — i.e., exactly the range elite hitters live in), and ~8% average random error. Swing-*angle* metrics were markedly worse: ICC < 0.60 for three of four sensors (only Diamond Kinetics > 0.80). Practical read: sensor bat speed is reliable for *within-athlete trends*; single-swing angle readouts (attack angle, on-plane %) should be averaged over sessions before acting on them, and never compared across sensor brands.

**Benchmarks by level (Blast Motion norms) (promising — vendor norms, large N but selection-biased):**

| Level | Bat speed (mph) | Peak hand speed (mph) | Attack angle (°) |
|---|---|---|---|
| MLB | 66–78 (Statcast game avg 72) | 23–29 | 2–16 (avg ~8–10) |
| MiLB | 63–75 | 22–28 | 1–15 |
| College | 61–73 | 21–27 | 0–14 |
| HS varsity | 57–71 (college-bound: 63–70 consistent) | 20–26 | 0–14 |
| HS JV | 53–67 | 19–25 | 0–14 |
| Middle school | 46–62 | 18–24 | 0–14 |
| Youth | 40–56 | 17–23 | 0–14 |

Rotational acceleration: MLB average ~**17.2 g** vs. D1 ~**13.3 g**; practitioner claim that hitters averaging < 14 g stall by High-A/AA regardless of bat speed (plausible — scouting heuristic, not published research). On-plane efficiency target ≥ 70%.

**Facility tech stack and pricing (2025):** Blast Motion sensor **$149.95** + premium from $6.95/mo (used by ~83% of MLB orgs); Rapsodo hitting **~$3,500** (PRO 2.0); HitTrax cage systems at multi-tens-of-thousands install cost (HitTrax Home tier $49.99/mo, up to 4 players); TrackMan Portable B1 tracks exit speed, launch angle/direction, spin, and **3D contact point** for hitting. Note the key gap: radar/camera units (TrackMan, HitTrax, Rapsodo) measure the *ball*; bat sensors measure the *bat*. A facility approximating the Statcast suite needs both — bat speed + swing length from sensor, EV + contact point from ball-tracking — and can then compute its own squared-up rate (EV ÷ theoretical max EV from bat speed + pitch speed) and blast-equivalent.

**For Soto:** Neptune already has TrackMan via Compete. Adding ~$150 Blast sensors (a dozen = under $2K + subscriptions) closes the loop and lets Triton compute *true* squared-up/blast analogs per swing by joining sensor bat speed to TrackMan EV + pitch speed on timestamps — a genuinely TruMedia-grade facility metric almost no competitor computes correctly. Schema sketch for `compete_swings`: `session_id, ts, bat_speed, peak_hand_speed, attack_angle, tilt, on_plane_pct, rot_accel_g, ev, la, contact_x/y/z, squared_up_pct, is_blast_equiv`. Store the sensor brand — cross-brand numbers are not comparable (ICC spread above).

## 7. Interpretation Traps and Open Questions

- **Measurement-at-contact confound** (the big one): bat speed and swing length are snapshots at an endpoint the hitter chooses via timing. Player comparisons are largely fine (between-batter variance dominates, per Powers & Yurko), but *within-player changes* can be timing/approach changes masquerading as swing changes (proven).
- **Squared-up rate ≠ line drives**: Clemens found essentially no correlation between squared-up rate and line-drive rate — squareness is about efficiency of energy transfer, not trajectory. Don't sell it as a "line drive machine" metric (proven).
- **Small early-season samples**: despite fast stabilization, a 17-swing April average can sit 1.5 mph off true talent; require ~50+ competitive swings before flagging a change in a Triton alert (promising).
- **Bat speed change ≠ production change** (r² = 0.03): always pair an engine metric with a compound (blasts) before narrating improvement or decline (proven).
- **Open questions (2026)**: pitch-level bat tracking in the public Statcast search is still partial; MiLB bat tracking is beginning to surface on Savant leaderboards; nobody has yet published a validated youth-level blast threshold (the 164 constant is calibrated to MLB pitch speeds — a facility version must re-derive it per pitch-speed environment). That re-derivation is a publishable Soto project.

## Sources

1. Baseball Savant — Statcast Bat Tracking leaderboard & metric docs: https://baseballsavant.mlb.com/leaderboard/bat-tracking
2. MLB.com — "What you need to know about Statcast bat tracking" (May 2024): https://www.mlb.com/news/what-you-need-to-know-about-statcast-bat-tracking
3. MLB.com — "New Statcast metrics measure swing path, attack angle, attack direction" (2025): https://www.mlb.com/news/new-statcast-swing-metrics-2025
4. MLB Glossary — Sword: https://www.mlb.com/glossary/statcast/sword
5. MLB Glossary — Ideal Attack Angle: https://www.mlb.com/glossary/statcast/ideal-attack-angle
6. Ben Clemens, FanGraphs — "What Statcast's New Bat Tracking Data Does and Doesn't Tell Us" (May 14, 2024): https://blogs.fangraphs.com/what-statcasts-new-bat-tracking-data-does-and-doesnt-tell-us/
7. Ben Clemens, FanGraphs — "Early Notes on the New Bat Speed Data Release" (Feb 13, 2025): https://blogs.fangraphs.com/early-notes-on-the-new-bat-speed-data-release/
8. Ben Clemens, FanGraphs — "Early Observations From Statcast's New Bat Tracking Data" (2024): https://blogs.fangraphs.com/early-observations-from-statcasts-new-bat-tracking-data/
9. Scott Powers & Ronald Yurko — "Swinging, Fast and Slow: Interpreting variation in baseball swing tracking metrics," arXiv 2507.01238 / *The American Statistician* (2026): https://arxiv.org/abs/2507.01238
10. Jack Lambert, Driveline Baseball — "Using MLB Bat Tracking Data to Better Understand Swings" (July 2024): https://www.drivelinebaseball.com/2024/07/using-mlb-bat-tracking-data-to-better-understand-swings/
11. Driveline Baseball — "The Complete Guide to Driveline Bat Speed Trainers" (Feb 2025): https://www.drivelinebaseball.com/2025/02/the-complete-guide-to-driveline-bat-speed-trainers/
12. Driveline Baseball — "How to Increase Your Bat Speed" (Aug 2021): https://www.drivelinebaseball.com/2021/08/hit-the-ball-harder-how-to-increase-your-bat-speed/
13. Driveline Baseball — "Training Hitters with Weighted Bat Training" (Jan 2017): https://www.drivelinebaseball.com/2017/01/training-hitters-overload-underload-implements/
14. Morishita Y., Jinji T. — "Accuracy and Error Trends of Commercially Available Bat Swing Sensors in Baseball," *Sports* (Basel), 2022: https://pmc.ncbi.nlm.nih.gov/articles/PMC8879135/
15. Li, Cheng & Zhang — "Impacts of dry swing intervention on bat speed and attack angle," *Frontiers in Sports and Active Living* (2025): https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2025.1591520/full
16. DeRenne et al. — "Effects of Weighted Bat Implement Training on Bat Swing Velocity," *JSCR* (1995): https://journals.lww.com/nsca-jscr/abstract/1995/11000/effects_of_weighted_bat_implement_training_on_bat.9.aspx
17. Alan Nathan, FanGraphs — "The Physics of the Torpedo Bat" (Apr 7, 2025): https://blogs.fangraphs.com/the-physics-of-the-torpedo-bat/
18. Blast Motion — "What Is Bat Speed in Baseball? Age Benchmarks" & swing metrics guide: https://blastmotion.com/blog/what-is-bat-speed-in-baseball/
19. RPP Baseball — "Blast Motion Baseball Metrics, Rotation, Angles and Power": https://rocklandpeakperformance.com/blast-motion-metrics-rotation-angles-power/
20. Chad Young, RotoGraphs — "Small Sample Sizes in Bat Tracking" (Mar 30, 2026): https://fantasy.fangraphs.com/small-sample-sizes-in-bat-tracking/
21. TrackMan — Portable B1 hitting/pitching metrics: https://www.trackman.com/baseball/Portable-B1/what-we-track
