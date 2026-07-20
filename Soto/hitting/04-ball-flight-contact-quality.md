---
title: Ball Flight & Contact Quality — Exit Velo, Launch Angle, Smash Factor, and the Tech That Measures Them
domain: hitting
tags:
  - exit-velocity
  - launch-angle
  - smash-factor
  - bat-tracking
  - hittrax
  - trackman
  - rapsodo
  - contact-quality
sources_reviewed: 24
last_updated: 2026-07-19
---

# Ball Flight & Contact Quality — Exit Velo, Launch Angle, Smash Factor, and the Tech That Measures Them

## TL;DR

- **Bat speed is worth ~6x pitch speed in the collision.** Alan Nathan's ball–bat physics: EV ≈ q·(pitch speed) + (1+q)·(bat speed), with collision efficiency q ≈ 0.2 for wood. Each +1 mph of bat speed adds ~1.2 mph of exit velocity (~4–7 ft of carry); each +1 mph of pitch speed adds only ~0.2 mph (proven).
- **The value surface is EV×LA, and it's player-specific.** Statcast barrels (≥98 mph EV, LA window opening from 26–30° at 98 mph to 8–50° at 116 mph) ran a .742 AVG / 2.493 SLG in 2023. Sweet-spot contact (8–32° LA) produced .592 AVG / .699 wOBA. Hitters above ~88 mph average EV gain real wOBA from lifting toward 14°+; sub-88 mph hitters gain almost nothing above ~12° (proven).
- **Smash factor / squared-up rate is the fastest-stabilizing hit-tool metric.** Driveline's SF = 1 + (EV − bat speed)/(pitch speed + bat speed) hits reliability (Cronbach's α > 0.7) in ~20 balls in play — versus hundreds of PA for K% or BABIP. Statcast's version: contact ≥80% of max theoretical EV is "squared up"; squared-up swings hit .372/.659 SLG vs .127/.144 for everything else (proven).
- **MLB bat-tracking baselines (2024–25):** average bat speed 72 mph ("fast" = 75+, ~23% of swings), average swing length 7.3 ft, blasts (squared-up% ×100 + bat speed ≥ 164) ≈ 7% of swings; 2025 added attack angle (MLB avg ~10°, ideal 5–20°), swing-path tilt (avg ~32°, range 23–46°), and attack direction (avg ~2° pull side) (proven).
- **Device choice is a bias trade, not just an accuracy trade.** HitTrax (≈$8k–$19k unit, ~$30k installed): ±1 mph EV, ±1° LA claimed, but no ball spin — carry distances are modeled, not measured. Rapsodo PRO 2.0 ($3,500 + membership): dual camera + radar, measures batted-ball spin, 20-ft setup, ~40 mph minimum EV threshold. TrackMan (B1 portable ~$14k street; full units $20k+ plus ~$1k+/yr software) is the pro-data gold standard and the only one whose numbers map 1:1 to Statcast/college TrackMan reports (promising — vendor-claimed accuracies, thin independent validation).
- **Benchmarks: expect ~+20 mph of peak EV from age 14→18.** Eisenmann's TrackMan scouting-population percentiles: age 14 median ~70 mph, age 18 median ~94 mph (90th %ile ~103). Cage-tee "elite" lines: 70+ (11–12u), 80+ (13–14), 90+ (15–16), 95–100+ (17–18), 100–105+ college, 105+ MLB-caliber. D1 recruiters generally want 90+ from HS seniors (promising — population-dependent).
- **Ball-flight-driven swing changes work, but only for the right hitter.** Success cases (Yelich/Alonso-type hard-ground-ball hitters adding lift) are real, but the fly-ball revolution "hurt as many as it helped" — e.g., Kiké Hernández +11.7 pp FB% and −89 pts wOBA. Gate launch-angle interventions on EV first (promising).
- **Physical drivers of EV are trainable and measurable:** rotational med-ball throw velocity r = 0.53 with batted-ball velo (D3 college), lean body mass r = 0.54, trap-bar deadlift r = 0.43 (D2). Driveline over/underload bat programs (±20% implements) report ~5–6 mph peak EV gains in 8-week college blocks (promising).

## 1. The Physics: What Actually Sets Exit Velocity and Launch Angle

The bat–ball collision is nearly solved physics thanks to Alan Nathan (Univ. of Illinois, AJP 2000/2003 and baseball.physics.illinois.edu). The core model (proven):

**EV ≈ q · v_pitch + (1 + q) · v_bat**

where q is the collision efficiency ("apparent COR" folded with bat inertia at the impact point). For a wood bat struck on the sweet spot, q ≈ 0.2; BBCOR bats ≈ 0.23; hot composites ≈ 0.27+. Consequences:

- **+1 mph bat speed → ~+1.2 mph EV**; +1 mph pitch speed → only ~+0.2 mph EV. Bat speed is ~6x as valuable as incoming velocity, which is why cage EV off a tee or machine is a legitimate proxy for game power ceilings (proven).
- ~1.2 mph of EV ≈ **4–7 ft of carry** on a well-struck ball — the difference between warning-track outs and homers compounds fast (proven).
- The **sweet spot is a vibration node region 4–6 in from the barrel end**; impacts there minimize energy lost to bat vibration and maximize q. Off-node contact costs EV even at identical bat speed (proven).
- **Launch angle is set primarily by the centerline (offset) angle** — where on the ball the bat's sweet spot passes — **and secondarily by attack angle** (the bat head's vertical direction at contact). EV is maximized and batted-ball spin minimized when attack angle equals the centerline angle ("squared up" in the physics sense) (proven).
- Batted-ball **backspin adds carry with diminishing returns**: max fly-ball distance clusters around 2,000–2,500 rpm backspin; ~100 mph EV + ~2,200 rpm + high-20s° LA carries 400+ ft. Excess spin (glancing undercut) trades EV for spin and loses distance (proven for the physics; the 2,000–2,500 rpm "optimal window" is promising as a coaching target).

**For Soto:** this is the equation stack behind any Triton "expected EV" or squared-up implementation on `compete_pitches` TrackMan data: max theoretical EV per swing = q·pitch_speed + (1+q)·bat_speed, and contact quality = actual/max. It's also why Neptune should anchor hitter assessment on bat speed + contact efficiency, not raw EV alone — raw EV conflates the two.

## 2. The Value Surface: EV × LA, Barrels, and Why Optimal Launch Angle Is Personal

Statcast-era outcome mapping (all proven, large-sample MLB data):

- **Hard-hit** = 95+ mph EV. MLB average EV on all contact ≈ 88–89 mph; top-10% hitters average 93–95.
- **Sweet spot** = 8–32° LA: .592 AVG / 1.101 SLG / .699 wOBA on those batted balls.
- **Barrel** = EV ≥ 98 mph with an LA window that starts at 26–30° and widens ~2–3° per mph, reaching 8–50° at 116 mph. Barrels: .742 AVG / 2.493 SLG / 1.291 wOBA (2023). League barrel rate ~5% of batted balls; 15%+ barrel rate is elite. Barrel rate is the most predictive public power metric year over year.
- **Line drives (10–25°)**: .678 AVG / .937 SLG (2023). The wOBA-by-LA curve is bimodal: a peak near ~12° (line drives) and a second near ~24–28° (HR-range flies) for hitters with the EV to clear fences, with a valley between and a cliff above ~35°.

The critical nuance — **optimal LA scales with EV** (proven, multiple independent analyses):

- FanGraphs Community analysis (Statcast 2015–17, 500+ AB hitters): hitters ≥88 mph avg EV who ran ~14.2° average LA posted .402 wOBA; their low-LA (<9°) counterparts .328. Below 88 mph, wOBA was nearly flat across LA — best group ~11.8°, .351 wOBA, and pushing above 15° actually dropped soft hitters to ~.314.
- The "ideal power profile" (90+ mph EV at 25–35°) slugs .850+; the same angles at 80 mph are cans of corn. HR/FB for 25°+ LA hitters averaged ~20% in 2023 — but only because that population self-selects for power.

**Rule of thumb Soto should encode:** lift is a multiplier on EV, not a substitute for it. A hitter earns the right to a steeper attack profile with bat speed. Driveline's operational version: attack angle 5–15° when peak EV < 105 mph, 10–20° above 105 (promising — practitioner heuristic consistent with the MLB outcome data).

**For Soto:** Triton already stores EV/LA for 7.4M Statcast rows. A hitter-side "Damage+"-style metric should be a 2D EV×LA lookup (wOBAcon by bucket) rather than separate hard-hit% and sweet-spot% columns — the interaction carries the signal. For Neptune athletes, compute a *personal* optimal-LA band from their top-8 EV rather than preaching 25°.

## 3. Smash Factor, Squared-Up Rate, and Collision Efficiency — Contact Quality Per Swing

The problem with EV and LA alone: they grade outcomes, not the swing. Contact-quality metrics normalize for bat speed and pitch speed.

- **Driveline Smash Factor** (Kyle Lindley et al., Feb 2021): SF = 1 + (EV − bat speed)/(pitch speed + bat speed) — an empirical estimate of collision efficiency per batted ball. Key property: **reliability (Cronbach's α > 0.7) in ~20 balls in play**, versus tens-to-hundreds of PA for K%, BABIP, or contact rates (promising — in-gym Driveline dataset, not peer-reviewed). Driveline scores whiffs and fouls as SF = 0, turning it into a per-swing hit-tool metric ("Big 3" assessment: bat speed, swing decisions, smash factor).
- **Patrick Brennan's public-data version** (2021): reverse-engineered bat speed and collision efficiency from Statcast using Nathan's formula. Estimated bat-speed leaders: Stanton 88.4 mph (2015), Seager 86.0, Gallo 85.0. Whiff-inclusive smash-factor leaders were pure contact hitters (Revere 0.642, Simmons 0.605, Fletcher 0.584). Year-over-year r² ≈ 0.7 — it's a skill, not noise (promising).
- **Statcast squared-up rate** (public since 2024, real measured bat speed): a ball is "squared up" if actual EV ≥ 80% of the max theoretical EV given that swing's bat speed and pitch speed. Squared-up contact: .372 AVG / .659 SLG / .439 wOBA; everything else .127 / .144 / .125 (proven).
- **Blast** = squared-up%·100 + bat speed ≥ 164 (e.g., 80 mph bat speed with 90% squared-up = 170 → blast). ~7% of MLB swings. This is the cleanest single-number fusion of "swings hard AND finds the barrel" (proven as a descriptive metric).

**For Soto:** TrackMan CSVs in `compete_pitches` won't have bat speed unless paired with a Blast sensor, but Statcast-style squared-up needs it. Two paths: (a) pair Blast Motion exports with TrackMan sessions by timestamp (standard practice per Bornstein's paired-analysis workflow), or (b) Brennan-style estimated collision efficiency from each athlete's 8th/92nd-percentile EVs. The 20-BIP stabilization number is the design constraint: one Neptune assessment session (25–40 swings) is enough for a stable smash-factor read — that's the metric to trend week-over-week, not raw average EV.

## 4. The Bat-Tracking Era: 2024–2026 Baselines

Statcast bat tracking (Hawk-Eye, measured at the sweet spot 6 in from the bat head) went public May 13, 2024, with data from April 3, 2024 (partial data from late 2023). League baselines (proven):

- **Bat speed:** avg 72 mph; "fast swing" = 75+ (~23% of swings). Range: Stanton ~81 mph avg (fastest) to Arraez ~62 (slowest).
- **Swing length:** avg 7.3 ft (bat-head distance traveled to contact). Short swings hit for average (.258 AVG/.268 wOBA on shorter vs .235/.282 on longer — length trades contact for damage).
- **April 2025 additions:** **attack angle** (bat-head vertical direction at contact; MLB avg ~10°), **ideal attack angle rate** (share of competitive swings with attack angle 5–20° — the range matching typical pitch descent planes of −4 to −21°), **swing-path tilt** (plane of the final 40 ms of swing vs ground; avg ~32°, player range ~23–46°), and **attack direction** (horizontal; avg ~2° to pull side). Attack angle is substantially a *timing* metric — the same swing produces a higher attack angle on contact out front, lower when deep.
- Driveline's pre-Statcast sensor heuristics agree: pro hitters live at +4 to +21° attack angle to mirror pitch planes; being on plane widens the timing margin for solid contact and improves energy transfer (promising).

**For Soto:** these are the columns worth adding to any Triton hitter dashboard as they populate in the Statcast feed (bat_speed, swing_length, squared_up, blast, attack_angle, swing_path_tilt, attack_direction). League-average anchors for `league_averages`: 72 mph bat speed, 7.3 ft swing length, ~10° attack angle, blast ~7% of swings. Note the plus-stat exclusion convention doesn't apply — these are raw metrics.

## 5. HitTrax vs TrackMan vs Rapsodo (and Blast): What Each Measures and What It Gets Wrong

No rigorous peer-reviewed three-way validation exists for hitting mode (the published validation work skews to pitch tracking); everything below is vendor spec + practitioner testing (promising at best — treat cross-device comparisons with care).

**HitTrax** (InMotion Systems)
- 3-camera stereo vision, cage-installed (side or overhead mount). Unit ≈ $8k–$19k depending on model; ~$20k typical quote plus subscription; up to ~$30k fully installed.
- Claimed accuracy: ±1 mph RMS (pitch and exit velo), ±1° RMS launch angles; distances within ~5% of tape-measured in independent hobbyist testing (TechGraphs-era).
- **Does not measure ball spin.** All distance/HR outcomes are *modeled* from EV+LA, so it systematically misreads carry on high-spin or knuckling contact; practitioner consensus is it flatters well-struck balls at the top end. Its killer features are engagement: spray charts, point-of-impact, simulated games/leagues — the retail-facility standard.
- **Rapsodo (Hitting 2.0 / PRO 2.0)**
- PRO 2.0: $3,500 + membership tiers; dual camera + dual radar; sits 20 ft from the plate on the ground; ~15 lb portable. Tracks 20+ metrics both directions (pitching + hitting).
- Differentiator: **measures batted-ball spin rate and spin direction** via slo-mo camera — the only affordable way to coach the backspin/carry relationship directly. Limitation: ~40 mph minimum EV threshold (misses some mishits), no spray-chart game simulation.
- **TrackMan** (B1 portable / cage-mount units)
- Doppler radar with optical enhancement (OERT). B1 street price ≈ $14k (list unpublished; full stadium/cage units $20k+ with ~$1,100+/yr software subscription).
- The gold standard because it's the *same measurement family* as MLB/MiLB/college data: EV, LA, spray, batted-ball spin, plus full pitch tracking. Facility TrackMan numbers are directly comparable to scouting-report numbers — no cross-device translation error.
- **Blast Motion** (bat sensor, ~$150): bat speed, attack angle, on-plane efficiency, time to contact, rotational scores. Not a ball-flight device — it's the missing bat-side half. Pairing Blast + a ball-flight device by timestamp is the standard "poor man's Statcast" workflow and enables true squared-up/smash-factor computation.

Cross-device rules of thumb (promising, practitioner-sourced): don't mix devices within a longitudinal athlete trend; tee/machine cage EVs run ~5–10 mph above live game EVs, so benchmark tables must state the protocol; camera systems degrade on extreme mishits and high balls, radar degrades on very short cage flights.

**For Soto:** Neptune already has TrackMan via the Compete pipeline — that's the right spine (Statcast-comparable, spin-measured). The decision is whether to add HitTrax for the retail/engagement layer (youth leagues, gamified cages, spray charts sell memberships) and Blast sensors (~$150/athlete) for the bat-side metrics that TrackMan alone can't give. Rapsodo PRO 2.0 at $3,500 is the budget alternative only if TrackMan units can't cover every cage. Schema note: keep a `device` column on any hitting table and never blend devices in one athlete trend line.

## 6. Benchmarks by Age and Level

**Peak exit velocity (cage/tee max unless noted):**

| Level | Average | Good | Elite (top ~10%) |
|---|---|---|---|
| 8–10u | 40–55 mph | 50–60 | 60+ |
| 11–12u | 50–65 | 60–70 | 70+ |
| 13–14 | 60–75 | 70–80 | 80+ |
| HS 15–16 | 70–85 | 80–90 | 90+ |
| HS 17–18 | 75–90 | 85–95 | 95–100+ |
| College | 87–95 | 92–100 | 100–105+ |
| MLB | 88–92 (game avg all contact) | 92–102 | 105+ max EV |

(BatDigest, 50,000+ swings over 7 years on HitTrax/Rapsodo, full-spectrum population; promising.)

**Game-population percentiles, TrackMan BP, college-bound/travel population** (Eisenmann, PhD — skews high vs general population; promising):

| Age | P25 | P50 | P75 | P90 |
|---|---|---|---|---|
| 14 | 64 | 70 | 76 | 82 |
| 16 | ~76 | ~82 | ~88 | ~94 |
| 18 | ~88 | ~94 | ~97 | ~103 |

Expect **~+20 mph peak EV from 14→18** for an athlete holding percentile, with the biggest single-year jump (~6–8 mph) from 14→15 (maturation). Recruiting anchors: most D1 programs want 90+ mph from HS hitters; elite D1 / pro-projection 95+ (promising — recruiting-market convention, not a study).

**Bat speed (Blast Motion database ranges):** youth 40–56 mph, MS 46–62, JV 53–67, HS varsity 57–71 (college-bound typically 63–70), college 61–73, MiLB 63–75, MLB 66–78 (sensor) / 72 avg (Statcast game swings). Supporting Blast metrics: on-plane efficiency target 70%+ (range 65–85%), time to contact 0.13–0.17 s pro vs 0.17–0.23 s youth, peak hand speed 23–29 mph pro (promising — proprietary database, sensor bat speeds read higher than Statcast's 6-in-from-tip convention).

Protocol caveats (important): tee max ≠ live game — game EVs run 5–10 mph lower; ball type, bat (BBCOR q≈0.23 vs wood q≈0.20 ≈ 2–3 mph EV difference), and device all shift numbers. A benchmark without its protocol is noise (proven in principle, magnitudes promising).

**For Soto:** Neptune intake should fix one protocol forever: same device (TrackMan), same ball, stated bat, ~25–40 swing session, report peak EV, avg of top-8 EV (Driveline convention — robust to mishits), LA of top-8, and smash factor. Store percentile-vs-age from the tables above in Triton so athlete dashboards show "82 mph at 15 = ~75th percentile of college-bound population," with the population caveat printed on the card.

## 7. Using Ball Flight to Drive Swing Changes

The decision framework, in order (practitioner consensus, consistent with outcome data):

1. **Diagnose which lever is weak.** Driveline's KPI triage: (a) bat speed low for level → over/underload speed block; (b) top-8 EV more than ~10% below peak EV → contact-quality block (contact point, barrel accuracy), because the gap means mishits, not weakness; (c) LA of top-8 hardest balls outside ~4–20° → ball-flight/attack-angle block (promising — Driveline internal data; their 2019 finding that bat speed explains wOBAcon better than EV metrics is notable).
2. **Match attack angle to pitch plane, gated by EV.** Pitches descend at −4 to −21°; ideal attack angle 5–20° (Statcast's "ideal attack angle rate"); prescribe the lower half (5–15°) below ~105 mph peak EV, upper half (10–20°) above (promising).
3. **Use constraint drills with intrinsic ball-flight feedback**, not verbal cues: plyo/heavy balls that "go nowhere" unless struck on plane, LA-window games (e.g., points only for 95+ mph in 10–30°), machine velocity to stress timing. Driveline case results: one athlete +2.7 mph bat speed, +11.9 mph peak EV, +5.2 mph avg EV, +10.9° LA on hard-hit balls over a training block; college hitters average ~+6 mph peak EV in 8-week in-gym blocks; Axe/Driveline speed-trainer programs (±20% overload/underload) claim ~5+ mph EV gains on average for HS/college/pro users (promising — in-house data, no control groups).
4. **Know the base-rate risk.** The fly-ball revolution cut both ways: FiveThirtyEight found roughly as many hitters declined as improved after raising launch angle; Kiké Hernández raised FB% 11.7 points and lost 89 points of wOBA, while hard-ground-ball hitters like Yelich, Alonso, and Lowrie boomed. MLB's own HR committee attributed ~40% of the 2015–17 HR spike to changed launch conditions (swings), ~60% to the ball. The screen for a lift candidate: **already hits the ball hard (EV comfortably above level average) with a ground-ball-heavy distribution.** Lifting a soft hitter converts singles into outs (promising, strong observational support).
5. **Train the engine too.** EV correlates with rotational med-ball throw velocity (r = 0.53, D3 college, PubMed 34570055), lean body mass (r = 0.54) and trap-bar deadlift (r = 0.43) in D2 players; in adolescents, chest pass, body mass, and lateral-to-medial jump each independently predict EV. Grip/forearm work does *not* add bat speed (promising for the correlations; debunked for grip work as an EV intervention). A hitter capped by physicality needs the weight room, not a swing change.

**For Soto:** this is the Neptune programming spine — assessment (Section 6 protocol + Blast) → triage (speed / contact / ball-flight / strength bucket) → 6–8 week block → re-test, with smash factor (20-BIP stabilization) and top-8 EV as the progress metrics in Triton. For Trevor personally: as a pitcher-turned-content-athlete, the smash-factor framing is the honest one for on-camera hitting content — bat speed is the slow-to-change engine; contact efficiency is the trainable skill that moves in weeks.

## Sources

1. Alan Nathan — Optimizing the Swing / Physics of Baseball: https://baseball.physics.illinois.edu/swing.html
2. Nathan, "Dynamics of the baseball–bat collision," Am. J. Phys. (2000): https://baseball.physics.illinois.edu/AJP-Nov2000.pdf
3. Nathan, "Characterizing the performance of baseball bats," Am. J. Phys. (2003): https://baseball.physics.illinois.edu/AJP-Feb2003.pdf
4. Driveline Baseball — Smash Factor: A Data-Driven Approach to Assessing the Hit Tool (2021): https://www.drivelinebaseball.com/2021/02/smash-factor-a-data-driven-approach-to-assessing-the-hit-tool/
5. Driveline Baseball — Hitting KPIs (2019): https://www.drivelinebaseball.com/2019/12/driveline-hitting-kpis/
6. Driveline Baseball — Using Swing Plane to Coach Hitters (2018): https://www.drivelinebaseball.com/2018/05/using-swing-plane-coach-hitters-deeper-look/
7. Driveline Baseball — Complete Guide to Bat Speed Trainers (2025): https://www.drivelinebaseball.com/2025/02/the-complete-guide-to-driveline-bat-speed-trainers/
8. Driveline Baseball — How to Increase Your Exit Velocity (2021): https://www.drivelinebaseball.com/2021/05/increase-your-exit-velocity-hit-the-ball-harder/
9. Patrick Brennan — Remeasuring the Hit Tool: Estimated Bat Speed, Collision Efficiency, Smash Factor (2021): https://patrickbrennan33.wordpress.com/2021/02/11/remeasuring-the-hit-tool-a-look-at-estimated-bat-speed-collision-efficiency-and-smash-factor/
10. MLB.com — Everything to know about Statcast bat tracking (2024): https://www.mlb.com/news/what-you-need-to-know-about-statcast-bat-tracking
11. MLB.com — New Statcast swing metrics: swing path, attack angle, attack direction (2025): https://www.mlb.com/news/new-statcast-swing-metrics-2025
12. MLB Glossary — Barrel: https://www.mlb.com/glossary/statcast/barrel
13. MLB Glossary — Sweet Spot: https://www.mlb.com/glossary/statcast/sweet-spot
14. MLB Glossary — Bat Tracking: Blasts: https://www.mlb.com/glossary/statcast/bat-tracking-blasts
15. Baseball Savant — Bat Tracking Leaderboard: https://baseballsavant.mlb.com/leaderboard/bat-tracking
16. FanGraphs Community — How Important Is Exit Velocity for the Optimum Launch Angle?: https://community.fangraphs.com/how-important-is-exit-velocity-for-the-optimum-launch-angle/
17. FanGraphs — Test Driving Statcast's Newest Bat Tracking Metrics (2025): https://blogs.fangraphs.com/test-driving-statcasts-newest-bat-tracking-metrics/
18. FiveThirtyEight — The Fly Ball Revolution Is Hurting As Many Batters As It's Helped: https://fivethirtyeight.com/features/the-fly-ball-revolution-is-hurting-as-many-batters-as-its-helped/
19. Joe Eisenmann, PhD — Exit Velocity Benchmarks for 14–18 Year Old Competitive Hitters: https://joeeisenmann.substack.com/p/exit-velocity-benchmarks-for-14-18
20. BatDigest — Exit Velocity by Age: Real Benchmarks from 50K+ Swings: https://batdigest.com/resources/exit-velocity-by-age/
21. Blast Motion — What Is Bat Speed in Baseball? Age Benchmarks: https://blastmotion.com/blog/what-is-bat-speed-in-baseball/
22. PubMed 34570055 — Rotational Medicine Ball Throw Velocity Relates to D3 College Bat Swing, Batted Ball, and Pitching Velocity: https://pubmed.ncbi.nlm.nih.gov/34570055/
23. Rapsodo — PRO 2.0 Ball Flight Monitor (specs/pricing) and Power Matrix blog: https://rapsodo.com/products/pro-2-ball-flight-monitor / https://rapsodo.com/blogs/baseball/master-the-power-matrix-optimizing-exit-velocity-launch-angle-and-spin-for-maximum-performance
24. HitTrax product/accuracy roundups (InningAce FAQ; TechGraphs-era accuracy testing summaries): https://inningace.com/faqs/baseball/hittrax/ ; https://www.hittrax.com/products/hittrax-pro/
