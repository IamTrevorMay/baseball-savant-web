---
title: UCL Injury Epidemiology — The Tommy John Epidemic, 2000–2026
domain: arm-care
tags:
  - ucl
  - tommy-john
  - injury-epidemiology
  - velocity
  - workload
  - showcase-culture
  - mlb-injury-economics
  - risk-factors
sources_reviewed: 21
last_updated: 2026-07-19
---

# UCL Injury Epidemiology — The Tommy John Epidemic, 2000–2026

## TL;DR

- **The MLB prevalence has nearly doubled in a decade: the share of active big-league pitchers who have had a Tommy John (UCL) surgery rose from 27.4% (2016) to 38.8% (2024)** per Jon Roegele's Tommy John Surgery Database — roughly 2 of every 5 arms on a big-league staff carry a reconstructed ligament. (proven)
- **Raw surgery counts have quadrupled at the top and tripled below it:** MLB-level UCL reconstructions went from 21 (2010) to 46 (2024); minor-league procedures exploded from 83 (2010) to 240 (2024). Across pro baseball the number went from ~68 (2010) to 210+ (2021). (proven)
- **Velocity is the load driver everyone agrees on.** Average MLB fastball velocity climbed from 91.3 mph (2008) to 94.2 mph (2024); a 2025 case-control study of 117 surgically-treated MLB pitchers found each +1 mph carried an adjusted odds ratio of 1.20 for UCL surgery — a ~20% risk bump per tick. (proven)
- **Pitching stress sits right at the ligament's breaking point.** Peak elbow valgus torque during a pitch averages ~64 Nm (range 52–76), while cadaveric UCL failure occurs near 32 Nm — the flexor-pronator mass and bony contact shield the rest, meaning there is almost no margin and every hard throw is a micro-trauma event. (proven)
- **The disease starts as a kid.** Youth UCL surgeries roughly doubled from 2000 to 2016 (~9%/yr growth); Fleisig & Andrews' 10-year prospective study found youth pitchers throwing >100 innings/year were 3.5x more likely to need surgery or retire from arm injury. (proven)
- **Geography is destiny.** Warm-weather pitchers (states south of the 33rd parallel, year-round throwing) had UCLR rates of 0.0156 vs 0.0091 per collegiate pitcher (P = .0001); underclassmen from warm HS climates were ~1.9–2.0x more likely to blow out. (proven)
- **The bill is now over $1 billion a year.** MLB crossed $1B in injury losses in 2022 and again in 2025, with pitchers accounting for ~63% of the cost; the average throwing-injury cost per club-player is ~$10.6M in guaranteed salary. (proven)
- **The 2024 MLB pitcher injury report (200+ experts) named the culprit: max-effort pursuit of velocity and "stuff," not workload volume per se.** The injury peak has shifted from mid-season to the spring-training/Opening-Day window, implicating high-intensity offseason throwing programs. (promising)
- **Command, not chaos, marks the injured pitcher.** The same 2025 case-control study found injured MLB pitchers had *superior* strike-zone command (Location+ aOR 1.11) and better overall stuff — the pitchers getting hurt are the good ones chasing the margins. (promising)

## 1. The Shape of the Epidemic: Rates and Trends, 2000–2026

The single cleanest longitudinal series is Jon Roegele's publicly maintained Tommy John Surgery Database, the de facto reference for anyone tracking UCL reconstruction in pro baseball. Its headline metric — the percentage of MLB pitchers (those who pitched in MLB or spent a season on the MLB IL) carrying a prior TJ surgery — traces a near-monotone climb (proven):

- 2016: 27.4%
- 2017: 25.9%
- 2018: 28.5%
- 2019: 30.8%
- 2020: 32.0%
- 2021: 32.0%
- 2022: 34.4%
- 2023: 35.7%
- 2024: 38.8%

That is a ~29% relative rise in prevalence across eight seasons. It reflects two compounding forces: more pitchers getting cut, and reconstructed pitchers surviving and returning (return-to-sport rates are ~89%, return-to-same-level ~78%), so the prevalence pool keeps filling.

Raw annual incidence tells the same story more starkly. Per the 2024 MLB report and corroborating databases (proven):

- **MLB-level UCL reconstructions:** 21 (2010) → 46 (2024) — a 2.2x increase.
- **Minor-league UCL reconstructions:** 83 (2010) → 240 (2024) — a 2.9x increase, and the more alarming curve because it captures younger, developing arms.
- **All pro baseball:** ~68 surgeries (2010) → 210+ (2021), with a notable post-pandemic spike in 2021 that experts partly attribute to the disrupted 2020 workload ramp.

The 2021 post-COVID spike is instructive: a lost/compressed 2020 season followed by a normal-volume 2021 produced a workload discontinuity — exactly the acute-to-chronic mismatch the sports-science literature predicts (see §5).

The epidemiological backbone under these counts: a landmark registry study identified 1,429 UCL reconstructions between 1974 and 2016, documenting a statistically significant rising annual rate of both primary and revision procedures — the trend long predates the current alarm.

**For Soto:** Triton has a 7.4M-pitch Statcast spine (2015–2026) plus `milb_pitches` (AAA, 2023+). We can reconstruct a Roegele-style prevalence panel *internally* by joining pitcher IL/status data to our roster and season tables, then correlate against our own Stuff+/velocity distributions per season. A "TJ prevalence vs. staff Stuff+" chart in the pitching dashboard would be a differentiated Triton view.

## 2. The Biomechanical Floor: Why the Ligament Is Always on the Brink

Any epidemiology of the UCL has to start with the fact that a maximal-effort pitch loads the ligament to near its failure point every single throw (proven). The canonical Fleisig/Andrews/ASMI number for peak elbow valgus (varus) torque during the arm-cocking-to-acceleration phase is ~64 Nm, with a normal range of 52–76 Nm across elite adult pitchers. Driveline's PULSE-sensor field data (validated at ICC 0.99 for torque) on 19 pitchers found a mean stress of 61 ± 15.7 Nm across fastballs, individual pitches ranging 30–90 Nm, with peak arm-cocked varus torque reported as high as ~99 Nm — the equivalent of momentarily holding ~55 lb in the hand.

The problem: cadaveric UCL failure load is far lower. Reported ultimate-failure torque ranges from 17.1–22.7 Nm (elderly cadavers) up to 34 Nm (younger, mean age 43), with a frequently-cited failure figure of ~32.1 ± 9.6 Nm. The "load paradox" of the literature: measured valgus torque at the joint (~64 Nm) exceeds the isolated ligament's failure torque (~32 Nm) by roughly 2x (plausible — the in-vitro vs. in-vivo comparison is imperfect). The reconciliation is that the UCL never carries the full load alone: the flexor-pronator muscle mass, the bony articulation, and the joint capsule share and shield it. This is why forearm/flexor strength and mechanics matter as much as raw velocity — the "stress-shielding" of the UCL by the medial musculature is an active, trainable buffer (promising).

The practical upshot: the UCL operates with essentially zero safety margin at max effort. Every high-intent throw is a fatigue-loading cycle on a structure already near its limit, and the injury is fundamentally cumulative micro-trauma, not (usually) a single catastrophic event. This reframes prevention from "avoid the one bad pitch" to "manage total loading dose over months and years."

**For Soto:** Triton's Stuff+ model (`100 + veloZ*4.5 + moveZ*3.5 + extZ*2.0`) already weights velocity heaviest — the same variable that drives valgus torque. A Neptune-facing "loading proxy" could combine velocity + intent + volume rather than pretending Stuff+ is an injury metric. Do NOT let Stuff+ be read as a safety score; it is, if anything, a *risk* score.

## 3. Velocity: The Culprit Everyone Agrees On (With Caveats)

The 2024 MLB pitcher injury report — built on interviews with 200+ experts (former MLB pitchers, orthopedic surgeons, biomechanists, pitching coaches, ATs, agents, front-office and amateur stakeholders) — reached a broad consensus that the pursuit of max-effort velocity and "stuff" is the primary engine of the injury increase (promising; expert-consensus, not RCT). The supporting data:

- **League fastball velocity: 91.3 mph (2008) → 94.2 mph (2024)** — a +2.9 mph shift in the population mean, which drags the whole distribution's torque up.
- **Fastball usage fell from ~60% (2008) to 45–50% (2024)**, replaced by higher-spin, higher-effort breaking balls — meaning the *average* pitch got nastier and more stressful, not just the fastball.
- Perfect Game National Showcase data: the count of amateurs throwing 95+ mph rose "dramatically" over the last decade — the velocity arms race is now seeded before pro ball.

Direct injury-velocity links from the peer-reviewed literature (proven):

- A retrospective analysis found **20% of pitchers whose peak velocity exceeded 95.7 mph required UCLR, vs. only 7% of pitchers peaking under 86.9 mph** — roughly a 3x relative risk across the velocity spectrum.
- The 2025 case-control study (117 surgically-treated MLB pitchers vs. 234 matched controls, 2018–2023) found velocity's adjusted odds ratio at **1.20 per +1 mph** (95% CI 1.01–1.42).

The important caveat that keeps this at (promising) rather than (proven) for causation: Driveline's PULSE data found the correlation between pitch velocity and per-pitch elbow stress was only **R² = 0.29** (0.32 with outliers removed) — velocity explains under a third of the variance in individual-pitch stress. Mechanics, forearm strength, and timing explain the rest. Two pitchers at 95 mph can carry very different elbow loads. So velocity is a population-level driver and an individual-level risk factor, but it is not deterministic; it is a probability shifter layered on top of mechanics and tissue capacity.

**For Soto:** This is the crux of Neptune's positioning. The facility cannot ethically sell "throw harder" without "and here is how we manage the load you just added." Every velo gain should be paired with a documented workload plan and a mechanics/forearm-strength buffer. Trevor lived this — velocity chase, then TJ in 2017 — and that first-person credibility is the marketing wedge for a "velo-with-durability" program.

## 4. The Command Paradox: The Good Pitchers Are the Ones Getting Hurt

The most counterintuitive finding of the 2025 case-control study (proven, within its case-control design): the MLB pitchers who underwent UCL surgery were *better* pitchers than their matched controls.

- **Location+ (strike-zone command): aOR 1.11** — superior command was associated with *higher* surgery risk.
- **Pitching+ (overall ability): significantly higher in the surgery group.**
- **fWAR: 0.97 ± 1.38 (injured) vs 0.67 ± 1.05 (controls), P = .04.**
- **xFIP: 4.11 ± 0.88 (injured) vs 4.49 ± 1.13 (controls), P < .01** — injured pitchers had better expected run prevention.
- **Fastball usage: aOR 0.07** — throwing *fewer* fastballs (i.e., more breaking balls) was associated with higher risk.

Equally important, the metrics that were NOT associated with surgery: spin rate, active spin, spin axis, release points, approach angles, release extension, pitch movement, and even pitch count. This is a direct empirical rebuke to the popular "high spin rate causes injury" narrative (debunked, at least as an independent factor in this dataset) — spin per se did not separate the injured from the healthy; velocity, command, and pitch mix did.

The interpretation: the modern winning formula — throw hard, command it, lean on nasty breaking stuff — is precisely the recipe that stresses the ligament. Selection compounds it: the pitchers good enough to pitch high-leverage MLB innings are, by definition, the ones executing that formula most aggressively. The epidemic is partly a survivorship-and-optimization story: the sport optimized for exactly the traits that break the elbow.

**For Soto:** This maps *directly* onto Triton's model suite — Stuff+, `pitcher_season_command`, and `pitcher_season_deception`. There is a real analytics product here: an internal "risk-adjacent performance" flag that surfaces pitchers whose Stuff+/Location+ profile matches the injured-cohort signature (high velo, high command, low fastball usage). Frame it as monitoring, not prediction — the base rates are too low for confident individual prediction, but cohort-level flags are defensible.

## 5. Workload: Volume, Spikes, and the Acute:Chronic Ratio

If velocity and stuff set the per-pitch stress, workload sets the dose. The best-validated workload construct is the acute:chronic workload ratio (ACWR) — acute load (rolling ~7 days) divided by chronic load (rolling ~28 days) (promising; ACWR has been methodologically challenged in team sports, but the underlying "don't spike load" principle is robust):

- Baseball pitchers with an **ACWR ≥ 1.27 had a 14.9% higher injury probability**.
- Weekly throwing increases **under 10% produced very few injuries; increases over 20% in a week produced significantly more** — the classic "spike" mechanism, and the likely explanation for the 2021 post-COVID surgery spike.
- Crucial methodological point: in-game pitches are only ~10% (youth) to ~12% (college) of total seasonal throws. **Pitch counts massively undercount true workload** — bullpens, warmups, long-toss, and showcase throwing are the hidden majority. This is why pitch-count rules alone have failed to bend the curve.

Youth-specific dose-response (proven, from the Fleisig/Andrews 10-year prospective cohort of 481 pitchers aged 9–14):

- Pitchers throwing **>100 innings/year were 3.5x more likely** to suffer serious injury (elbow/shoulder surgery or throwing-related retirement).
- Adolescents throwing **>80 pitches per game carried ~4x the injury risk**.
- Youth throwing **>75 pitches/game or >400 pitches/season** had significantly elevated odds of shoulder/elbow pain.

The 2024 MLB report's most novel epidemiological observation: the injury peak has migrated. In-season injuries have trended *down* over the four seasons since 2021, while the peak now sits in the **Spring Training → Opening Day window (March–April)**. The suspected cause is higher-intensity offseason throwing programs (weighted balls, velocity camps, year-round bullpens) that arrive at camp already near the ceiling, plus an unclear optimal spring ramp. The load is being front-loaded into the offseason where nobody is counting it.

**For Soto:** This is Neptune's assessment→programming→monitoring spine in one paragraph. The facility should be built to capture *total* throw volume, not game pitch counts — every bullpen, every plyo throw, every long-toss session logged. TrackMan (already in Triton via `compete_pitches`) plus a throw-logging layer feeds a per-athlete ACWR dashboard. The offseason-spike finding argues for a formal winter-ramp protocol as a signature Neptune deliverable. Confirm Neptune's age bands — youth thresholds (100 IP/yr, 80 pitches/game) are hard rules; pro-offseason clients need different governance.

## 6. Geography, Showcases, and the Youth Pipeline

The epidemic is manufactured upstream of pro ball. Two structural forces:

**Warm-weather year-round throwing (proven).** The NCAA D1 study (320 pitchers with UCLR, 2015–2022, from an estimated pool of 27,959) found:

- Warm-state (south of the 33rd parallel — AL, AZ, AR, CA, FL, GA, LA, MS, NM, NC, OK, SC, TN, TX, etc.) surgery rate 0.0156/pitcher vs. cold-state 0.0091/pitcher (P = .0001).
- **Freshmen from warm states: 1.94x** more likely to need UCLR; **sophomores: 2.04x; seniors: 2.49x** (P values .003–.016).
- Warm-state pitchers blew out *earlier* — peak surgery in the sophomore year (36.1%) vs. junior year (38.9%) for cold-state pitchers.
- Underclassmen who threw in warm *high-school* climates carried ~1.4x the UCLR rate — the damage is done before college.

The mechanism is simple: warm climates enable year-round competitive throwing, eliminating the seasonal rest that lets tissue recover. This corroborates the earlier MLB-level finding that big-leaguers from warm-weather states undergo TJ at higher rates.

**Showcase culture and early specialization (promising→proven).** The 2024 MLB report's amateur survey: **48% of former pro players specialized in baseball before high school**, and specialized players reported more serious injuries — yet **64% of former players felt year-round focus was unnecessary for reaching MLB**. Showcases reward one thing — radar-gun velocity in front of scouts — incentivizing max-effort throwing on inadequate rest, at exactly the developmental window when growth plates and ligaments are most vulnerable.

**Breaking balls and mechanics (nuanced).** The curveball has historically been blamed, but the evidence is muddier than the folklore. A prospective cohort of 476 pitchers aged 9–14 found the curveball associated with a 52% increased risk of *shoulder* pain and the slider with an 86% increase in *elbow* pain — but ASMI's position is that pitch count and mechanics dominate pitch type as risk factors (plausible; the AAOS and Petty et al. still recommend deferring breaking balls until ~13–14 or skeletal maturity as a precaution). The dominant youth risk factors remain, in order: too many months pitching per year, too many innings, pitching while fatigued, and acute workload spikes.

**Pitch Smart guidelines** (MLB/USA Baseball) set daily limits — ages 7–8: 50 pitches; 9–10: 75; 11–12: 85; 13–14: 95 — with mandated rest. But compliance is dismal: >90% of teams and nearly half of all pitchers violated guidelines in tournament settings, and awareness among youth players is limited.

**For Soto:** Neptune's addressable market is heavily this youth/HS pipeline (confirm age bands). The evidence-based facility pitch is: (1) enforce a documented rest/deload calendar breaking the year-round cycle, (2) log total throws against Pitch Smart + ACWR, (3) defer breaking-ball volume for pre-pubescent arms, (4) treat showcase season as a managed peak, not a free-for-all. This is a differentiated, defensible service line that a commodity cage barn cannot offer — and it aligns with the MLB report's own recommendation for "increased rest during showcase season."

## 7. The Economics: A Billion-Dollar Injury Market

The financial stakes explain why MLB commissioned a 200-expert report at all (proven):

- MLB organizations lost **over $1 billion to injuries in 2025, with ~63.4% of that cost from pitchers**. 2022 was the first year injury losses crossed $1B.
- Approximately **$3 billion has been spent on pitching injuries over the past 20 years**, largely attributable to Tommy John surgery.
- The average throwing-injury cost to a club is **~$10.6M** in guaranteed salary paid to a non-performing player (plus the replacement cost of filling the roster spot).
- In 2019, pitchers on the IL with throwing-related injuries missed **18,369 days — roughly 102 full pitcher-seasons of lost availability**.

Because MLB contracts are guaranteed, clubs eat the salary whether the pitcher throws or not, then pay again to replace him — a double cost that makes durability an enormous latent asset. This is the economic logic behind Commissioner Manfred's proposed remedies: rather than blunt inning minimums (which he rejected as "too blunt an instrument"), the report floats **roster rules and transaction rules that incentivize deeper, more durable pitcher usage** — structurally penalizing the churn-and-burn max-effort reliever model.

**For Soto:** The economics are the reason a "durability" product has real willingness-to-pay at the pro/college level. A facility or platform that can credibly reduce a prospect's injury probability — or document a healthier development history — is selling into a market where a single avoided TJ is worth eight figures to a club and career-altering to the athlete. Carl's facility research (3–10x pricing for a dev-lab model) is validated by this cost structure.

## 8. The Surgical Landscape and the State of the Debate (2024–2026)

The treatment side has evolved even as the disease worsened. The traditional Jobe reconstruction has largely given way to (proven, per current surgical literature):

- **Internal brace repair** — when the native UCL is torn but salvageable, the surgeon repairs it and reinforces with a synthetic (suture-tape) internal brace, preserving the native ligament with a faster, less invasive recovery.
- **Hybrid / "TJ3" / "Triple Tommy John"** — reconstruction (new tendon graft) + repair + internal brace reinforcement, the most aggressive option.
- The pendulum has swung: reconstruction → brief internal-brace era → hybrid dominance → and, most recently, a swing *back* toward more internal braces and fewer hybrids as surgeons reassess.

More than 2,400 UCL procedures have now been logged on pro baseball elbows in the tracking databases.

**The state of the "epidemic" debate (2024–2026):** There is genuine consensus and genuine disagreement.

- *Consensus:* velocity and max-effort "stuff" pursuit are the proximate drivers; the problem is systemic and originates in youth/amateur ball; pitch-count rules alone have not worked because they miss total load. (promising→proven)
- *Contested:* whether velocity is *causal* or merely correlated (Driveline's R² = 0.29 stress-velocity link fuels the skeptics — Baseball America and others argue mechanics and individual tissue tolerance matter more than the gun reading); whether spin-chasing independently adds risk (the 2025 case-control study says no); and whether any intervention short of restructuring the incentives (draft, showcases, roster rules) can bend the curve. (plausible / open)
- *The uncomfortable conclusion of the Forbes analysis of the MLB report:* the problem may be structurally near-impossible to fix, because the same traits that cause injury (velocity, stuff, command at max effort) are exactly what the sport pays for. As long as the reward function selects for max effort, the injury rate is a feature of the optimization, not a bug.

**For Soto:** The honest, evidence-graded posture for both Triton and Neptune is: we cannot *predict* an individual TJ with useful accuracy (base rates too low, R² too weak), but we *can* (1) identify cohort-level risk signatures from Stuff+/Location+/velocity/pitch-mix, (2) monitor total workload and flag ACWR spikes, and (3) manage the modifiable levers — offseason ramp, rest calendar, forearm/flexor capacity, mechanics. Sell monitoring and load management, never a false "injury-proof" promise. This is the credible middle ground that respects Trevor's low tolerance for bro-science and his lived experience of the rehab arc.

## Sources

1. Roegele, J. — Tommy John Surgery Database & prevalence-by-season data (2016–2024). https://x.com/MLBPlayerAnalys/status/1845875133212512273 ; https://docs.google.com/spreadsheets/d/1gQujXQQGOVNaiuwSN680Hq-FDVsCwvN-3AazykOBON0/edit
2. Roegele, J. — "An Analysis of Available Tommy John Surgery Data," SABR / The Hardball Times. https://sabr.org/latest/roegele-an-analysis-of-available-tommy-john-surgery-data/
3. MLB — "MLB releases report on injuries to pitchers" (2024 pitcher injury report). https://www.mlb.com/news/mlb-releases-report-on-pitcher-injuries-2024
4. Brown, M. — "MLB Report Shows Systemic Issues With Pitcher Injuries That May Be Impossible To Fix," Forbes (Dec 2024). https://www.forbes.com/sites/maurybrown/2024/12/18/mlb-report-shows-systemic-issues-with-pitcher-injuries-that-may-be-impossible-to-fix/
5. US News / AP — "MLB Study: Velocity, Max Efforts Likely Causing Pitching Injuries; Rule Changes Should Be Considered" (Dec 2024). https://www.usnews.com/news/sports/articles/2024-12-17/mlb-study-velocity-max-efforts-likely-causing-pitching-injuries
6. Baseball America — "Is Velocity Really The Culprit Behind Rising Baseball Injuries?" https://www.baseballamerica.com/stories/is-velocity-really-the-culprit-behind-rising-baseball-injuries/
7. Advanced Analytic and Pitch-Tracking Metrics Associated with UCL Surgery in MLB Pitchers: A Case-Control Study, PMC11789092 (2025). https://pmc.ncbi.nlm.nih.gov/articles/PMC11789092/
8. Pitch-Specific Advanced Analytic and Pitch-Tracking Risk Factors for UCL Injuries in MLB Pitchers, PubMed 40230317. https://pubmed.ncbi.nlm.nih.gov/40230317/
9. Increased pitch velocity and workload are common risk factors for UCL injury: a systematic review, Journal of ISAKOS (2021). https://www.jisakos.com/article/S2059-7754(21)00218-2/fulltext
10. MLB pitch velocity and pitch type associated with risk of UCL injury (velocity threshold study), ScienceDirect. https://www.sciencedirect.com/science/article/abs/pii/S1058274616000239
11. Fleisig G, Andrews J, et al. — "Risk of Serious Injury for Young Baseball Pitchers: A 10-Year Prospective Study," AJSM 2011. https://journals.sagepub.com/doi/10.1177/0363546510384224 ; https://www.esaabb.org/docs/10-year-youth-pitching-study.pdf
12. Pescatore SM, DeShazo SJ, Weiss WM — "Frequency of Tommy John Surgery in NCAA Division I College Pitchers Versus Weather Conditions," OJSM 2025 / PMC11752392. https://pmc.ncbi.nlm.nih.gov/articles/PMC11752392/
13. Erickson BJ, et al. — "Is Tommy John Surgery Performed More Frequently in MLB Pitchers From Warm Weather Areas?" OJSM 2014 / PMC4555545. https://pmc.ncbi.nlm.nih.gov/articles/PMC4555545/
14. Driveline Baseball — "Elbow Stress, PULSE, and Velocity" (torque data, R²). https://www.drivelinebaseball.com/2016/10/elbow-stress-pulse-velocity/
15. "The ulnar collateral ligament loading paradox between in-vitro and in-vivo studies on baseball pitching," PMC8130712. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8130712/
16. Kinetics MP — "Acute:Chronic Workload Ratio in Baseball." https://kineticsmp.com/blog/acute-chronic-workload-ratio-baseball
17. Chronic Workload, Subjective Arm Health, and Throwing Injury in HS Baseball Players (3-yr pilot), PMC8669927. https://pmc.ncbi.nlm.nih.gov/articles/PMC8669927/
18. "Curveballs in Youth Pitchers: A Review of the Current Literature," PMC6874692. https://pmc.ncbi.nlm.nih.gov/articles/PMC6874692/
19. MLB Pitch Smart — Risk Factors & guidelines. https://www.mlb.com/pitch-smart/risk-factors
20. DVS Baseball — "The Cost of Pitching Injuries" (IL days, $ per injury). https://www.dvsbaseball.com/articles/the-cost-of-pitching-injuries
21. Baseball Action ID — "Did You Know MLB Lost $1 Billion to Injuries in 2025?" https://www.baseballactionid.com/did-you-know-mlb-lost-1-billion-to-injuries-in-2025/
