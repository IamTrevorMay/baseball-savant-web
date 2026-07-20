---
title: Facility Athlete Analytics — Metrics That Drive Training, Not Just Rank
domain: algorithm-design
tags:
  - facility-analytics
  - trackman
  - progress-tracking
  - smallest-worthwhile-change
  - athlete-reports
  - gamification
  - workload-monitoring
  - driveline-tread
sources_reviewed: 22
last_updated: 2026-07-19
---

# Facility Athlete Analytics — Metrics That Drive Training, Not Just Rank

## TL;DR

- **The single best-validated "gamification" lever in a training facility is a radar number the athlete can see.** In a 6-week RCT of 123 throwers, an experimental group that got immediate radar velocity feedback after every throw gained **8.1% ± 3.6%** on the standard ball vs **2.7% ± 2.9%** for no-feedback controls — roughly 4x the relative gain (p < 0.001) (proven). Displaying velocity IS the intervention, not just the scoreboard.
- **Velocity gains at a real facility are modest per block and slow to accrue.** Driveline's 2019–2020 cohort: median **1.0–1.5 mph per 6-week block**, but only **3.29 mph** over 200+ days across 35 long-stay athletes; **52%** gained >1 mph, **27%** held steady (±1), **21%** lost velo (promising). Design progress tracking around this reality, not around highlight-reel jumps.
- **Weighted balls work AND hurt — the tradeoff is real and quantified.** Reinold's 2018 RCT (n=38): the weighted-ball group gained ~2.2 mph and 4.3° of shoulder external rotation but suffered a **24% injury rate (elbow) vs 0% in controls** (proven). Any facility metric that rewards weighted-ball velocity must be paired with a load/ROM guardrail.
- **Small samples defeat naïve progress readouts.** Use the Smallest Worthwhile Change (SWC ≈ 0.2 × between-athlete SD) alongside the measurement's typical error (TE). If TE > SWC the metric is too noisy to trust a single retest; require change to clear **2×CV** before calling it "certainly meaningful" (proven).
- **Device choice sets your calibration error budget.** TrackMan (radar, ~$20–40k class) is the reference; Rapsodo Pro 3.0 (optical/radar, ~$4–10k) runs velocity slightly low and can miss an individual pitch by 1–2 mph (promising). MLB Statcast is Hawk-Eye — so facility Rapsodo/TrackMan numbers need an offset before comparing an athlete to a big-league Stuff+ distribution.
- **Leaderboards cut both ways.** Objective velocity boards build a competitive floor (Driveline's model), but performance-ranked leaderboards reduced intrinsic motivation and satisfaction in controlled studies (Hanus & Fox 2015) and raise social-comparison stress in youth (plausible). Rank against your own baseline by default; rank against peers only opt-in and cohort-matched.
- **Youth arm health is the non-negotiable overlay.** Pitching >100 innings/year made youth pitchers **3.5x more likely** to need surgery or retire (Fleisig 10-yr prospective, n=481, 5% cumulative injury) (proven). Pitch Smart age tables are the floor; workload monitoring is a facility feature, not an afterthought.
- **The ACWR is not an injury predictor — stop selling it as one.** Impellizzeri et al. (2020) showed acute:chronic workload ratio is as "predictive" with random chronic values as real ones; ratios distort when chronic load is low (debunked as a predictor, usable only as a descriptive load tool).

## 1. The Core Design Principle: Metrics That Change Behavior, Not Just Sort Athletes

A training facility's analytics have a fundamentally different job than a scouting platform's. Triton's Stuff+ exists to *rank* pitchers against a league; Neptune's athlete analytics exist to *change what the athlete does tomorrow*. The two goals pull metric design in opposite directions. A ranking metric wants to be stable, league-normalized, and slow-moving (so it discriminates talent). A training metric wants to be *sensitive*, *actionable*, and *tied to a lever the athlete controls* — even at the cost of stability.

The evidence that a well-chosen, visible metric directly drives adaptation is unusually strong for a training-science claim. The Frequent Knowledge of Results study (n=123, 6 weeks, twice weekly) is a clean RCT: the only difference between groups was whether the athlete saw a radar number after each throw, and that alone produced ~4x the relative velocity gain (8.1% vs 2.7% on the standard ball; 5.1% vs 2.5% on a heavy ball) (proven). This replicates the older tennis-serve and baseball radar findings that "you throw to the number you can see." The mechanism is intent-scaling: knowing the number recruits maximal effort and lets the motor system hill-climb toward it.

The design implication for Soto: **the metrics a facility surfaces most prominently should be the ones you actively want athletes to push on.** If you put spin rate on a giant wall board, athletes will (consciously or not) train toward spin — which may or may not be what you want, since spin is far less trainable than velocity and chasing it can distort a delivery. Choose your "hero metrics" as behavioral levers, not just because the sensor happens to output them.

A useful taxonomy for classifying every facility metric:

- **Drivers** — trainable, athlete-controllable, tightly coupled to outcomes. Mound velocity, throwing intent (pulldown/plyo peak velo), exit velocity, bat speed, jump height / force-plate output. These belong on wall boards and daily logs.
- **Descriptors** — characterize the athlete's stuff but change slowly and are hard to train directly. Spin rate, spin efficiency, movement profile, extension, release height. These belong in periodic reports and pitch-design sessions, not daily leaderboards.
- **Guardrails** — must stay inside a range; you never want an athlete "maxing" them. Throw counts, high-intent throw volume, arm-stress proxies, shoulder ROM, wellness/soreness. These belong in monitoring dashboards with thresholds and alerts.

**For Soto:** Triton's Compete tables already ingest TrackMan per-pitch data. When building the Neptune athlete dashboard on top of `compete_pitches`, tag every metric with one of these three roles in the schema. The UI treatment (wall board vs report vs alert) should be driven by role, not left to whoever configures the tile. This is the same discipline as the Drivers/Descriptors split you already have implicitly between Stuff+ (descriptor of a pitcher) and a velocity PR (driver for an athlete).

## 2. Progress Tracking With Small Samples: SWC, Typical Error, and Honest Deltas

The hardest statistics problem in a facility is not modeling — it's that you retest an athlete after 6 weeks with maybe 15–40 pitches per session, and you have to answer "did anything actually change?" honestly. Two concepts from sport science solve most of it.

**Smallest Worthwhile Change (SWC).** The smallest change that matters practically rather than statistically. The distribution-based default is **SWC = 0.2 × between-subject SD** (Cohen's small effect), or **0.3 × within-subject SD** in some formulations (proven, well-established framework from Will Hopkins). Example from the shuttle-test literature: population SD 0.15 s → SWC = 0.03 s. For a facility velocity metric where between-athlete SD in a cohort might be ~4 mph, the SWC is ~0.8 mph — meaning a 0.8 mph "gain" is at the floor of what's worth mentioning.

**Typical Error (TE) / Coefficient of Variation (CV).** The measurement's own noise — how much a number bounces on repeated tests with no true change. This has two parts at a facility: (a) the *device* error (a Rapsodo can miss an individual pitch by 1–2 mph), and (b) *biological* day-to-day variation (an athlete's peak velo naturally swings a couple mph on sleep, arousal, fatigue).

The decision rule that keeps you honest: **a change is trustworthy only when it exceeds both the SWC and the typical error.** ScienceForSport's three-tier target system operationalizes this:

1. **SWC level** — achievable but possibly trivial.
2. **CV level** — possibly meaningful (clears one test's noise).
3. **2×CV level** — certainly meaningful (clears noise in *both* the baseline and retest measurements) (proven).

If your device+biological CV for peak mound velocity is ~1.5%, then on an 85 mph baseline, 2×CV ≈ 2.5 mph. That is the bar for "certainly real" on a single retest. Anything smaller needs *more sessions* (trend, not single delta) to become credible — which is exactly why Driveline retests at fixed 6-week intervals and reports medians over many athletes rather than trumpeting single-session bests.

Practical small-sample tactics for the facility:

- **Prefer peak-of-N over single-throw maxes.** A single 90 mph reading is noise; the best of a 10-throw pulldown set is a far more stable ceiling estimate.
- **Report trend lines with a band, not points.** Show the athlete a rolling average with an SWC/TE-derived shaded "no-change zone." Any point inside the band is "same."
- **Aggregate across sessions before declaring gains.** Two consecutive retests both above baseline+SWC is stronger evidence than one big jump.
- **Never rank athletes on a metric whose TE exceeds its cross-athlete SWC** — the leaderboard would be sorting noise.

**For Soto:** This is directly implementable in the Compete pipeline. Store per-athlete, per-metric rolling TE (from repeated within-session throws) and cohort SD (for SWC). Then every "progress" number in the athlete dashboard gets an automatic honesty tag: *no change / possibly meaningful / certainly meaningful*. This is the athlete-analytics analogue of the qualification/regression logic you already apply to `league_averages`. It also protects Neptune's credibility with a data-literate founder — Trevor will immediately distrust a dashboard that calls a 0.6 mph wobble "progress."

## 3. TrackMan-Based Facility Metrics and MLB-Context Calibration

TrackMan Portable B1 (radar) is the facility gold standard, tracking release speed, spin rate, spin axis, release height/side, extension, vertical and horizontal release angle, vertical/horizontal break, plate location, and vertical/horizontal approach angle (VAA/HAA). It is also expensive (roughly the $20–40k class of hardware+subscription; TrackMan lists pricing only via sales). Rapsodo Pro 3.0 (~$4–10k depending on channel; ~$9,500 secondhand) is the affordable alternative and, in head-to-head tests, functions as a near-replacement with two caveats: **Rapsodo velocity reads slightly low vs TrackMan, spin reads very slightly low, and any individual pitch can be off by 1–2 mph** (promising). Rapsodo actually captures near-zero-spin pitches (splitters/knuckles) that TrackMan's radar can miss.

The calibration problem that most facilities get wrong: **MLB Statcast is Hawk-Eye (optical), not TrackMan or Rapsodo.** So when you tell a high schooler "your fastball's induced vertical break is 17 inches — that's average MLB," you are comparing a facility-radar number to an optical-camera number, with device offsets baked in on both ends. Before an athlete metric is compared to an MLB-context benchmark or fed into a facility Stuff+, you need a **device→reference offset** for at least velocity and spin.

Level benchmarks worth encoding (approximate, four-seam fastball):

| Level | Avg FB velo | Elite (top ~10%) | FB spin (50th) | Elite spin |
|---|---|---|---|---|
| 12U | ~54 mph | ~70 mph | — | — |
| 14U | ~60–70 mph | ~78–80 mph | — | — |
| 16U | ~70–80 mph | ~85–88 mph | ~1,800–2,200 | ~2,300+ |
| 18U / HS senior | ~78–81 mph | ~88–90+ mph | ~2,000–2,300 | ~2,400+ |
| NCAA D1 | ~88.9 mph (50th) | ~92.5 mph | ~2,148 | ~2,372 |
| MLB | ~94 mph | ~97+ | ~2,400 | ~2,700+ |

(Level benchmarks: promising — sources vary and age-cohort velo tables are noisy; the NCAA and MLB percentile splits are the most reliable.)

Useful derived facility metrics and their calibration notes:

- **Bauer Units = spin rate ÷ velocity.** MLB average ≈ 24.0 (2,200 rpm / 92 mph). Normalizes spin for velo so you can tell an athlete whether their spin is "good for how hard they throw." High BU → live-up-in-zone fastball; low BU → work down (promising; the pitch-usage prescription is coaching heuristic, not proven).
- **Induced Vertical Break (IVB) / spin efficiency.** Drivers of perceived "ride." Descriptors, not daily drivers — spin efficiency is trainable via grip/axis work but slowly.
- **VAA (vertical approach angle).** Increasingly used to explain why two fastballs with identical velo/IVB perform differently. Descriptor.
- **Extension.** Adds "effective velocity"; each extra ~6 inches of extension is often quoted as ~1 mph of perceived velo. A driver you can coach.

**For Soto:** You already run an in-house Z-score Stuff+ (`100 + veloZ*4.5 + moveZ*3.5 + extZ*2.0`) with per-`pitch_name`/`game_year` baselines. A **facility Stuff+** for Neptune should reuse this architecture but (1) apply a device offset so Rapsodo/TrackMan release-speed and spin map onto the same scale as the `pitch_baselines` (which are built from Statcast/Hawk-Eye), and (2) baseline against a *level-appropriate* population, not MLB — a 16U pitcher graded against MLB baselines will read as noise near zero. Store the device and level as columns so the same pitch can be graded "vs MLB" for aspiration and "vs 16U" for training feedback. Log the offset derivation in `docs/Queries.md` when you compute it.

## 4. Athlete- and Parent-Facing Report Design

Driveline's report is the reference artifact: a **six-page report** covering positional metrics, velocity metrics, sequencing, and joint kinetics (arm forces/torques), with **normative ranges** derived from their internal motion-capture database used to flag what needs to change (proven as an operational model; the specific norms are proprietary). Critically, their pipeline gets that report into the athlete's TRAQ profile **within 24 hours** of data collection, at **<90 minutes of labor per session** (down from 5+ hours in 2019). Speed and integration matter as much as content — a report that lands two weeks later doesn't change the next session.

Design principles that survive contact with actual parents and 15-year-olds:

- **Lead with one number and one action.** The athlete should learn their headline driver (peak velo, or the one mechanical fault being worked) and the single thing to do about it. Everything else is supporting detail.
- **Benchmark against the right reference, and say which.** "88 mph — 74th percentile for 16U, 12th percentile for D1." A number without a context band is meaningless to a parent and misleading to an athlete.
- **Show trajectory, not just state.** Parents pay for *change*. A trend line from intake to today, with the SWC/TE "no-change" band (Section 2), is the highest-value visual. It also honestly shows plateaus, which builds trust.
- **Separate "athlete view" from "coach view."** The athlete/parent report is 1–2 hero metrics + trend + next action. The coach view carries the full descriptor and guardrail detail (kinetics, ROM, workload). Same data, two altitudes.
- **Translate torque into English carefully — or don't show it.** Elbow varus torque is the scariest number on a biomechanics report and the most easily misread by a parent. If shown, it needs a norm band and a "this is expected for your velocity" framing, or it triggers panic and doctor-shopping.
- **Never let a report imply a diagnosis or a guarantee.** "Elevated arm stress relative to peers" is defensible; "you're going to get hurt" or "we'll add 8 mph" is not.

**For Soto:** Neptune's report generator should be a templated artifact off the Compete data — mirror the Triton reports-builder tile architecture (`components/reports/`) but with a strict two-audience split. The parent-facing PDF/scene should pull the same underlying aggregates as the coach dashboard, so numbers can never disagree between the two views. Turnaround time is a feature: automate the report so it generates from a TrackMan session upload the same day, matching Driveline's 24-hour standard on a fraction of the labor.

## 5. Leaderboards, Gamification, and the Motivation Tradeoff

Driveline runs an explicitly competitive floor: radar boards throughout the facility, an "Unlock Leaderboard" for exit-velo improvements with various implements, daily competitions, and cumulative weekly leaderboards to "fuel the training floor with energy." Their thesis: objective, measurable external goals build a culture where "the numbers won't lie" (promising as a culture-design claim). And per Section 1, the *visible radar number itself* is a proven performance lever.

But the gamification research is genuinely mixed and mostly cautionary about *ranked* leaderboards:

- Badges, leaderboards, and performance graphs **do** boost the *competence* need and perceived task meaningfulness (proven in controlled studies).
- Hanus & Fox (2015) found that adding leaderboards and points to a course **decreased** intrinsic motivation, satisfaction, and final performance (proven in that setting).
- For youth specifically, performance-focused leaderboards can **induce stress, heighten social comparison, and reduce intrinsic motivation** for those not near the top (plausible; SDT-consistent).
- The mediator is **autonomy**: rewards that feel *controlling* undermine intrinsic motivation, while rewards that feel *informational* (feedback on your own competence) support it (proven, core SDT finding).

The reconciliation is a design distinction, not a yes/no on leaderboards:

- **Self-referenced boards (you vs your baseline)** are informational and near-universally motivating. "Your peak velo, last 8 weeks" with PR markers. Default this on.
- **Cohort-matched peer boards** (same age/level/strength band) are competitive but fair; Driveline pairs "athletes with similar strength levels to compete." Offer opt-in.
- **Global rank boards** (everyone, all ages) are the ones that crush the bottom 70%. Avoid, or restrict to a single facility-wide velo PR wall that celebrates *personal* records rather than ranking people.
- **Reward the process, not just the outcome.** Streaks for showing up, completing throwing programs, hitting intent targets — these support autonomy/competence without making a slow-developing 14-year-old feel like a loser next to an early-maturing peer.

**For Soto:** In the Neptune dashboard, make the *default* comparison self-referenced with an SWC band, and gate peer leaderboards behind (a) opt-in and (b) automatic cohort matching on age/level. This is also a data-integrity requirement: a leaderboard that mixes 14U and college athletes, or mixes Rapsodo and TrackMan sources without offset, is ranking noise and confounds (Sections 2–3). Tie the "energy" benefit Driveline gets to *personal-record* celebration events rather than persistent global rank.

## 6. Workload, Arm Health, and the Guardrail Layer

For a youth/HS-heavy facility (Neptune's likely core), arm-health monitoring isn't a nice-to-have — it's the liability and the differentiator. The evidence base:

- **Innings, not just pitch counts, carry the youth risk.** Fleisig's 10-year prospective study (n=481, ages 9–14 at entry) found a 5.0% cumulative rate of serious injury (surgery or throwing-related retirement), and pitchers exceeding **100 innings in a year were 3.5x more likely** to be injured (proven). Playing catcher and year-round pitching compound risk.
- **Pitch Smart is the compliance floor.** MLB/USA Baseball/ASMI age tables set max pitches per game and required rest by pitch-count band (e.g., 15–18 y/o: 1–30 pitches → 0 days rest, scaling to 76+ → 4 days; recent updates added "no pitching 3 consecutive days regardless of count" and stiffened 19–22 rest thresholds) (proven consensus guidance). A facility should track cumulative throw load against these automatically.
- **Weighted balls are the sharpest double-edged tool.** Reinold 2018 (n=38 RCT): ~2.2 mph gain and +4.3° shoulder ER, but **24% injury rate vs 0%** in controls, with injuries including a UCL tear requiring surgery and olecranon stress fractures (proven). The review literature attributes the risk to the ROM gains themselves — "78% of pitching injuries occur in athletes with higher degrees of shoulder ROM" — and to elbow torque rising dose-dependently with heavier balls (14–32 oz) (promising). Underweight balls (3–4.5 oz) reduce elbow/shoulder torque and add velo without the same injury signal (promising).
- **The ACWR is not your safety metric.** The acute:chronic workload ratio was widely adopted, then dismantled: Impellizzeri et al. (2020) showed it's as "associated with injury" using *random* chronic values as real ones, that ratios distort when chronic load is low, and that there's "no evidence supporting its use" for injury-reduction recommendations (debunked as predictor). Use it, if at all, only as a descriptive load-trend visual — never as a red/green injury light.

What a defensible guardrail layer looks like:

- **Throw-load ledger**: every throwing session (bullpen, pulldowns, plyos, catch) logged with intent level and count, rolled up weekly, checked against Pitch Smart and against the athlete's own recent baseline.
- **Ramp limits, not ratios**: cap week-over-week increases in high-intent throw volume by a fixed sensible percentage rather than trusting an ACWR number.
- **ROM + wellness as inputs**: shoulder ER/IR and a daily soreness/wellness questionnaire (TRAQ-style) as guardrail metrics that gate weighted-ball progressions — because the velocity comes from ROM gains that also carry the injury risk.
- **Age-gated tooling**: weighted-ball protocols locked for skeletally immature athletes by default; the review literature is explicit about the lack of age-specific safety data and the concern for young throwers.

**For Soto:** This is a first-class Neptune feature, not a spreadsheet afterthought. Model it in the Compete/facility schema as a per-athlete workload ledger with Pitch Smart tables encoded as reference data (like `league_averages` but for rest/count limits by age). Surface it in the *coach* view as alerts and in the *parent* view as a reassuring "on-plan / needs rest" status. Given Trevor's own history — 2017 Tommy John and a successful late-career return — the arm-care/return-to-throw monitoring arc is both a credibility asset and a personally load-bearing part of the product. Grade the ACWR honestly if anyone asks for it (debunked as predictor) rather than shipping it as a safety gauge.

## 7. Case Studies: Driveline TRAQ and Tread Athletics

**Driveline / TRAQ.** TRAQ began because paper sheets, then spreadsheets, didn't scale as the facility grew — trainers spent too long building schedules and tracking performance lacked transparency. It consolidated scheduling, workout programming (templates from *Hacking the Kinetic Chain*), wellness questionnaires, video upload, and integrations (Rapsodo, TrackMan, Blast, HitTrax, Diamond Kinetics, Pocket Radar, PitchLogic) into one athlete profile with peak-velocity graphs and tracking sheets that feed reporting. The free tier lets a facility program **up to 20 athletes for free**, which is a deliberate land-and-expand funnel (promising as a business model). The sport-science backbone: **500+ mocap sessions in a single summer**, markered + markerless capture, reports in the athlete's profile **within 24 hours** at **<90 min labor/session**. Velocity results are honest and modest: median **1.0–1.5 mph/6-week block**, **3.29 mph** for 200+ day athletes, **52% >1 mph / 27% flat / 21% lost** (promising). The lesson: the product is the *system* (schedule + data + report + integrations in one place), and the marketing is *transparent, un-hyped* results — which is exactly the register a data-literate founder trusts.

**Tread Athletics.** Founded 2013 as a blog by Ben Brewster (who took himself from 73→97 mph), grown to **50+ employees** and content followed by **750,000+** players/coaches/parents, with a "**98% of our information for free**" content-funnel strategy. Model is remote-first coaching with periodic in-house visits to Charlotte/Pineville NC. Their case studies are velocity-transformation narratives: Cole Ragans **92→101 mph** (2024 All-Star), Spencer Bivens **91→94–97** (undrafted → MLB debut at 29), plus many HS jumps (76→95 over 3 years). Their pitch-design process leans on data to build in-game-usable shapes around an athlete's anatomy (promising; testimonials are selection-biased, not controlled). The lesson for Neptune: **content is the customer-acquisition engine** — Tread and Trevre's Mayday Media map onto the same playbook, where free educational content + credible transformation stories drive paid enrollment, and the analytics product's job is to *generate* those stories (clean before/after trend charts) and *retain* athletes with visible progress.

Cross-cutting takeaways for Neptune:

- Both leaders win on **system integration + turnaround speed + honest data**, not on a single proprietary metric.
- Both use a **free tier / free content** as the top of funnel; the paid product is programming + individualized data.
- Both retain athletes with **visible personal progress**, which is why the small-sample honesty of Section 2 is a retention feature, not a compliance chore — a dashboard caught over-claiming gains erodes the trust the whole model runs on.

**For Soto:** Neptune's edge can be that the *same data layer* (Triton/Compete) that generates the athlete's progress report also generates the Mayday content asset and feeds pro-grade Stuff+/command/deception context that a commodity cage can't touch. Design the athlete report so its hero trend chart is *screenshot-ready* for content, and design the facility Stuff+ so a HS athlete can see "your slider is a 55-grade shape vs pro baselines" — aspiration that a Rapsodo-only shop can't credibly provide.

## Sources

1. Why We Created TRAQ — Driveline Baseball. https://www.drivelinebaseball.com/2018/12/why-we-created-traq/
2. TRAQ — Driveline Baseball. https://www.drivelinebaseball.com/coaches/traq/
3. A Look Under the Hood: How Driveline Sport Science Collects, Processes, and Analyzes Biomechanics Data. https://www.drivelinebaseball.com/2022/09/a-look-under-the-hood-how-driveline-sport-science-collects-processes-and-analyzes-thousands-of-athletes-biomechanics-data/
4. Pitching Training Velocity Results 2019–2020 — Driveline. https://www.drivelinebaseball.com/2021/06/pitching-training-velocity-results-2019-2020/
5. Velocity Based Training for Baseball Athletes / Unlock Leaderboard — Driveline. https://www.drivelinebaseball.com/2017/04/velocity-based-training-for-baseball-athletes/
6. Tread Athletics — Why Tread. https://treadathletics.com/why-tread/
7. Tread Athletics — homepage. https://treadathletics.com/
8. Reinold et al. (2018), Effect of a 6-Week Weighted Baseball Throwing Program... Sports Health. https://journals.sagepub.com/doi/abs/10.1177/1941738118779909
9. The Evidence Behind Weighted Ball Throwing Programs (review) — PMC. https://pmc.ncbi.nlm.nih.gov/articles/PMC7930148/
10. Frequent Immediate Knowledge of Results Enhances Throwing Velocity — PMC. https://pmc.ncbi.nlm.nih.gov/articles/PMC5384067/
11. Smallest Worthwhile Change — Science for Sport. https://www.scienceforsport.com/smallest-worthwhile-change/
12. Smallest Worthwhile Change: Interpreting Meaningful Change — Global Performance Insights. https://www.globalperformanceinsights.com/post/smallest-worthwhile-change-interpreting-meaningful-change-in-athlete-monitoring
13. Fleisig et al. (2011), Risk of Serious Injury for Young Baseball Pitchers: A 10-Year Prospective Study. https://journals.sagepub.com/doi/10.1177/0363546510384224
14. MLB Pitch Smart — Pitching Guidelines. https://www.mlb.com/pitch-smart/pitching-guidelines
15. Impellizzeri et al. (2020), Acute:Chronic Workload Ratio: Conceptual Issues and Fundamental Pitfalls — IJSPP. https://journals.humankinetics.com/view/journals/ijspp/15/6/article-p907.xml
16. Editorial: Acute:Chronic Workload Ratio: Is There Scientific Evidence? — Frontiers in Physiology. https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2021.669687/full
17. TrackMan Portable B1 — What We Track. https://www.trackman.com/baseball/Portable-B1/what-we-track
18. Trackman Numbers Explained: Pitching — Prep Baseball Report. https://www.prepbaseballreport.com/news/PBR/Trackman-Number-Explained-2649701358
19. Comparing the Rapsodo Baseball Device to Other Pitch Trackers — The Hardball Times. https://tht.fangraphs.com/comparing-the-rapsodo-baseball-device-to-other-pitch-trackers/
20. Normative In-Game Data for Collegiate Baseball Pitchers Using Markerless Tracking — PMC. https://pmc.ncbi.nlm.nih.gov/articles/PMC11544755/
21. Assessing the Accuracy of In-stadium and Portable Markerless Motion Capture — Journal of Sports Sciences (2025). https://www.tandfonline.com/doi/full/10.1080/02640414.2025.2595411
22. Going Deep: Bauer Units With Four-seam Fastballs — Pitcher List. https://pitcherlist.com/going-deep-making-good-use-of-bauer-units/
