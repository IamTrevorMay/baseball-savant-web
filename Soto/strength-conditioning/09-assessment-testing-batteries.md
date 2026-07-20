---
title: Athlete Assessment & Testing Batteries for a Baseball Development Facility
domain: strength-conditioning
tags:
  - assessment
  - force-plates
  - dynamometry
  - range-of-motion
  - benchmarks
  - retest-cadence
  - reporting
  - neptune
sources_reviewed: 21
last_updated: 2026-07-19
---

# Athlete Assessment & Testing Batteries for a Baseball Development Facility

## TL;DR

- **The intake battery is the product spine, not a formality.** A defensible baseball intake stacks four layers — anthropometrics/maturation, ROM screen, force output (force plates + dynamometry), and sport output (velocity/spin, exit velo/bat speed). Driveline's own protocol runs a movement + performance screen in an athlete's first week, then **retests every 6 weeks** because "six-week blocks allow tracking of athlete progress without significantly interfering with throwing or lifting." (proven)
- **Grip strength is the single strongest field predictor of youth pitching velocity.** In 10–22 year-olds, dominant/non-dominant grip correlated with pitching velocity at τ ≈ 0.62–0.65, ahead of height (τ = 0.617) and weight (τ = 0.570); each +1 kg dominant-hand grip predicts ~+0.3 mph exit velocity in hitters. A $30 Jamar dynamometer buys most of what a $12k force plate does for a 12U. (proven)
- **The most robust injury-ROM signal is a shoulder ER *strength/motion* deficit, not GIRD.** Wilk's 296-pitcher prospective study (2005–2012, 17% shoulder-injury rate, 48-month follow-up) found pitchers with **<5° of ER surplus** were **2.2× more likely to hit the DL (95% CI 1.2–4.1)** and **4.0× more likely to need shoulder surgery (95% CI 1.5–12.6)** — while GIRD (20° threshold) and total-rotation deficit were *not* significant predictors in that cohort. (proven)
- **Force-plate peak force is bankable; rate-of-force-development is noise.** IMTP peak force shows excellent reliability (ICC 0.95, CV 2.4%); IMTP RFD windows range CV 12.9–54.6%. CMJ jump height/peak power/impulse are reliable session-to-session; RFD and strategy metrics drift. Report the reliable metrics, monitor the rest privately. (proven)
- **Anchor benchmarks to biological maturity, not chronological age.** PHV in boys occurs ~11–15 yrs; the 13U band shows the most performance scatter of any age group. A 12U throwing 55 mph is dead-median; elite top-1% is 70+. Report every youth number as a maturity-adjusted percentile or you will misclassify late bloomers as failures. (proven)
- **Test what changes the plan.** IMTP/CMJ peak force correlates only *moderately* with pitch velocity — capacity, not performance. Sport-output tests (mound velo, TrackMan, exit velo, bat speed) are the KPIs; the physical tests explain *why* and *where to intervene*. Don't sell a force number as a velo guarantee. (proven → plausible for causal framing)
- **Reliability drives retest cadence.** Metrics with CV <5% (grip, IMTP peak force, CMJ height, ROM by a fixed examiner) can flag real change on a 6-week retest; high-CV metrics (RFD, jump-strategy) need trend lines over months. Same examiner, same time of day, same warm-up, or the signal is swamped by measurement error. (proven)
- **Reporting is where the money is made or lost.** Parents don't buy z-scores; they buy a one-page traffic-light with 3 priorities, a percentile-vs-age chart, and one sentence of "here's the plan." The clinical detail lives in the athlete-and-coach layer beneath it.

---

## 1. Why a Structured Battery — and the Four-Layer Model

A "development lab" positioning (Driveline/Tread style) charges 3–10× a commodity cage barn precisely because it sells an **assessment → programming → monitoring** loop instead of reps. The intake battery is the entry point of that loop: it justifies the individualized plan, sets the baseline every future retest is measured against, and produces the athlete-facing artifact that converts a trial into a membership.

The industry consensus, echoed by ASMI, Driveline, and the IJSPT pitcher-evaluation literature, is **"Test, Don't Guess"** — but the corollary matters more: *test only what changes the plan.* A battery that produces 40 numbers nobody acts on burns staff hours and athlete goodwill. Organize the battery into four layers, ordered from cheapest/most-general to most-expensive/most-specific:

1. **Anthropometrics & maturation** — height, weight, wingspan, seated height, maturity offset (years-from-PHV). Cheap, fast, and the interpretive backbone for every youth number below. (proven)
2. **Mobility / ROM screen** — shoulder IR/ER/total rotation, hip IR/ER, ankle dorsiflexion, thoracic rotation, elbow extension. Goniometer/inclinometer, one fixed examiner. This is the injury-risk and movement-restriction layer. (proven)
3. **Force output** — grip dynamometry, shoulder IR/ER handheld dynamometry, and force-plate tests (CMJ, IMTP, SJ, repeated hop). This is the strength/power/asymmetry layer. (proven)
4. **Sport output** — mound velocity + TrackMan (spin, movement, extension), and for hitters exit velocity + bat speed (Blast/HitTrax). These are the **KPIs**; everything above explains them. (proven)

The IJSPT pitcher-evaluation framework ("There's More to Assess than the Arm," 2024) sets a clean default expectation across the ROM and strength layers: **>90% Limb Symmetry Index (LSI)** on paired measures, with deficits below that flagged for intervention. That single rule — compare the throwing side to the non-throwing side, expect ≥90% — is the most portable interpretive heuristic in the whole battery. (proven)

**For Soto:** These four layers map cleanly onto Neptune's Triton data spine. Layers 1–3 become a new `neptune_assessments` table (athlete_id, date, metric_key, value, side, examiner); layer 4 already flows through `compete_pitches` (TrackMan) and can be extended to HitTrax/Blast. Store every raw number with `examiner` and `test_date` so retest deltas can control for rater. Percentile lookups reuse the `league_averages` pattern — 50th-percentile benchmarks per (age_band, level, metric).

---

## 2. Layer 1 — Anthropometrics & Maturation

Height and weight predict youth pitching velocity almost as strongly as any strength test (height τ = 0.617, weight τ = 0.570 in the 10–22 cohort), which is exactly why raw output numbers *without maturity context* mislead. Two 13-year-olds throwing 62 mph can be a red-flag late-maturer with elite mechanics and a soon-to-plateau early-maturer coasting on size.

**Core measures:** standing height, seated (sitting) height, body mass, wingspan/arm span. From standing minus seated height plus mass, compute a **maturity offset / years-from-PHV** (Mirwald or the Khamis-Roche %-predicted-adult-height method). PHV in boys clusters at **11–15 years**; the 12-month window around PHV is flagged in the youth-injury consensus literature as the single highest-risk period for maturity-related injury, driven by temporary strength/flexibility imbalances as limbs lengthen faster than tendons and coordination adapt. (proven)

Practical consequence: **bio-band the benchmarks.** Group and interpret athletes by biological maturity, not birth year. A late-maturing pitcher sitting at the 30th velocity percentile for chronological age may be at the 70th for maturity-matched peers — a completely different conversation with the parent. The Driveline youth aging-curve work quantifies the runway: expected average fastball gains run **~5 mph/yr at 9U–11U tapering to ~3 mph/yr at 14U–16U**, with the largest jumps *post*-PHV as lean mass accrues. (promising — aging curves are population averages, individual tempo varies widely)

**For Soto:** Add `height_seated_cm`, `wingspan_cm`, and a computed `years_from_phv` to the intake schema. Every youth-facing percentile in the athlete report should carry a maturity-adjusted twin. This is also the honest antidote to the facility's biggest reputational risk — telling a late bloomer's parents he's "behind" when he's simply younger biologically.

---

## 3. Layer 2 — Range of Motion & the Injury-Risk Screen

This is the layer with the most peer-reviewed injury literature and the most folklore. Get the numbers straight.

**Shoulder rotation — the normative baseline.** Wilk's landmark ASMI measurements on 372 professional players (bubble goniometer, 90° abduction) establish the reference: throwing shoulder **129° ± 10° ER** and **61° ± 9° IR**, with the dominant arm carrying ~7° *more* ER and ~7° *less* IR than the non-dominant. That IR loss is a normal throwing adaptation (bony retroversion + posterior capsule tightening), which is why raw IR numbers alone are a poor screen. (proven)

**GIRD — real but overweighted.** Glenohumeral Internal Rotation Deficit is conventionally defined as **≥20° less IR** in the throwing vs. non-throwing shoulder. Cross-sectional work associates GIRD with roughly *doubled* shoulder-injury odds, and GIRD pitchers show measurably different mechanics — one biomech study found GIRD pitchers (IR deficit 22.1° ± 7.2° vs. 8.4° ± 4.2° in controls) hit ball release with 15° less shoulder ER (104.4° vs 119.4°) and 67% more internal-rotation torque during acceleration (32.0 vs 19.2 N·m). But the best prospective test is sobering: in Wilk's 296-pitcher 2005–2012 cohort, **GIRD at the 20° threshold was *not* a significant injury predictor**, nor was total-rotation deficit. Treat GIRD as a movement-quality flag worth addressing, not a validated injury gate. (promising for mechanics; the strong injury claim is closer to plausible/overstated)

**The signal that survived prospectively: ER deficit.** The same 296-pitcher study found the only statistically significant ROM risk factor was **insufficient external rotation** — pitchers with **<5° of ER surplus** (throwing vs. non-throwing) were **2.2× more likely to be placed on the DL for a shoulder injury (95% CI 1.2–4.1)** and **4.0× more likely to need shoulder surgery (95% CI 1.5–12.6)**. 51 of 296 (17%) sustained shoulder injuries; 20 needed surgery; mean follow-up 48.4 months. (proven)

**Total rotation & the acute-fatigue caveat.** Wilk's earlier 2011 work reported that pitchers with a **>5° total-rotational-motion (TRM = ER+IR) deficit** vs. the non-throwing side had higher injury rates, and GIRD pitchers were ~2× as likely to be injured — but *without statistical significance* (P = .17, 170 pitcher-seasons). Reinold showed a single outing acutely drops IR and cuts total rotation by ~9°, so **measure ROM rested, not post-throwing**, and re-check timing consistency across retests. (proven for the acute effect; plausible for the >5° TRM threshold)

**Beyond the shoulder — the kinetic chain matters.** The IJSPT framework and hip literature push assessment down the chain:
- **Hip IR** ~30–35° is normal; decreased hip IR correlates with hip/groin/back/abdominal injury in pro pitchers, and reduced stride-leg hip IR limits trunk rotation, shunting load to the shoulder/elbow. Every +10° of lead-hip IR is worth ~0.6 m/s ball velocity (and ~5 N·m more elbow varus). (promising)
- **Ankle dorsiflexion** deficits are "strongly correlated with shoulder and elbow injuries in youth players." (plausible)
- **Drive-leg hip abductor strength** — injured HS pitchers were significantly more likely to show reduced hip-abduction strength. (promising)
- **Excessive contralateral trunk tilt** associates with 3.2% / 4.8% increases in anterior-shoulder / medial-elbow torque respectively. (promising)

**Method discipline.** Bubble goniometer or digital inclinometer, athlete supine, scapula stabilized, **same examiner every time**. Passive ROM by a fixed rater is the reliable version; active or multi-rater ROM introduces enough error to swamp a 6-week delta. Expect **>90% LSI**; flag anything below. (proven)

**For Soto:** Encode the screen as paired left/right rows with an auto-computed `lsi_pct` and a `flag` when <90% or when ER surplus <5°. The ER-deficit rule is the single highest-value automated alert in the whole system — it's the one ROM finding with prospective surgery-risk data behind it. Surface it on the arm-care dashboard alongside workload.

---

## 4. Layer 3a — Dynamometry (Grip & Shoulder Rotators)

Handheld dynamometry (HHD) is the highest ROI hardware in the building: a Jamar grip dynamometer and a Lafayette/microFET HHD cost a few hundred dollars combined and outperform far pricier gear on the questions that matter for youth.

**Grip strength.** Strongest field predictor of youth pitching velocity (τ ≈ 0.62–0.65, ahead of height and weight) and a robust exit-velocity predictor in hitters — **+1 kg dominant-hand grip ≈ +0.3 mph peak exit velocity**, holding maturation and body mass constant. Three maximal trials per hand, best or mean-of-three, standardized elbow-at-90° seated position. It doubles as a cheap systemic-fatigue/readiness monitor (grip drops with accumulated fatigue). (proven)

**Shoulder IR/ER isometric strength.** HHD is the preferred field tool — higher intra/inter-rater reliability, lower minimal-detectable-change, and lower standard error than externally-fixed dynamometry, and it correlates well with gold-standard isokinetic testing. Test supine or seated, arm at side or in the thrower's 90/90, pad at the dorsal wrist (ER) / volar wrist (IR), three trials, ensemble-averaged. (proven)

**What the numbers mean.** The classic "optimal" ER:IR ratio for overhead athletes is **66–75%**, but healthy HS pitchers measured in the thrower's position run much higher — **~96% (dominant), 105% (non-dominant)** — because throwing builds the IR/ER decelerators asymmetrically. So interpret ratios against *baseball* norms, not general-population norms. Key prospective/longitudinal signals:
- **Pre-season ER-strength decreases** precede in-season injury *and* subsequent velocity loss in pitchers. (promising)
- In 12–15 yr-olds (n=65), higher ER strength (ρ = −0.289) and IR strength (ρ = −0.262) both associated with **less-frequent arm pain**, while the ER/IR *ratio* did not (p=0.576) — i.e., absolute strength mattered more than the ratio in youth. (promising)

**For Soto:** Grip + shoulder-rotator HHD is the minimum viable strength battery for a youth-heavy clientele and can launch before any force plate is purchased. Store both absolute values and body-mass-normalized values (N/kg), plus the ER:IR ratio, and flag ER-strength drops on retest as an arm-care alert — the pre-season-ER-loss → injury signal is directly actionable.

---

## 5. Layer 3b — Force Plates (CMJ, IMTP, SJ, Repeated Hop)

Force plates are the marquee "development lab" hardware and the layer most prone to metric overreach. The Driveline protocol on a dual ForceDecks system runs four tests:

- **Countermovement Jump (CMJ)** — lower-body explosive strength / stretch-shortening-cycle function.
- **Squat Jump (SJ)** — concentric-only explosive strength; CMJ−SJ gap indexes elastic/reactive contribution.
- **Isometric Mid-Thigh Pull (IMTP)** — maximal force capacity.
- **Repeated Hop Test** — reactive strength (fast eccentric→concentric).

**Reliability — report only what's stable.** This is the discipline that separates a credible lab from a dashboard of noise:
- **IMTP peak force**: excellent (ICC 0.95, CV 2.4%). **IMTP RFD windows**: poor-to-moderate (CV 12.9–54.6%). Report peak force; treat RFD as directional only. (proven)
- **CMJ outcome metrics** (jump height, peak power, net impulse): high within- and between-session reliability. **CMJ strategy/RFD metrics** (countermovement depth, eccentric duration, RFD): drift more; use for trend context, not pass/fail. (proven)

**Categorize CMJ metrics** into (a) **outcome** — jump height, peak power, net impulse; (b) **driver** — concentric/eccentric peak force & velocity, modified RSI; (c) **strategy** — depth, eccentric duration, contraction time. Programming logic: force-dominant athletes get ballistic/plyometric work with constrained ground-contact times; velocity-dominant athletes need maximal-strength blocks; poor eccentric braking → eccentric and landing work. CMJ metrics explain **15.8–38.9%** of hitting-performance variance in pro baseball, strongest for exit velocity — real but not deterministic. (promising)

**The honest limitation.** IMTP/CMJ peak force correlates only *moderately* with pitch velocity — these tests measure **capacity, not performance**, and a rise in IMTP peak force does not guarantee a velo bump. Sell the force plate as a diagnostic ("here's your force-velocity profile and where to train"), never as a velocity oracle. (proven)

**Reactive/asymmetry value.** Force plates uniquely quantify **inter-limb asymmetry** (single-leg CMJ, drop jumps) and eccentric braking — highly relevant to a rotational, single-leg-dominant sport. Asymmetries >10–15% are a common programming and screening flag (plausible; thresholds are heuristic, not validated injury gates).

**Hardware economics.** Dual force plates are a real capital decision. **Hawkin Dynamics** is positioned as the most affordable pro-grade option and offers **outright purchase or lease**. **VALD ForceDecks** is subscription/lease-only — bundled **3-year subscriptions with ~3%/yr escalators** — which spreads cost but locks in recurring spend. Budget on the order of low-five-figures for a pro dual-plate system; a single-plate or contact-mat CMJ is a cheaper on-ramp that still captures jump height (though it loses the force-time curve that justifies the "lab" story). (proven for the business-model contrast; specific dollar figures vary — confirm current quotes)

**For Soto:** Phase the hardware. Phase 1 = grip + shoulder HHD + a jump mat/single plate (captures the highest-ROI numbers cheaply). Phase 2 = dual force plates once athlete volume justifies it. In Triton, ingest ForceDecks/Hawkin CSV exports the same way `compete_pitches` ingests TrackMan, and gate the report to only the reliable metrics (peak force, jump height, peak power, mRSI) with a "monitored internally" tier for RFD/strategy.

---

## 6. Layer 4 — Sport Output (the KPIs) & Benchmark Databases

The physical layers are diagnostics; **sport output is the scoreboard.** For pitchers: mound velocity plus TrackMan (spin rate, spin efficiency, movement, extension, release). For hitters: exit velocity + bat speed (HitTrax/Blast Motion). Everything upstream exists to move these.

**Pitching velocity benchmarks (fastball, mph):**

| Level | Typical range | Notes |
|---|---|---|
| 12U | ~54 median; 61–65 strong; 70+ elite (top 1%) | Huge maturity scatter |
| 14U | 60–70 sit; 75+ well ahead | Mid-PHV volatility |
| HS freshman | ~65 avg | |
| HS varsity | 75–85 (81 senior avg) | |
| D3 / NAIA / JUCO | 80–88 recruiting | |
| D2 | 84–88 | |
| D1 starter | 88–92 sit | Relievers 92–96+ |

(proven as population ranges; sources vary a few mph — treat as bands, not lines)

**Hitting benchmarks — exit velocity (peak, mph):** youth (8–10) ~55–65; middle school (11–14) ~65–80; HS ~80–95 (JV ~70–80, varsity ~85–90, elite 90s); college D3 85–95, D2 90–100, D1 95–105+; pro 100–120+. **Bat speed (Blast Motion):** HS JV ~53–67, HS varsity ~57–71, college ~61–73, MiLB ~63–75, MLB ~66–78 (elite 78–80+). (proven as vendor/population norms)

**The benchmark-database problem.** Public age charts are noisy, aggregated across mixed sources, and rarely maturity-adjusted. The competitive moat for Neptune is building an **internal, maturity-banded benchmark database** from its own TrackMan/HitTrax/force-plate intake, reported as percentiles within (age band × maturity × level). This is exactly the `league_averages` pattern already proven on the Statcast side. (plausible → promising as the data accrues)

**For Soto:** This is the flywheel. Every intake and retest feeds a Neptune-owned benchmark table; percentiles get *sharper* as n grows, and the facility can honestly say "vs. 340 pitchers we've tested at your maturity level" instead of citing a blog chart. Wire mound-velo and TrackMan straight into `compete_pitches`; add `neptune_hitting` for exit velo/bat speed. The Triton platform is the differentiator the facility research already identified — this is where it earns its keep.

---

## 7. Retest Cadence & Longitudinal Monitoring

**Default cadence: 6-week blocks** (Driveline's standard) — long enough for training adaptation, short enough to steer programming, and it doesn't eat the training economy that constant testing would. Layer the cadence by test type:

- **Every session / weekly (readiness):** grip strength, bodyweight, a quick CMJ (jump height only) — cheap fatigue/readiness monitors.
- **Every 6 weeks (block retest):** full force-plate battery, HHD strength, sport output.
- **Pre-season + mid-season (arm-care):** shoulder ROM (rested) and ER-strength — the prospectively-validated injury signals.
- **Quarterly / semi-annual:** anthropometrics & maturity offset (they move slowly but reframe every youth percentile).

**Signal vs. noise on retest.** A change only counts if it exceeds the metric's measurement error. Rule of thumb: a delta must clear roughly the **minimal detectable change** (~1.5–2× the standard error of measurement, ≈ CV × baseline). Concretely: IMTP peak force (CV 2.4%) can flag a real ~3–4% gain over 6 weeks; IMTP RFD (CV up to ~50%) cannot flag anything short of a doubling — which is why it stays "monitored, not reported." Control the conditions every time: **same examiner, same time of day, same warm-up, same equipment, tested rested** (not post-throwing, given Reinold's ~9° acute total-rotation drop). (proven)

**For Soto:** Store `cv_pct` (or SEM) per metric in a `neptune_metric_meta` table and compute retest deltas as multiples of MDC, coloring "real change" vs. "within noise" automatically. This single feature makes the retest report trustworthy and stops staff from over-reading random fluctuation — the most common failure mode in facility dashboards.

---

## 8. Reporting to Athletes, Coaches & Parents

The same data needs three different renderings — mismatch the audience and you lose the sale or the buy-in.

**Parent one-pager (traffic-light):** No z-scores. A single page with (1) 2–3 **priorities** in plain language ("build lead-hip mobility," "add lower-body strength"), (2) a **percentile-vs-age (maturity-adjusted) chart** for the headline numbers (velo, exit velo, key strength), (3) a green/yellow/red status on injury-risk flags (ER strength, ROM LSI), and (4) one sentence of plan + timeline. Parents buy clarity and a path, not data density. Always frame youth numbers against maturity to avoid mislabeling late bloomers.

**Athlete/coach layer:** Percentiles + raw values, force-velocity profile, asymmetry chart, ROM LSI table, and the prioritized training emphasis derived from it (force-dominant vs. velocity-dominant, eccentric-braking deficit, ER-strength flag). This is where CMJ driver/strategy metrics and TrackMan detail live.

**Clinical/monitoring layer (internal):** Everything, including the high-CV metrics tracked as trend lines, workload overlays, and the auto-alerts (ER surplus <5°, ROM LSI <90%, ER-strength drop vs. baseline, asymmetry >10–15%).

**Guardrails on messaging.** State associations as associations, not guarantees — the literature is clear these are *risk factors*, not deterministic predictions (Wilk explicitly cautions against oversimplifying his own ER-deficit finding). Never promise a velo number from a force number. And separate **injury-risk** language (handled soberly, routed to a qualified provider when flags appear) from **performance-development** language (motivational, opportunity-framed).

**For Soto:** Build the report as a single Triton view with three toggled tiers (parent / athlete-coach / internal), reusing the TruMedia-style tile system (heatmaps for ROM asymmetry, scatter for force-velocity, percentile bars for benchmarks). The parent tier is a printable/emailable PDF — the artifact that closes trials into memberships. Auto-populate the priorities block from the flag engine so the founder isn't hand-writing every report; that's the leverage the small-team constraint demands.

---

## 9. A Concrete Neptune Intake Battery (Phased)

**Phase 1 — launch-ready, sub-$1k hardware (grip dynamometer, HHD, tape/inclinometer, jump mat, radar/TrackMan already in hand):**
- Anthropometrics + maturity offset (years-from-PHV)
- Shoulder IR/ER/total rotation + hip IR/ER + ankle DF ROM (fixed examiner, >90% LSI expected; ER-surplus and TRM flags)
- Grip strength (both hands) + shoulder IR/ER HHD (ER:IR ratio, N/kg)
- CMJ (jump height via mat), mound velocity + TrackMan
- Retest every 6 weeks; ROM + ER-strength pre/mid-season

**Phase 2 — add dual force plates (Hawkin purchase or VALD lease) + HitTrax/Blast:**
- Full CMJ/SJ/IMTP/repeated-hop battery (report peak force, jump height, peak power, mRSI; monitor RFD/strategy internally)
- Inter-limb asymmetry profiling
- Exit velocity + bat speed benchmarking for hitters
- Feed everything into the Neptune-owned, maturity-banded benchmark database

This sequence delivers a credible "development lab" experience from day one on cheap, high-ROI hardware, then adds the marquee force-plate layer once athlete volume amortizes the capital cost — matching the small-team, leverage-first constraint.

**For Soto:** This is the shippable spec. The intake schema, flag engine (ER<5°, LSI<90%, ER-strength drop, asymmetry>15%), retest-delta-vs-MDC logic, three-tier report, and Neptune benchmark table are all incremental Triton features that reuse existing patterns (`compete_pitches` ingest, `league_averages` percentiles, TruMedia tiles). Ship Phase 1's data layer first; the hardware can lag the software.

---

## Sources

1. Evaluation and Treatment of Baseball Pitchers: There's More to Assess than the Arm — IJSPT / PMC. https://pmc.ncbi.nlm.nih.gov/articles/PMC11698006/
2. High Performance Assessment: Strength Testing Using Force Plates — Driveline Baseball. https://www.drivelinebaseball.com/2020/11/high-performance-assessment-strength-testing-using-force-plates/
3. Athlete Screening Part 1: Movement Screens — Driveline Baseball. https://www.drivelinebaseball.com/2017/05/athlete-screening-part-1-movement-screens/
4. Athlete Screening Part 2: Performance Screens — Driveline Baseball. https://www.drivelinebaseball.com/2017/05/athlete-screening-part-2-performance-screens/
5. Isometric Mid-Thigh Pull (IMTP) Strength Testing — Driveline Baseball. https://www.drivelinebaseball.com/2020/12/isometric-mid-thigh-pull-imtp-strength-testing/
6. Intra-Trial Reliability and Usefulness of IMTP on Portable Force Plates — PMC. https://pmc.ncbi.nlm.nih.gov/articles/PMC7052723/
7. Effect of GIRD on Shoulder in Baseball Pitchers during Fastball Pitching — PMC. https://pmc.ncbi.nlm.nih.gov/articles/PMC7664367/
8. Correlation of GIRD and Total Rotational Motion to Shoulder Injuries in Professional Baseball Pitchers — Wilk et al. 2011, AJSM. https://journals.sagepub.com/doi/10.1177/0363546510384223
9. Deficits in Glenohumeral Passive ROM Increase Risk of Shoulder Injury in Professional Baseball Pitchers: A Prospective Study — Wilk et al. (summary). https://baseballdevelopmentgroup.com/2016/02/is-shoulder-rom-a-risk-factor-for-pitching-injury/
10. GIRD and Injuries: A Systematic Review and Meta-analysis — PMC. https://pmc.ncbi.nlm.nih.gov/articles/PMC5967160/
11. Dominant Arm Internal and External Rotation Strength is Related to Arm Pain in Youth Baseball Players — IJSPT. https://ijspt.scholasticahq.com/article/124447-dominant-arm-internal-and-external-rotation-strength-is-related-to-arm-pain-in-youth-baseball-players
12. Hand-held dynamometry vs isokinetic/externally-fixed for shoulder IR/ER — ScienceDirect. https://www.sciencedirect.com/science/article/abs/pii/S1466853X16300578
13. Anthropometrics, Athletic Abilities and Perceptual-Cognitive Skills Associated With Baseball Pitching Velocity (ages 10–22) — PMC. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9002307/
14. Isolating the Effect of Grip Strength on Exit Velocity in Male Baseball Players — ResearchGate. https://www.researchgate.net/publication/384519540
15. Association Between Passive Hip ROM and Pitching Kinematics in High School Baseball Pitchers — PMC. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8486413/
16. Reliability and Validity of the Athletic Shoulder (ASH) Test — PMC. https://pmc.ncbi.nlm.nih.gov/articles/PMC9024613/
17. Early Rate of Force Development and Maximal Strength at Different Positions of the ASH Test in Baseball Players — MDPI/PMC. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12473965/
18. The Role of Countermovement Jump Assessment in Baseball — Premier Pitching Performance. https://premierpitching.com/blogs/premier-pitching-chronicles/the-role-of-countermovement-jump-assessment-in-baseball-force-plate-applications-for-performance-programming-and-health
19. Youth Baseball Player Development — Velocity Aging Curves — Driveline Baseball. https://www.drivelinebaseball.com/2021/09/youth-baseball-player-development-velocity-aging-curves/
20. Bio-Banding — Science for Sport. https://www.scienceforsport.com/bio-banding/
21. Digital Force Plate Comparison: KINVENT, VALD & Hawkin — JLW Force / SimpliFaster buyers' guides. https://jlwforce.com/blogs/strength-assessment-and-physiotherapy-blog/how-to-choose-the-right-force-plates-for-your-practice ; https://www.hawkindynamics.com/hd-force-plates
