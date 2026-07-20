---
title: Elbow & Forearm Kinetics — Valgus Torque, UCL Load, and What Moves the Number
domain: biomechanics
tags:
  - elbow-kinetics
  - valgus-torque
  - ucl-load
  - forearm-pronation
  - pitching-biomechanics
  - workload-monitoring
  - motion-capture
  - injury-risk
sources_reviewed: 21
last_updated: 2026-07-19
---

# Elbow & Forearm Kinetics — Valgus Torque, UCL Load, and What Moves the Number

## TL;DR

- **Elite adult pitchers generate ~90–120 N·m of internal varus torque** to resist the external valgus load near max shoulder external rotation. The most-cited ASMI cohort figure is **99 ± 17 N·m** peak varus torque; a 2025 database of 523 pitchers (425 pro, 98 collegiate) reports ~100 N·m peak with a **normalized range of 0.0461–0.0637 %BW·height** (proven).
- **The UCL itself fails at only ~22–35 N·m in cadaver testing** (Ahmad 2003: 34.0 ± 6.9; McGraw 2013: 35.0 ± 14.0; Hechtman 1998: 22.7 ± 9.0). That is the core paradox — pitchers routinely see 45–120 N·m of *net joint torque* yet only ~16% rupture, because the flexor-pronator mass stress-shields the ligament. The UCL likely bears only ~**33 N·m (~one-third of net torque)** (proven for cadaver loads; plausible for the shielding split).
- **Torque scales hard with competition level, not cleanly with velocity across pitchers:** youth ~18–35 N·m, HS ~48–54 N·m, college ~55 N·m, pro ~64–100+ N·m — yet Driveline found velocity explains only **R²≈0.29** of elbow stress *across* athletes, while *within* a single pro pitcher the velocity→torque link is **R²=0.92–0.96** (proven).
- **Pitch type matters less than folklore claims:** fastballs top the list at ~90 N·m varus torque and 292 N valgus force, ~8–9% above the changeup; sliders and curveballs sit ~87–88 N·m; the curveball is **not** the elbow-killer it's rumored to be, and shows the lowest cumulative torque (proven).
- **Forearm pronation at foot contact does NOT correlate with elbow varus torque** in vivo (P_min = .21 across HS and pro; pronation groups averaged 30–33° pronation vs −10 to −14° for supinators) — the "pronate to save your elbow" cue is far weaker than cadaver models implied (promising/plausible).
- **Wearable stress ≠ lab torque.** The Motus/mThrow sleeve reads ~**41 N·m (38.7%) lower** than marker-based torque but correlates R=0.667 — good for tracking *relative* change, not absolute UCL risk. Markerless (KinaTrax/Theia) is now the MLB standard (proven).
- **Cumulative valgus load drives injury more than any single pitch.** Acute:chronic workload sweet spot is **0.7–1.3**; an acute:chronic valgus ratio ≥**1.27** raised injury odds; youth throwing **>100 innings/yr carry 3.5× the odds** of serious arm injury (proven).
- **Heavier balls lower torque, not raise it:** 6–7 oz implements produce *less* elbow/shoulder torque than a 5 oz baseball because velocity — the dominant torque driver — drops; weighted-ball programs still added ~**3.3%** velocity (proven).

---

## 1. How Big Is the Number? Torque Magnitudes by Level

The load pitching places on the medial elbow is expressed as an **internal varus torque** — the moment the arm must generate to resist the external *valgus* load that peaks near the instant of maximum shoulder external rotation (late cocking / early acceleration). These are two sides of the same event; "valgus torque/load" and "varus torque" in the literature almost always refer to the same ~50 ms window.

Foundational biomechanics (Fleisig/ASMI, early 1990s) reported a varus torque of ~**120 N·m** near max external rotation, a figure that still circulates. More representative modern cohort values are lower: the widely cited ASMI benchmark is **99 ± 17 N·m** peak varus torque, computed via inverse dynamics with BioPitch software from marker-based motion capture, scaled inertial segment properties, and normalized to %body weight × height (proven).

The most authoritative recent dataset — a deidentified ASMI database of **523 pitchers (425 professional, 98 collegiate)** — puts peak torque near **100 N·m**, with the **UCL-specific load estimated at ~33 N·m (about one-third of the net joint torque)** and a normalized torque range of **0.0461–0.0637 %BW·height** (proven). Splitting that cohort into thirds (n≈174/174/175), the high-torque group carried **28% more normalized torque for only 1% more velocity** (38.0 vs 37.1 m/s) — the clearest evidence that torque and velocity are only loosely coupled at the population level.

Torque rises steeply with competition level, tracking body mass and ball speed:

| Level | Typical peak valgus/varus torque |
|---|---|
| Youth (9–14) | ~18–35 N·m |
| High school | ~48–54 N·m |
| College | ~55 N·m |
| Professional | ~64–100+ N·m |

Within youth specifically, ASMI age-banded data give ~**35 N·m (fastball) / 32 N·m (curveball) at 10–15 yrs**, rising to ~**60 / 54 N·m at 14–18 yrs** (proven). The pronation-study cohort corroborates the pro/HS gap directly: HS pitchers averaged **54 ± 16 N·m**, professionals **88 ± 16 N·m** (proven).

**For Soto:** These bands are the backbone of any Neptune arm-load benchmark. When Compete/TrackMan sessions feed athlete dashboards, Soto should present elbow load *relative to level-appropriate norms* — a 48 N·m reading is alarming in a 12-year-old and unremarkable in a college arm. Bake the level table into a percentile lookup rather than a single red-line.

---

## 2. The UCL Loading Paradox — Why 100 N·m Doesn't Snap a 34 N·m Ligament

The single most important concept in elbow kinetics is the **in-vitro / in-vivo paradox**. Isolated cadaver UCLs fail at:

- Ahmad et al. (2003): **34.0 ± 6.9 N·m**
- McGraw et al. (2013): **35.0 ± 14.0 N·m**
- Hechtman et al. (1998): **22.7 ± 9.0 N·m**
- Reported literature spread: **17.1 – 36.9 N·m**

The famous "~32 N·m" ceiling comes largely from an unpublished abstract, but the peer-reviewed range clusters near **22–35 N·m** (proven). Meanwhile live pitchers routinely produce **45–120 N·m** of net joint torque. If the ligament truly saw all of that, every professional pitch would rupture it — yet only ~16% of pitchers actually tear (proven).

The resolution: the **~100 N·m is *net joint torque* from inverse dynamics, not UCL tension.** That net figure already lumps together contributions from bone geometry (radiohumeral compression), the joint capsule, and — critically — the **flexor-pronator mass (FPM)**: flexor carpi ulnaris (FCU), flexor digitorum superficialis (FDS), flexor carpi radialis (FCR), and pronator teres (PT). The FCU is anatomically positioned to directly oppose valgus, firing at **80–120% MVC during acceleration** and **40–50% MVC in late cocking** when valgus loading peaks (plausible→promising).

A stress-shielding study quantified how close this runs to the edge: the muscular varus torque required to fully unload the UCL ranged from **89.1% ± 21.7% of max voluntary isometric varus strength for curveballs to 103.1% ± 26.5% for fastballs** — and **10 of the tested pitchers lacked sufficient varus strength to fully shield the UCL on fastballs** (proven). That is the mechanistic case for medial-elbow / forearm strength as arm-care: when the FPM can't cover the check, the ligament pays the difference.

Musculoskeletal modeling (Buffi 2015) found muscles alone *cannot* fully counter the external torque — "osseous and/or UCL contributions were also needed" — so the true split among UCL, bone, and muscle remains unquantified (plausible; an open research gap).

**For Soto:** This is the graded, defensible answer to "does throwing hard tear your UCL?" The honest framing: net elbow torque is a *demand* signal, and injury risk is demand **minus** the FPM's shielding capacity, accumulated over time. It argues against treating any single wearable "stress" number as a UCL-tension readout — a point Driveline itself makes (see §5). For Neptune programming, it justifies a medial-elbow strength battery (grip/wrist-flexion/pronation dynamometry) as a first-class assessment input, not an afterthought.

---

## 3. Pitch Type — Fastball Is the Culprit, Not the Curveball

Cross-pitch biomechanics (Fleisig, 18 pro pitchers, 32–40 max-effort pitches each) show surprisingly modest spreads:

- **Elbow varus torque: 8–9% greater in fastball and slider vs changeup**
- Shoulder horizontal-adduction torque: 17–20% greater in slider/curveball vs changeup
- Elbow & shoulder proximal (distraction) forces: 10–14% greater in fastball/slider/curveball vs changeup
- Ball velocity: 11–18% greater in the fastball
- **No significant differences between balls and strikes** on any kinetic parameter (proven)

Force-based comparisons agree: **fastballs generated the greatest valgus force at 292 N (~9% above the 268 N curveball)**; sliders 244 N; changeups lowest at 235 N. On peak varus torque, fastballs top out around **90.1 N·m**, with sliders and curveballs near **87.7 N·m** — but **sliders carry higher loading rates**, and the **curveball shows the lowest cumulative torque** of the four (proven).

This overturns decades of "curveballs hurt young elbows." Multiple reviews find shoulder internal-rotation torque, varus torque, and proximal force were *lower* for the curveball than the fastball, and that the **age a pitcher started throwing curveballs did not affect injury risk** (proven). Volume and velocity, not the breaking ball, drive youth risk.

The 2024 MLB injury wave sharpened the pitch-*characteristic* story beyond pitch *type*: research surfaced during the epidemic found that for **cutters, each +1 inch of side movement raised injury risk ~36%; sinkers, each +1 mph raised risk ~30%; four-seamers, each +100 rpm raised risk ~20%** (promising — associational, from injury surveillance rather than controlled kinetics). The through-line: chasing "stuff" (velocity, spin, sweep) is the modern load multiplier.

**For Soto:** Triton already computes per-pitch-type metrics. A biomech-informed feature worth prototyping: a **per-pitch estimated-load index** that weights fastball usage and velocity more heavily than breaking-ball count, rather than the folk model that flags curveball %. It maps cleanly onto the existing pitch_type-level aggregation in the Compete pipeline and could become a Neptune-facing "arm demand" column alongside Stuff+.

---

## 4. Forearm Pronation & Supination — The Cue That Doesn't Hold Up In Vivo

Cadaver work showed elbow varus **laxity is greater when the forearm is pronated** than supinated, feeding the popular "pronate through release to protect the UCL" coaching cue (and Mike Marshall's whole pronation-based pitching system). But cadavers have no muscle contraction — precisely the protective element that matters in vivo.

The decisive in-vivo test (41 HS + 196 pro pitchers) found **no significant correlation between forearm pronation at foot contact and elbow varus torque at any level (P_min = .21)** (proven). Group means:

- HS pronators: **30 ± 19°** pronation → 54 ± 16 N·m torque
- HS supinators: **−14 ± 9°** → 49 ± 14 N·m
- Pro pronators: **33 ± 17°** → 88 ± 16 N·m
- Pro supinators: **−10 ± 5°** → 89 ± 18 N·m

Torque was essentially identical between pronators and supinators. Velocity effects were tiny and inconsistent (−0.2 m/s per 10° in HS individuals; +0.1 m/s per 10° in pros). Note the supination groups were small (12 HS, 15 pro), so this is best read as "pronation at foot contact is not a meaningful torque lever," not a closed case (promising).

Pitch mechanics do dictate release-forearm posture — **sliders and curveballs are supinated through release; most fastballs and changeups pronate** — but the cadaver-driven claim that supinated breaking balls therefore load the UCL more is not supported by the in-vivo torque data above. On the surgical side, tensioning a UCL graft in max supination vs max pronation changed post-op medial gapping by **<1 mm** regardless of flexion angle — clinically negligible (proven, cadaveric).

**For Soto:** Downgrade any "pronate to save the elbow" advice to *unproven mechanism, weak evidence*. It's fine as a feel cue for pitch quality, but Soto should not sell it as arm-care. This is exactly the flavor of bro-science Trevor will discount if presented ungraded.

---

## 5. Measuring the Number — Methods and Their Error Bars

**Marker-based inverse dynamics (ASMI BioPitch, Vicon-class labs)** is the gold standard: 38+ reflective markers, scaled segment inertias, high-speed capture, torque via inverse dynamics. Accurate but lab-bound, marker-dependent, and unable to capture in-game natural mechanics.

**Wearable — Motus/mThrow sleeve (motusTHROW):** the field workhorse. Validation vs motion capture:
- Its "stress" metric correlates with lab elbow torque at **R = 0.667 (P = 0.001)**
- But reads **~41 N·m (38.7%) LOWER** than lab torque in absolute terms
- Arm slot and shoulder rotation land within **5–15%** of lab values; elbow extension velocity is the weakest metric
- Verdict: **reliable for tracking *relative* change within an athlete, not for absolute UCL-risk claims** (proven)

**Driveline PULSE (Motus-derived)** field data on 19 pitchers / 114 pitches:
- Mean stress **61 N·m**, SD **15.7**, range **30–90 N·m**; "high effort" band 52–67 N·m
- Velocity→stress correlation only **R² = 0.29** (0.32 after outlier removal); velocity↔arm speed R²=0.13; stress↔arm speed R²=0.02
- Explicit caveat: the metric can't tell whether stress lands on the UCL or surrounding muscle — mechanics and muscular support outweigh raw velocity (proven)

**Markerless motion capture (KinaTrax, Theia3D)** is now the MLB standard — stadium-installed, no markers, captures game mechanics. A 2025 study predicting elbow valgus torque from markerless upper-extremity kinematics validates the approach (combinations of MER angle, elbow-flexion at release, elbow-flexion at peak elbow-extension-velocity timing significantly predicted peak torque), though full-text error bars were paywalled. Treat markerless torque as *approaching* marker-based accuracy but still model-dependent (promising).

**For Soto:** Since Neptune already owns TrackMan (which gives release/velocity/movement but **not** joint torque), Soto's build decision is real: (a) add a wearable (Motus-class) for relative arm-load tracking, cheap and athlete-friendly, or (b) invest in markerless capture for research-grade torque. The evidence says a Motus-class sleeve is the right *first* buy for longitudinal monitoring — but dashboards must label it "relative load index," never "UCL stress," to stay honest. Markerless is the phase-2 differentiator for a true "development lab" tier.

---

## 6. What Raises and Lowers the Torque — The Mechanical Levers

The 523-pitcher study isolated **11 kinematic parameters explaining ~40% of the variance in normalized torque** (the rest is individual/anatomical). Directionally (proven for associations; causation is inferred):

**Raise torque:**
- **Ball velocity** — the single largest contributor (partial R²≈0.161)
- Greater shoulder abduction at foot contact
- Higher max knee-extension velocity of the lead leg
- More elbow flexion at foot contact
- Greater trunk contralateral tilt at ball release
- Higher max elbow-extension velocity

**Lower torque:**
- More shoulder abduction *at ball release* (i.e., arm-slot management late)
- Higher maximum external rotation (counterintuitive — likely reflects better energy sequencing)
- More upper-trunk (forward) tilt at foot contact
- More shoulder external rotation at foot contact
- Later timing of peak pelvic-rotation velocity (better kinetic-chain sequencing)

The recurring theme: **efficient proximal-to-distal sequencing (trunk/pelvis timing, lead-leg block, trunk tilt) reduces the torque the elbow must produce for a given velocity.** This is why two pitchers at 95 mph can differ 28% in normalized torque — the low-torque one "gets to velocity" through the trunk and legs rather than the arm.

**Velocity relationship, precisely stated:** *across* pitchers velocity is a weak predictor (Driveline R²≈0.29; population "harder = more stress" is unreliable). *Within* an individual pitcher, throwing harder reliably raises torque — pro intra-subject **R² = 0.922–0.957** (proven). Hurd's HS data: mean 71 mph, adduction moment 0.558 N·m/(Ht·mass), range 0.378–0.723. So "throttling back 2 mph" lowers *your own* elbow load, but a 98-mph arm isn't automatically more stressed than a 92-mph arm.

**Repetitive load / fatigue:** Across 951 pitches from 14 pitchers at ~67 mph, there was **no group-level change in torque with accumulated pitches**, and velocity held constant even at self-reported 80% fatigue — but **between-pitcher differences were large (random-intercept SD 8.71 N·m)** and individuals varied in how load tracked with pitch number. Fatigue's effect on *torque* is individual, not universal; the injury signal comes from cumulative exposure, not a within-outing torque spike (promising).

**For Soto:** These levers are directly actionable at Neptune. A markerless or high-speed video assessment can flag the high-torque mechanical signatures (arm-heavy sequencing, poor trunk tilt, late pelvis) and route athletes to trunk/lower-half interventions that cut load *without* costing velocity. For Triton, several of these (release-based proxies for trunk tilt, arm slot) are partially derivable from TrackMan/release data and could seed a "mechanical efficiency" feature family alongside Stuff+/command.

---

## 7. Cumulative Load & Workload Monitoring — Where Injury Actually Lives

Single-pitch torque is the *demand*; injury is a *dose* problem. Chronic valgus load is typically modeled as a **28-day rolling average of daily workload = sum of valgus torque across every throw that day** (via a worn Motus-class sensor).

Key thresholds (proven unless noted):
- **Acute:chronic workload ratio (ACWR) target: 0.7–1.3**; spikes above raise risk
- **Acute:chronic valgus ratio (ACVR) ≥ 1.27** (7-day vs 28-day) linked to higher injury incidence in collegiate pitchers
- Youth: **>100 innings/yr → 3.5× odds** of serious arm injury (10-yr follow-up); **>75 pitches/game or >400 pitches/season** significantly raised shoulder/elbow pain odds
- Cumulative near-failure microtrauma progressively lowers the UCL's ultimate tensile load over a career (plausible mechanism, widely accepted)

The 2024 MLB epidemic context ties this together: velocity/"stuff"-max culture pushes both per-pitch torque *and* the effort with which every pitch is thrown, while amateur year-round volume raises chronic dose long before the UCL fully matures (~age 26 per Andrews). Fleisig's summary — "the UCL is being pushed beyond what it can take" — is a dose statement, not a single-pitch one.

**For Soto:** This is the highest-value Neptune product surface. The **assessment → programming → monitoring** spine should culminate in a per-athlete **rolling valgus-load / ACWR dashboard** — the one metric with the strongest injury evidence base. It's buildable on the existing Compete/`compete_pitches` pipeline plus a wearable feed: daily throw counts × per-pitch load estimate → 7-day and 28-day rolling sums → ACWR with a 0.7–1.3 green band and a >1.3 amber flag. That single view (not a fancier torque estimate) is what differentiates a "development lab" from a cage barn, and it's directly shippable in Triton's incremental build mode.

**For Trevor (the athlete):** The return-from-TJ arc lives in exactly this literature. The evidence-based levers for a post-TJ arm staying sharp are: (1) keep ACWR inside 0.7–1.3 — ramp throwing volume gradually, never spike; (2) invest in flexor-pronator / grip strength to preserve UCL stress-shielding capacity (the 89–103% MVIC margin means small strength gains matter); (3) manage *your own* velocity/effort as the within-pitcher torque dial when load needs trimming; (4) treat wearable "stress" as a personal trend line, not an absolute risk gauge. For demo/content work, throttling effort 2–3 mph meaningfully lowers your personal elbow load with minimal downside.

---

## Sources

1. Kinematic Parameters Associated With Elbow Varus Torque in Elite Adult Baseball Pitchers (523 pitchers) — PMC. https://pmc.ncbi.nlm.nih.gov/articles/PMC11789100/
2. Kinematic Parameters Associated With Elbow Varus Torque in Elite Adult Baseball Pitchers — PubMed. https://pubmed.ncbi.nlm.nih.gov/39906602/
3. Biomechanics of the Elbow During Baseball Pitching (Fleisig, foundational) — PubMed. https://pubmed.ncbi.nlm.nih.gov/8343786/
4. The ulnar collateral ligament loading paradox between in-vitro and in-vivo studies (narrative review) — PMC. https://pmc.ncbi.nlm.nih.gov/articles/PMC8130712/
5. Varus Strength of the Medial Elbow Musculature for Stress Shielding of the UCL — PMC. https://pmc.ncbi.nlm.nih.gov/articles/PMC11878578/
6. Biomechanical Comparisons Among Fastball, Slider, Curveball, and Changeup Pitch Types — PubMed. https://pubmed.ncbi.nlm.nih.gov/28968139/
7. Magnitude and variability of individual elbow load in repetitive baseball pitching — Scientific Reports / PMC. https://pmc.ncbi.nlm.nih.gov/articles/PMC10567693/
8. Forearm Pronation at Foot Contact: A Biomechanical Motion-Capture Analysis in High School and Professional Pitchers — PMC. https://pmc.ncbi.nlm.nih.gov/articles/PMC10134138/
9. Exploring wearable sensors as an alternative to marker-based motion capture in the pitching delivery (Motus validation) — PeerJ / PMC. https://pmc.ncbi.nlm.nih.gov/articles/PMC6348088/
10. Elbow Stress, PULSE, and Velocity — Driveline Baseball. https://www.drivelinebaseball.com/2016/10/elbow-stress-pulse-velocity/
11. Increases in Ball Weight and Size Decrease Elbow Varus Torque During Baseball Pitching (Fleisig et al., 2025) — ASMI. https://asmi.org/wp-content/uploads/fleisig-et-al-2025-increases-in-ball-weight-and-size-decrease-elbow-varus-torque-during-baseball-pitching.pdf
12. Predictors of Elbow Torque Among Youth and Adolescent Baseball Pitchers — PubMed. https://pubmed.ncbi.nlm.nih.gov/29746146/
13. Curveballs in Youth Pitchers: A Review of the Current Literature — PMC. https://pmc.ncbi.nlm.nih.gov/articles/PMC6874692/
14. Risk of Serious Injury for Young Baseball Pitchers (Fleisig et al., 2011) — AJSM. https://journals.sagepub.com/doi/10.1177/0363546510384224
15. Position Statement for Tommy John Injuries in Baseball Pitchers — ASMI. https://asmi.org/position-statement-for-tommy-john-injuries-in-baseball-pitchers/
16. Intra- versus inter-pitcher comparisons: ball velocity and throwing-arm kinetics — ScienceDirect. https://www.sciencedirect.com/science/article/abs/pii/S1058274621003967
17. Predicting elbow valgus torque from kinematics using markerless motion capture (2025) — ScienceDirect. https://www.sciencedirect.com/science/article/pii/S2666337625000265
18. Effect of the forearm rotation at UCL graft tensioning on medial elbow gapping — PMC. https://pmc.ncbi.nlm.nih.gov/articles/PMC9344174/
19. An Interval Throwing Program for Baseball Pitchers Based upon Workload Data — IJSPT. https://ijspt.scholasticahq.com/article/94146
20. MLB's Next Order of Business? Saving Pitchers (2024 injury epidemic) — The Ringer. https://www.theringer.com/2024/04/02/mlb/pitcher-injuries-crisis-mlb-study-tommy-john-ucl
21. Which pitches are tearing up major league arms? (Fleisig/UAB, pitch-characteristic risk) — UAB Reporter. https://www.uab.edu/reporter/research-innovation/which-pitches-are-tearing-up-major-league-arms
