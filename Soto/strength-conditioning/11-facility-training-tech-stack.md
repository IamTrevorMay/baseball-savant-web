---
title: Facility Training Tech Stack 2026 — Force Plates, Dynamometry, Ball Tracking, AMS, and Build-vs-Buy
domain: strength-conditioning
tags:
  - force-plates
  - dynamometry
  - trackman
  - rapsodo
  - bat-sensors
  - athlete-management-software
  - facility-buildout
  - build-vs-buy
sources_reviewed: 24
last_updated: 2026-07-19
---

# Facility Training Tech Stack 2026 — Force Plates, Dynamometry, Ball Tracking, AMS, and Build-vs-Buy

## TL;DR

- **Force plates are now a $3.5k–$11k/3yr decision, not a $30k lab decision.** Hawkin Dynamics dual wireless plates: $6,500 hardware purchase (or $2,750/yr lease) + software at $1,999/1yr, $4,500/3yr, $6,000/5yr (~$11k over 3 years owned). VALD ForceDecks is subscription-only on a 3-year term (~$3,200/yr for FDMini, ~$9,600/3yr, +3%/yr escalator, zero salvage value at term end). Budget option KINVENT: $2,690–$5,990 hardware + $350–$1,150/yr software.
- **Commercial plates are valid; cross-vendor metrics are not interchangeable.** Hawkin plates validated against in-ground AMTI gold standard show small errors for CMJ/drop-jump variables (proven); clinical-grade plates hit good–excellent reliability on 84.5% and strong validity on 93.4% of 168 CMJ parameters vs lab plates (proven). But cross-system comparisons (ForceDecks vs Hawkin vs Sparta) show poor test-retest for mRSI and RFD — pick one vendor and never mix longitudinal data across systems (proven).
- **Ball flight is a 10x price spread:** Rapsodo PRO 2.0 is $3,500 (hitting OR pitching) / $4,500 (both) + Pro Series membership; PRO 3.0 (3 cameras + 2 radars, seam orientation/SSW data) is quote-only; TrackMan V3/B1 runs ~$20k–$30k+ with annual software fees. Driveline itself runs Rapsodo AND TrackMan side-by-side — Rapsodo for bullpen density, radar for game-fidelity data.
- **Arm-care measurement is nearly free now.** ArmCare.com sensor: $199 + $72/yr premium app. Preseason shoulder ER weakness prospectively predicts in-season throwing injury (promising→proven in pro cohorts), making $271 of hardware arguably the highest ROI-per-dollar item in the entire stack.
- **Bat sensors are cheap and good enough for training:** Blast ($150, $60–$100/yr sub) and Diamond Kinetics ($89). Peer-reviewed accuracy: bat speed mean ICC = 0.78 (good), swing/attack angle ICC = 0.58 (use with caution) vs 3D mocap (proven).
- **AMS is a commodity — do not overbuy.** TeamBuildr: $90/mo (50 athletes) → $280/mo (1,000 athletes), AMS add-on +$50/mo. CoachMePlus: $1,000/yr (250 athletes) or $2,500/yr (500). Kinduct/Smartabase are enterprise-priced and explicitly wrong-sized for small facilities.
- **Three realistic stack tiers:** Starter data cage ~$8k–$15k capex + ~$2k/yr; Development lab (Neptune's positioning) ~$45k–$90k capex + $10k–$20k/yr; Research-grade (Driveline Launchpad clone: 28 mocap cameras, 7 in-ground Bertec plates, 8 Edgertronics) $250k+. The development-lab tier is what supports 3–10x commodity-cage pricing.
- **Build-vs-buy verdict for Neptune:** buy all capture hardware, buy a cheap AMS for program delivery, and build only the data/analytics layer — which Triton already is. The Compete pipeline is the moat; a custom workout-delivery app is a trap.

## 1. The Measurement Stack, Layered

A 2026 facility stack is best understood as four layers, each with a distinct buy decision:

1. **Ball flight** (TrackMan, Rapsodo, HitTrax) — the outcome layer. Non-negotiable for a "development lab" positioning; this is what athletes and parents recognize as pro-grade.
2. **Body/output** (force plates, dynamometry, Proteus, VBT, bat sensors) — the capacity layer. Where assessment→programming differentiation actually happens.
3. **Workload/health** (throw-workload sensors, arm-care testing, ROM) — the availability layer. Cheapest hardware, highest injury-relevance per dollar.
4. **Management/data** (AMS, warehouse, dashboards) — the glue. The only layer where building beats buying, and only if you already have engineering capacity.

Driveline's flagship — the benchmark for the category — runs all four at research grade: a "Launchpad" with 28 motion-capture cameras (16 on the batter's box, 12 on the mound), 8 synced/genlocked Edgertronic high-speed cameras, 7 Bertec force plates built into the mound and batter's boxes, 10 OptiTrack Prime 13 cameras at 240 Hz for jumps/gait, plus Rapsodo Pitching, TrackMan, HitTrax, K-Motion, Blast, and Diamond Kinetics running concurrently. Nobody opening a facility should copy that on day one — Driveline monetizes it with $1,799 assessments ($399/mo thereafter), pro clients paying $5k–$10k per offseason, and up to $40k for full-season service. The lesson is the pricing power the stack creates, not the bill of materials.

**For Soto:** Neptune's Carl-research positioning ("development lab commands 3–10x cage-barn pricing") is exactly the Driveline model at 1/10 the capex. The stack below is chosen to make a $1,000–$1,800 assessment product credible.

## 2. Ball-Flight Tracking: TrackMan vs Rapsodo vs HitTrax

**TrackMan** (Doppler radar, in every MLB stadium) is the fidelity ceiling. Stadium/V3-class units run ~$30,000 MSRP plus annual software; the portable B1 is quote-only (accessories alone: $325 fixed mount, $600 protection plate) and tracks pitching and hitting with game-comparable metrics. TrackMan works in live games; that matters if Neptune ever runs scrimmages or showcase events.

**Rapsodo** is the value play: PRO 2.0 at $3,500 (hitting or pitching) / $4,500 (both), plus a required Pro Series membership (tiered for home, high school, and facility use; facility tier quote-only). PRO 3.0 (3 cameras + 2 radars) adds seam orientation and seam-shifted-wake break data — the first sub-TrackMan device useful for modern pitch design at the SSW level. Rapsodo is bullpen-only (sits behind the plate, unusable in games), easier to calibrate than radar, and roughly 5–10x cheaper. Early Driveline/Hardball Times comparisons found Rapsodo spin and movement data close enough to TrackMan for training purposes (proven for training use; game use debunked — it physically can't).

**HitTrax** (batted-ball simulator) is quote-only to purchase but is the one device in the stack that directly *generates revenue*: facilities rent HitTrax cages at $40–$120/hr and run HitTrax leagues. Treat it as an entertainment/revenue asset with a data by-product, not an assessment asset.

**For Soto:** Trevor already has TrackMan data flowing through Compete (`compete_pitch_sessions`/`compete_pitches` ingest TrackMan CSV). That decides the question: standardize the facility on TrackMan-format data so every Neptune bullpen lands in the same schema Triton already parses. If capex forces Rapsodo first, build a Rapsodo→TrackMan-schema mapper in the Compete ingest (column mapping is straightforward; flag device provenance per session so Stuff+-style baselines are never mixed across devices — cross-device movement values differ systematically).

## 3. Force Plates: Hawkin vs VALD vs Budget

### Pricing (2025–2026, from vendor pages and independent comparisons)

| System | Hardware | Software | ~3-yr total | Model |
|---|---|---|---|---|
| Hawkin Dynamics Gen5 dual | $6,500 buy or $2,750/yr lease | $1,999/1yr; $4,500/3yr; $6,000/5yr | ~$11,000 (buy) / ~$9,000 (lease) | Own hardware |
| VALD ForceDecks (FDMini) | included | included | ~$9,600 (~$3,200/yr) | Subscription-only, 3-yr term, +3%/yr |
| VALD ForceDecks (FDLite/FDMax) | included | included | higher, quote-only | Same |
| KINVENT K-Deltas | $5,990 | $350–$1,150/yr | ~$7,040 | Own hardware |
| KINVENT K-Force | $2,690 | $350–$1,150/yr | ~$3,740 (no jump testing) | Own hardware |

Key structural difference: VALD is lease-only — at the end of 3 years you own nothing and prices escalate 3%/yr; Hawkin and KINVENT leave you with owned hardware. Hawkin also sells discounted high-school pricing through SimpliFaster and added iOS tablet support in October 2025.

### Validity and reliability

- Hawkin wireless dual plates stacked on in-ground AMTI plates (n=20, CMJ + drop jump): small magnitude of error across force-time variables; proprietary-software variable computation also validated against criterion MATLAB scripts for CMJ, SJ, DJ, and isometric mid-thigh pull (proven).
- Clinical-grade vs laboratory-grade plates in youth athletes: good-to-excellent reliability in 142/168 CMJ parameters (84.5%), strong validity in 157/168 (93.4%) — including jump height, peak GRF, RFD, impulse (proven).
- Cross-system comparison (ForceDecks vs Hawkin vs Sparta): poor test-retest reliability for modified RSI and rate-of-force-development metrics across systems (proven). Practical rule: RFD-family metrics are noisy everywhere; jump height, peak force, impulse, and asymmetry indices are the stable currency.

### Baseball-specific signal

- Adolescent pitchers (n=32, Kistler plate at 2,500 Hz): CMJ kinetics predict fastball velocity (promising — single study, adolescent sample).
- Collegiate pitchers: drive-leg anterior-posterior GRF correlates with fastball velocity at r = 0.65 (windup) and r = 0.69 (stretch) (promising); collegiate pitchers also jump meaningfully better off the stride leg than the drive leg, so test unilateral as well as bilateral CMJ (promising).
- Lower-limb force output correlating with pitch velocity across levels is one of the most replicated relationships in baseball S&C (proven at the correlation level; causal "add 10cm of jump → add velo" claims remain plausible, not proven).

**For Soto:** Buy Hawkin. Rationale: ownership economics, published gold-standard validation, and — decisive for Triton — Hawkin's developer-friendly API/export for pulling raw force-time data into the Compete warehouse. Standard Neptune battery: bilateral CMJ, unilateral CMJ both legs, isometric mid-thigh pull, and shoulder ISO-belt tests; track jump height, peak propulsive force, mRSI trend (within-system only), and drive-vs-stride-leg asymmetry as a programming input. Never present cross-athlete comparisons against numbers collected on other vendors' plates.

## 4. Dynamometry and Arm-Care Measurement

This layer has the best evidence-per-dollar in the stack.

- **Preseason shoulder ER strength deficit prospectively predicts in-season throwing injury and subsequent velocity loss in pitchers** (promising→proven; prospective pro cohorts). ER/IR strength imbalance is a replicated risk factor for shoulder pain in overhead athletes (proven at the association level).
- **Handheld dynamometry (HHD) is good enough.** HHD of shoulder IR/ER shows superior reliability, lower minimal detectable change, and higher correlation to isokinetic dynamometry than externally-fixed dynamometry (proven); HHD beats manual muscle testing for detecting rotator-cuff deficits on both intra- and inter-examiner reliability (proven). Eccentric ER measurement by HHD is also reliable and valid (proven).
- **Device options, cheapest to priciest:**
  - **ArmCare.com sensor** — $199 hardware + $72/yr premium app ($10/mo). Guided 5-minute exam covering rotator cuff, elbow protectors, and grip. Now formally partnered with Driveline (May 2024) to fuse arm-function data with Pulse workload data. Tread Athletics field-tested it for 3 months and uses it in remote workflows.
  - **MicroFET2** — classic clinical HHD, roughly ~$1,500 street (approximate); no ecosystem, but a one-time purchase with decades of clinical literature behind the device class.
  - **VALD DynaMo** — subscription HHD with guided protocols; 2025 reliability study supports isometric upper/lower-body strength testing in adults (promising). A published collegiate case used DynaMo to catch a 7% ER side-to-side deficit and steer rehab progression.
  - **VALD ForceFrame** — fixed-frame isometric rig; best-in-class standardization for shoulder IR/ER and hip add/abduction, but the most expensive option and subscription-locked.
- **Throw workload:** Driveline **PULSE** (worn below the medial elbow) estimates per-throw elbow valgus torque from arm speed/acceleration plus height/weight, rolling into acute:chronic workload numbers (promising — torque is estimated, not measured; workload construct validity is still being litigated). Roughly $400-class hardware (approximate).
- **Proteus Motion** — 3D resistance/power testing machine, ~$15,000; facilities monetize it directly ($149 initial screening, $49 retests, 3–4x/yr). Baseball-specific normative database is its real asset (promising).

**For Soto:** Day-one Neptune arm-care stack = ArmCare sensors ($199 each, one per assessment lane) + a strict monthly ER/IR + grip retest cadence, with results written into Triton as first-class athlete metrics. This is also directly relevant to Trevor personally: post-TJ athletes with a decade of pro workload are precisely the population where a cheap monthly ER-strength trend line pays off. Proteus is a Phase-2 buy — it's a differentiator and a revenue line, but $15k buys the entire Tier-1 stack below.

## 5. Bat Sensors and Swing Measurement

- **Blast Motion**: $150 sensor (sale pricing as low as $75), premium subscription $60/yr (player) or $100/yr (coach). **Diamond Kinetics**: $89 sensor.
- Peer-reviewed accuracy vs 3D optical mocap (15 college/MiLB hitters, 10 swings per sensor): bat/swing speed mean ICC = 0.78 (good); swing-angle metrics mean ICC = 0.58 (moderate — treat attack-angle absolute values cautiously) (proven).
- Independent field testing: Blast bat-speed readings tracked radar near-perfectly, Diamond Kinetics close behind; both matched manual-video attack angle within ~1° on average (promising — informal methodology).
- Both are in Driveline's hitting stack alongside K-Motion (K-Vest) for body kinematics; MLB's public bat-speed era (Statcast bat tracking, 2024+) has made bat speed a metric parents ask for by name.

**For Soto:** Buy a team bucket of Blast sensors with the coach subscription; log bat speed, rotational acceleration, and on-plane efficiency per session into Compete. Trend within-athlete only — absolute swing-plane numbers across sensor generations aren't comparable enough. Blast's coach API/CSV export makes this Triton-compatible.

## 6. Velocity and Barbell Tracking

- **Radar:** Stalker Pro II/II+ ~$1,250 (pro-grade, tracks release velo); Pocket Radar Smart Coach $399 (validated enough for training; app-connected). Every velo program needs one independent radar even with TrackMan/Rapsodo running — device cross-checks catch calibration drift.
- **VBT (weight room):** GymAware RS $1,995 + $325–$1,095/yr cloud (criterion-grade LPT, error ≤6.01% vs Qualisys); Enode is the cheapest validated option (error ≤4.43%, no systematic bias) (proven); Vitruve $447/unit + team plans $620–$1,251/yr, but charges per-device so it scales worse. VBT autoregulation (cutting sets on velocity loss thresholds) has solid strength-preservation evidence in general S&C (proven), with baseball-specific transfer to throwing velocity plausible but thinly studied (plausible).

**For Soto:** One Stalker + a handful of Enode/GymAware units covers this layer for <$5k. VBT data is low priority for Triton ingestion — keep it in the AMS layer.

## 7. Biomechanics Layer: When Is Mocap Worth It?

- **Markerless is now legitimate.** PitchAI (single-camera, phone-based): validated against marker-based 3D mocap in 10 pitchers — RMSE 3.62 m/s arm speed, 5.75% of height for stride length; authors recommend it as a usable alternative for pitching kinematics (promising — small n, healthy pitchers). Theia3D (multi-camera markerless, what Driveline standardized on): validated against marker-based reference and in-stadium Hawk-Eye with 18 NCAA D1/D2 pitchers at Petco Park (Nov 2025, J Sports Sci) (promising).
- **High-speed video:** Edgertronic cameras (SC1+ 2,240 fps @720p; SC2+ 4,456 fps @720p) are the pitch-design standard for release/seam behavior; budget roughly $5k–$15k per camera depending on model (approximate). A single Edgertronic behind the mound plus Rapsodo/TrackMan covers 90% of pitch-design use cases.
- **Caveat from Driveline themselves (2025):** motion capture describes mechanics; it does not localize or predict arm pain — they explicitly warn against overselling mocap as an injury screen (practitioner consensus). Full marker-based labs (Bertec in-ground plates + 200+ Hz optical arrays) remain a $150k–$500k+ research-tier commitment.

**For Soto:** Phase 1: one Edgertronic-class camera + PitchAI-style markerless per-assessment capture. Full mocap is a Phase-3 (or never) decision — the marginal paying customer at Neptune can't perceive the difference between PitchAI and Theia, but can perceive assessment turnaround time. Any biomech-derived features for Triton models (stride length, arm speed, hip-shoulder separation) should carry capture-method metadata.

## 8. Athlete Management Software

| Platform | Price | Capacity | Fit |
|---|---|---|---|
| TeamBuildr Strength | $90/mo (Silver) → $280/mo (Platinum Pro); AMS add-on +$50/mo; gym-management OS $200/mo | 50 → 1,000 athletes | Best value; unlimited coaches on all plans; force-plate/VBT/GPS integrations at enterprise tier |
| CoachMePlus | $1,000/yr Strength; $2,500/yr Performance; Elite custom | 250 / 500 / 500+ | Strong questionnaire automation, HIPAA/GDPR-aligned compliance at mid tier |
| Kinduct (Movella) / Smartabase (Fusion Sport) | Custom enterprise quotes | Pro/college departments | Explicitly wrong-priced for small facilities per AMS buyer's guides |
| Exercise.com / gym CRMs | ~$100–$400/mo | — | Business ops (billing, scheduling), weak on performance data |

The SimpliFaster AMS buyer's guide's core warning holds: most facilities buy 10x more AMS than they use. The jobs that matter — program delivery to phones, attendance, wellness check-ins, simple reporting — are fully covered at the $90–$150/mo tier.

**For Soto:** TeamBuildr Silver/Gold ($90–$140/mo class) for programming delivery and compliance tracking. Do NOT attempt to replicate workout delivery inside Triton — that UX (exercise videos, athlete phone app, coach program builder) is a multi-year product in itself and TeamBuildr sells it for ~$1,100/yr.

## 9. Total Stack Cost Tiers

Facility context first: buildout runs $150–$250/sq ft ($1.5M–$2.5M for 10,000 sq ft new construction); leases range ~$8/sq ft/yr (Atlanta-type markets) to ~$30 (NYC); turf from $1.69/sq ft; cages from $725; pitching machines $3k–$15k; typical facility margins 10–20%. Tech is a minority of total capex but the majority of pricing power.

### Tier 1 — Starter data cage (~$8k–$15k capex, ~$2k–3k/yr)
Rapsodo PRO 2.0 both-modes ($4,500) + facility membership; Pocket Radar ($399); 4x Blast sensors + coach sub (~$700 + $100/yr); 2x ArmCare sensors ($398 + $144/yr); Vitruve or Enode VBT (~$450–$900); TeamBuildr Silver ($1,080/yr). Supports maybe $50–75/mo membership premiums over a commodity cage.

### Tier 2 — Development lab (~$45k–$90k capex, ~$10k–$20k/yr) — Neptune's tier
TrackMan B1 (or PRO 3.0 as bridge, ~$20k–$30k class); Hawkin dual plates ($6,500 + $4,500/3yr software); ArmCare fleet + DynaMo-class HHD; Stalker Pro II ($1,250); one Edgertronic-class camera (~$6k–$10k); Proteus ($15k, optional/Phase 2); HitTrax (quote; revenue-generating); GymAware ($2k + $325/yr); TeamBuildr + AMS add-on (~$1,700/yr); markerless capture app subscription. This is the stack that makes a $1,000–$1,800 assessment product and $300–$400/mo training memberships defensible — Driveline's own consumer price points ($1,799 assessment, $399/mo) are the market's proof of willingness to pay.

### Tier 3 — Research grade ($250k–$1M+)
Multi-camera markerless (Theia license + 8–28 camera array), in-ground Bertec plates in mound/boxes, 4–8 Edgertronics synced, TrackMan V3, full-time sport scientist. Only rational with pro-client revenue or an R&D/content flywheel (Driveline's model) — or when the data itself is the product.

**For Soto:** Neptune should enter at Tier 2 minus Proteus/HitTrax (~$45k–$55k + ~$12k/yr), sequenced: TrackMan-schema ball tracking → Hawkin plates → ArmCare fleet → Edgertronic. Each addition unlocks a nameable assessment module the content engine (Mayday) can market.

## 10. Build vs Buy: The Athlete Data Platform

The generic framing (from AMS buyer's guides and sports-analytics build-vs-buy literature): off-the-shelf wins for median workflows; custom wins when you have proprietary longitudinal data and sport-specific model logic — generic injury/performance models trained on aggregate populations underperform models trained on your own athletes' longitudinal data (plausible→promising; widely argued, thin public benchmarking). Cited cloud costs for a full production sports-analytics platform run $15k–$60k/mo — but that figure is for pro-club-scale inference infrastructure; a facility warehouse on Supabase runs 3 orders of magnitude cheaper.

The decision matrix for Neptune specifically:

**Buy (never build):**
- Capture hardware + firmware ecosystems (plates, radar, sensors) — no facility on earth should build these.
- Workout delivery/athlete phone app (TeamBuildr, ~$1,100–$1,700/yr) — commodity, high UX cost to replicate.
- Billing/scheduling/CRM.

**Build (because it already exists):**
- The **athlete data warehouse and analytics layer** — this is Triton. The Compete pipeline (TrackMan CSV → `compete_pitches` → session browser) is precisely the ingestion spine every vendor's walled garden refuses to be. Extend it with: `athlete_assessments` (force-plate exports, ArmCare/dynamometry values, bat-sensor sessions), device-provenance metadata, and facility-metric definitions in `docs/VARIABLES.md`.
- **Facility-native metrics**: Neptune Stuff+ off facility TrackMan sessions against Triton's `pitch_baselines`; CMJ/asymmetry trend lines; ER-strength × Pulse-workload dashboards. No vendor sells cross-layer joins — a Hawkin jump next to a TrackMan velo next to an ArmCare ER trend on one athlete timeline is the product no one can buy, and it's ~incremental work on an existing platform.

**Decision rule (general, worth writing down):** build only where (a) you already own the engineering asset, (b) the data crosses vendor boundaries, and (c) the output is customer-visible differentiation. Everything else is a subscription line item.

**Vendor lock-in checklist before any PO:** raw data export (CSV/API) without per-export fees; data retention after subscription lapse (VALD's lease-only model is the cautionary case — hardware AND historical-data access ride on the subscription); API availability (Hawkin and Blast are the most open in their categories); and single-schema compatibility with Compete.

## Sources

1. VALD ForceDecks product page — https://valdperformance.com/products/forcedecks
2. VALD Subscription Pricing Guide (2026, Scribd) — https://www.scribd.com/document/979363029/VALD-Performance-Pricing-Updated-Prices-2026
3. JLW Force: Digital Force Plate Comparison — KINVENT, VALD & Hawkin — https://jlwforce.com/blogs/strength-assessment-and-physiotherapy-blog/how-to-choose-the-right-force-plates-for-your-practice
4. Hawkin Dynamics force plates / Buy Now — https://www.hawkindynamics.com/hd-force-plates
5. SimpliFaster store: Hawkin Dynamics Dual Force Plate (High School Pricing) — https://store.simplifaster.com/product/hawkin-dynamics-dual-force-plate-high-school-pricing/
6. Badby et al., Validity of Hawkin Dynamics wireless dual force plates for CMJ and drop jump (Sensors, 2023) — https://pmc.ncbi.nlm.nih.gov/articles/PMC10224001/
7. Agreement of clinical-grade and laboratory-grade force plates for CMJ metrics in youth athletes (IJSPT) — https://ijspt.scholasticahq.com/article/147057
8. CMJ force-time curve analyses: reliability and comparability across force plate systems (ForceDecks/Hawkin/Sparta) — https://www.researchgate.net/publication/371939297
9. CMJ analysis as a predictor of pitching velocity in adolescent pitchers (J Hum Kinet, in press) — https://jhk.termedia.pl/Countermovement-Jump-Analysis-as-a-Predictor-of-Overhead-Pitching-Velocity-in-Adolescent,211720,0,2.html
10. Relationship between CMJ kinetics and collegiate pitching mechanics (LA Tech thesis) — https://digitalcommons.latech.edu/theses/62/
11. HHD vs externally-fixed dynamometry for shoulder IR/ER (Phys Ther Sport) — https://www.sciencedirect.com/science/article/abs/pii/S1466853X16300578
12. Reliability/validity of eccentric shoulder ER strength via HHD — https://pmc.ncbi.nlm.nih.gov/articles/PMC4532183/
13. Reliability of VALD DynaMo for isometric strength (Phys Ther Sport, 2025) — https://www.sciencedirect.com/science/article/pii/S1466853X25001154
14. Physio Network: monitoring strength for rehab progression in a collegiate baseball player — https://www.physio-network.com/blog/monitoring-strength-rehabilitation-progression-collegiate-baseball/
15. Accuracy and error trends of commercial bat swing sensors (PMC) — https://pmc.ncbi.nlm.nih.gov/articles/PMC8879135/
16. Bat Digest: Diamond Kinetics vs Blast vs Zepp field review — https://batdigest.com/blog/diamond-kinetics-review/
17. Rapsodo PRO 2.0 / PRO 3.0 product and membership pages — https://rapsodo.com/products/pro-2-ball-flight-monitor and https://rapsodo.com/pages/rapsodo-baseball-pro-3-baseball-hitting-pitching-in-one
18. TrackMan Baseball Portable B1 — https://www.trackman.com/baseball/Portable-B1
19. Driveline Research Lab (equipment inventory) — https://www.drivelinebaseball.com/research-lab/
20. Boston Globe: Driveline is changing the MLB offseason (2025; pricing) — https://www.bostonglobe.com/2025/01/29/sports/driveline-baseball-boston-red-sox/
21. Fleisig-lab validation of PitchAI markerless mocap (Sports Biomech, 2022) — https://pubmed.ncbi.nlm.nih.gov/36409062/
22. Theia Markerless: pitching analysis software / Driveline partnership (incl. Petco Park validation, J Sports Sci 2025) — https://www.theiamarkerless.com/blog/pitching-analysis-software
23. Driveline PULSE Throw Workload Monitor + ArmCare partnership (2024) — https://www.drivelinebaseball.com/product/pulse-throw/ and https://www.drivelinebaseball.com/2024/06/armcare-and-drivelinebaseball-partnership/
24. ArmCare.com sensor and app pricing — https://armcare.com/products/arm-care-assessment-package
25. TeamBuildr pricing — https://www.teambuildr.com/pricing
26. CoachMePlus pricing — https://coachmeplus.com/pricing/
27. SimpliFaster: Buyer's Guide to Athlete Management System software — https://simplifaster.com/articles/buyers-guide-athlete-management-system-software/
28. GymAware vs Vitruve pricing comparison — https://gymaware.com/gymaware-vs-vitruve/
29. RunSwift: 2026 guide to indoor baseball facility costs — https://www.runswiftapp.com/blog/indoor-baseball-facility-cost
30. Ideas2IT: predictive sports analytics — build or buy — https://www.ideas2it.com/blogs/predictive-sports-analytics-platform-development
31. Proteus Motion machine listing ($15,000) — https://dotmarfitness.com/products/proteus-motion-machine
32. Edgertronic camera lineup and specs — https://edgertronic.com/our-cameras
