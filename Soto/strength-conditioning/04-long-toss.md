---
title: Long Toss — Biomechanics, Velocity Transfer, and the MLB Org Debate
domain: strength-conditioning
tags:
  - long-toss
  - throwing-biomechanics
  - pulldowns
  - velocity-development
  - arm-care
  - interval-throwing
  - elbow-torque
  - jaeger
sources_reviewed: 19
last_updated: 2026-07-19
---

# Long Toss — Biomechanics, Velocity Transfer, and the MLB Org Debate

## TL;DR

- **Long toss stress does not scale linearly with distance — it plateaus, then re-climbs.** In Fleisig's ASMI protocol (17 college pitchers, 2011), elbow varus torque at 120 ft roughly matched mound pitching; from 120→180 ft ball velocity kept rising (~87 mph at 180 ft) while elbow torque changed little; only at max-distance (**mean 264 ft, crow-hop, arc allowed**) did shoulder internal-rotation torque and elbow varus torque jump ~10% above mound values with elbow extension velocity peaking at **2,573°/s** (proven).
- **Max-distance arc throwing changes your mechanics, not just your loads.** At 264 ft the arm reaches ~180° shoulder external rotation and ~109° elbow flexion; the trunk becomes more upright, front-knee flexion drops, and upper-trunk tilt increases — a posture built to *loft* a ball, not to pitch (proven). This is the core case against unlimited long toss as a "mechanics" tool.
- **"Percent effort" is a lie your arm tells you.** Slenker et al. (AJSM 2014, 29 pitchers) found a pitcher cued to 60% effort still produced ~76% of full elbow/shoulder load at ~84% of max ball speed; Melugin/Leafblad found perceived 25% reductions were only 7–11% real (proven). Any distance-capped program that trusts athlete-reported intensity is under-dosing on paper and over-dosing in reality.
- **Pulldown velocity predicts but overshoots mound velocity by ~5–6 mph.** PRP Baseball's multi-year data: **6.1 mph** average gap (2021, 57 pitchers), **~5 mph** (2020, 112 athletes); Driveline reports pulldowns run **~5.5 mph** hotter than the mound and are marginally *more* stressful than pitching. Correlation of a 5-oz pulldown to max mound velo tops out around **R² ≈ 0.7** (promising).
- **No controlled trial has ever shown long toss adds mound velocity; the velocity gains in the literature come from resistance and weighted-implement work.** Escamilla 2012 (68 HS players, 6 wk): +1.2–2.0% velo from Throwers-Ten / Keiser / med-ball, nothing from long toss per se; weighted-ball RCTs add velocity but raise injury rate (proven for the gain, proven for the risk).
- **The 120-ft cap is a rehab number that leaked into performance.** It originates in Tommy John return-to-throw protocols; ASMI's own published ITP and Reinold's rehab progression extend to 180 ft. Roughly half of MLB historically enforced ~120 ft while orgs like the Rangers, Mariners, D-backs, and Nationals let pitchers "air it out" — the Dylan Bundy/Trevor Bauer 2011 draft standoffs made the split public (debunked as a universal rule; contested as policy).
- **MLB's own December 2024 report reframed the whole debate.** The 62-page league study (200+ interviews, Fleisig involved) named **velocity chase and max-effort training** — not the pitch clock — as the leading injury drivers, implicating weighted balls and high-intent bullpens. That verdict cuts toward *arc/recovery* long toss and away from unlimited max-effort pulldown volume (promising).

---

## 1. What "Long Toss" Actually Means (and Why the Argument Never Ends)

The single biggest source of confusion in this topic is that **"long toss" has no agreed definition.** Calcei & Freehill's 2021 review in *Current Reviews in Musculoskeletal Medicine* opens on exactly this problem: reported "long toss" distances in the literature span **90 to 260+ feet**, with different trajectories (flat vs. arc), different intents (recovery vs. max), and different purposes (rehab, warm-up, arm-building, velocity). A Driveline-cited survey of **269 pitchers, 19 coaches, and 31 athletic trainers** put the *mean* distance people call "long toss" at **175 ft**, with the community stretching the term anywhere from **120 to 420 ft**. In that survey **36%** considered long toss a flat "on-a-line" throw and **70%** considered it "not on a line" (arc) — respondents could pick both. So two coaches can "both do long toss" and be running physiologically opposite protocols.

For Soto's purposes it is cleaner to abandon the umbrella word and classify by **trajectory × intent**:

- **Extension / arc throws** — upward loft, partial-to-moderate effort, distance built gradually. Goal: range of motion, blood flow, "stretching out" the arm, recovery, aerobic throwing volume.
- **Compression / pulldown throws** — flat, on-a-line, **maximal intent**, usually with a crow-hop or shuffle run-up, thrown *coming back in* toward the partner after reaching max distance. Goal: intent, arm speed, velocity expression, and — in tech shops — a measurable proxy for mound velocity.
- **Interval / rehab throwing** — capped-distance, progressive flat-ground throwing used to rebuild tissue tolerance post-injury (the origin of the 120/180-ft numbers).

Almost every disagreement in the "long toss debate" dissolves once you specify which of these three you mean. The Jaeger camp fuses arc + pulldown into one flowing session; the rehab/ASMI camp isolates capped interval throwing; the anti-long-toss camp is really arguing against *unlimited max-distance arc throwing as a velocity tool.*

**For Soto:** When logging Neptune throwing data through the Compete pipeline, tag every throw with `trajectory` (arc/line) and `intent` (%), not just distance. Distance alone is uninterpretable — a 200-ft arc recovery throw and a 200-ft compression throw are different training stimuli and different injury exposures. This tag should become a first-class column alongside `compete_pitches` velocity fields.

---

## 2. The Fleisig / ASMI Biomechanics — The Load-vs-Distance Curve

The foundational biomechanics come from Fleisig and colleagues at the American Sports Medicine Institute, published as **"Biomechanical Comparison of Baseball Pitching and Long-Toss: Implications for Training and Rehabilitation"** (JOSPT, 2011). **Seventeen healthy college pitchers** threw a progressive flat-ground program: 60 → 120 → 180 ft "hard and on a line," then 300+ ft / max-distance with a **crow hop and arc allowed**. Radar and 3D motion capture ran on every throw. The headline findings (all proven for this sample):

- **120 ft "on a line" ≈ mound pitching.** Kinematics and kinetics at 120 ft closely tracked full-effort mound values. This is why 120 ft became the "safe ceiling" number — at that distance and trajectory the arm sees roughly pitching-equivalent, not pitching-exceeding, load.
- **120 → 180 ft: velocity climbs, torque mostly doesn't.** Ball speed at 180 ft averaged **~87 mph**. Shoulder external rotation increased ~10–15% (which correlates with velocity), but elbow varus torque did not meaningfully exceed the 120-ft/mound level in the on-a-line throws.
- **Max distance (mean 264 ft, unconstrained): everything spikes.** With the crow hop and arc, pitchers averaged a **264-ft** throw. Compared to mound pitching this produced the greatest **shoulder external rotation (180° ± 11°)**, **elbow flexion (109° ± 10°)**, **shoulder internal-rotation torque (101 ± 17 N·m)**, **elbow varus torque (100 ± 18 N·m)**, and **elbow extension velocity (2,573°/s ± 203°/s)** — roughly a **~10% increase** in the key torques over normal pitching.
- **Mechanics degrade for pitching purposes.** At max distance the trunk becomes more upright, front-knee flexion decreases, and upper-trunk forward tilt increases sharply (Reinold summarizes this as trunk tilt "quadrupling" from mound to max-distance). The arm slot and posture optimize for *carry*, not for a downhill pitch.

Slenker et al. (**AJSM 2014, 29 college pitchers**) reinforced the picture with flat-ground throws at 60/90/120/180 ft plus mound throws at 60/80/100% effort, measuring humeral internal-rotation torque (HIRT) and elbow valgus load (EVL). Dowling et al. found shoulder ER, elbow varus torque, and arm speed all rising with distance **up to ~150 ft.** The consistent story: **stress rises with distance to roughly 120–180 ft, then the biggest jump is the transition to unconstrained max-distance crow-hop throwing.**

Two important caveats. First, the modern wearable dataset partly *disagrees* on the plateau shape (see §4) — Leafblad/Fleisig with the motus sleeve found torque essentially plateaued after 120 ft even as velocity kept rising, while the very-large-N interval-throwing dataset (Reinold 2024) found valgus torque re-climbing at the far end. Second, all of these are **small lab samples (17–60 pitchers)** measuring load, not *outcomes* — none of them tells you whether the throwing made anyone better or hurt.

**For Soto:** These torque numbers are the physical basis for a Neptune "throwing stress" metric. If Neptune deploys a wearable (motus/Pulse-class IMU), the ASMI anchor points — ~100 N·m elbow varus at max mound/max distance — let Soto calibrate a per-athlete stress budget rather than counting raw throws. A Triton-side model that ingests per-throw torque and distance from the Compete pipeline could flag when an athlete's *arc recovery* day has quietly turned into a *max-effort* day (the effort-miscalibration problem in §3).

---

## 3. The Effort-Perception Problem — Why Capped Programs Under-Dose on Paper

The most practically important finding across this whole literature is that **pitchers cannot accurately down-regulate effort.** This undercuts every "throw at 70%" instruction ever given.

- **Slenker 2014:** pitchers cued to **60% effort** on the mound generated **~76% of full elbow/shoulder load** and **~84% of max ball speed.** The perceived-to-actual gap is enormous at the low end.
- **The systematic review (Dias et al., 2023, 13 studies):** **50% perceived effort → ~75% of full torque; 75% effort → 80–95% of full torque.** Ball velocity mismatched perceived effort the same way.
- **Melugin / structured long-toss data (via Calcei & Freehill):** when a program *told* athletes to reduce effort 25%, their actual measured effort dropped only **7–11%.**

The implications compound. A "recovery" long-toss day at supposedly moderate effort may be loading the arm at 80%+ of a game. A capped 120-ft program that assumes the cap makes it safe is only safe if the *trajectory and intent* are also controlled — because at 120 ft on a hard line you are already at pitching-equivalent load (§2). Conversely, an *arc* throw of the same distance at genuinely submaximal loft is far lighter, which is why the Jaeger arc protocol can feel gentle while still building volume.

The corollary for velocity work: because athletes over-deliver effort, **the way you get a true submaximal day is to change the constraint (trajectory, weighted implement, distance), not to ask for a percentage.**

**For Soto:** Effort miscalibration is a strong argument for objective load monitoring at Neptune rather than RPE alone. It also means Trevor's own "easy catch play" is probably heavier than it feels — a relevant point for a post-TJ arm managing chronic workload. Any Neptune arm-care dashboard should surface *measured* stress against a rolling baseline, and treat athlete-reported RPE as a weak secondary signal.

---

## 4. Wearables, Big Data, and the 300-ft Re-Climb

The wearable era replaced 17-pitcher lab studies with hundreds of thousands of field throws — at the cost of validity trade-offs.

- **Leafblad, Larson, Fleisig et al. (Sports Health, 2019, 60 pitchers — 28 college, 32 HS):** using the **motusBASEBALL** IMU sleeve at 90/120/150/180 ft plus max mound. Key result: **ball velocity changed significantly at every distance step, but elbow torque did not** — torque rose 90→120 ft, then plateaued. Within-athlete reliability was "excellent," but **only 79% of athletes hit acceptable torque reliability vs. 91% for velocity** — i.e., some pitchers pay much more elbow tax than others for the same distance. Conclusion: **individualize.**
- **Reinold et al. (IJSPT, 2024) — the big-data ITP:** **238,611 anonymized flat-ground throws** from 34 healthy NCAA D-I pitchers (**111,196** tagged long-toss), 30–300 ft, via the Motus/Driveline Pulse database. A 2nd-order polynomial linked distance to peak elbow varus torque; secondary reporting of this dataset flags that **beyond ~300 ft, elbow valgus torque rises ~11–12%, nearly matching peak in-game stress** — the far-end re-climb the small lab studies also saw at max distance.
- **motus "Stress" validity:** the sleeve's elbow-torque metric correlates **ICC ~0.99** to ASMI's lab torque in validation, which is why practitioners trust it as a field proxy — though it is a single-point IMU estimate, not full inverse-dynamics.

The 2024 Reinold paper's most usable output is a **data-built interval throwing program**: a **217-day** progression (vs. the classic 136-day), flat ground starting at **30 ft** and reaching **120 ft by weeks 11–12**, deload weeks at 7/14/22/29, then a mound block ramping 50→75→90→100% with changeups added ~week 19 and breaking balls ~week 23. Crucially, it kept the **acute:chronic workload ratio (ACWR) in the 0.7–1.3 "safe" band for 91% of the program** (peak 1.33), versus 82% (peak 1.61) for the traditional program — a concrete demonstration that gentler chronic ramp = lower modeled re-injury risk (promising).

A separate systematic review (Dias et al., 2023, 13 studies) found the literature **cannot agree on the distance at which flat-ground torque matches full pitching** — some studies said ~18 m, others ~55 m, one ~91 m. That inconsistency is itself the finding: **there is no universal safe distance; it is athlete- and trajectory-specific.**

**For Soto:** The ACWR framework is directly portable to Neptune and to Trevor. A Triton feature that computes rolling acute (7-day) vs. chronic (28-day) throwing load per athlete — counting *all* throws (warm-up, plyo, long toss, bullpen), since research shows in-game pitches are only **~10–12%** of total throws — would be a genuine differentiator versus a commodity cage. This is a natural extension of the Compete session schema: add throw-level load, aggregate to daily load, expose ACWR with the 0.7–1.3 guardrails.

---

## 5. Pulldowns and Compression Throws — The Velocity Bridge

Pulldowns are the performance-side descendant of Jaeger's pull-down phase: after reaching max distance, the athlete works **back in** toward the partner throwing **flat, on-a-line, at maximal intent** with a crow-hop/shuffle run-up. Tech-forward shops (Driveline, PRP, Tread) formalized them as both a *stimulus* (top-end arm-speed expression) and a *test* (a radar-able number that proxies mound velocity).

**The stress reality:** both ASMI and Driveline's internal work found pulldowns are **marginally *more* stressful than mound pitching** — Driveline reports pulldowns run **~5.5 mph** hotter than mound velocity and produce among the highest elbow/shoulder torques of any throw type. This is not "free" velocity training; it is high-intent, high-load work that must be dosed like max-effort pitching.

**The transfer relationship** (all promising, from private datasets):

- **PRP Baseball:** 2021 winter (57 pitchers) — **6.1 mph** mean pulldown-to-mound gap; HS subset improved pulldowns **+4.7 mph** and positional velo **+3.4 mph** over a block. 2020 winter (112 athletes) — **~5 mph** gap; athletes pulling **90+ mph** averaged **87.6 mph** positional, those pulling **94+ mph** averaged **90.1 mph**, those pulling 80–84.9 averaged 77.7. 2019 — pitchers >90 mph pulldowns averaged **86.9 mph** mound; >94 mph pulldowns averaged **88 mph** mound.
- **Driveline:** average pulldown-to-mound gap **~5 mph**; correlation of a 5-oz weighted pulldown to max mound velocity tops out around **R² ≈ 0.7** — strong, but far from deterministic.

**How to read the gap (the practitioner heuristic):** a **large** pulldown-to-mound gap suggests the athlete "leaks" energy in the transition to the mound — a mechanics/sequencing or intent problem on the mound side, with untapped velocity. A **near-zero** gap suggests the athlete either breaks down mechanically during pulldowns or isn't expressing intent on flat ground — less headroom to convert.

**Programming (PRP/Tread pattern):** pulldowns are gated behind a **5–8 week on-ramp** of long toss plus strength work, then run **once weekly, 5–7 throws at 100%**, with 3–4 low/moderate throwing days around it and 2–3 rest days between high-intent sessions. Tread's session template: work out to **97–100%+ of max long-toss distance for 5–10 throws**, then **5–15 max-effort compression pulldowns** on the way in.

**For Soto:** The pulldown-to-mound gap is a ready-made Neptune/Compete metric — and a natural companion to Stuff+. If Compete already ingests TrackMan pull-down and mound velocities, Soto can compute a per-athlete "transfer gap" and trend it; a shrinking gap at constant pulldown velo = velocity actually reaching the mound. Pair it with Triton's release-extension and sequencing data to attribute a *large* gap to a specific mechanical leak. Caveat for Trevor personally: pulldowns are max-effort, TJ-relevant load — a demo/staying-sharp arm should treat them as sparingly as game bullpens, not as casual catch play.

---

## 6. Does Long Toss Build Velocity? The Honest Evidence Ledger

Here the graded verdict matters most, because the marketing and the data diverge.

- **No controlled trial shows long-toss distance itself adds mound velocity.** Escamilla, Fleisig, Andrews et al. explicitly found that particular throwing distances were **not superior** for building ball velocity, and that max-distance throws were the *least efficient* — highest torque, **no velocity gain** (debunked as a distance-specific velocity tool). The velocity literature that *does* show gains uses other stimuli.
- **Resistance / plyometric work adds ~1–4%.** Escamilla 2012 (68 HS players, 6 wk, 4 groups): Throwers-Ten **+1.7%**, Keiser pneumatic **+1.2%**, med-ball plyos **+2.0%**, control ~0. Broader reviews cite **up to ~4.1%** from 4–10 weeks of baseball-specific resistance training (proven, modest).
- **Weighted balls add more velocity — with a documented injury tax.** The Reinold/Macrina PeerJ RCT (2019, **38 pitchers**, 6-wk weighted-implement program) produced statistically significant mound-velocity and shoulder-ER gains in the experimental group **but a higher injury rate** (multiple elbow injuries, several requiring surgery, in the experimental arm). The broader weighted-ball review (Reinold et al., 2021) concludes: they can raise velocity, they are not clearly *safe*, and they are not clearly superior to standard throwing for gains (proven for gain, proven for risk).
- **What long toss legitimately *is* good for:** arm ROM / "stretching out," recovery blood flow, throwing endurance/volume, and — via pulldowns — a velocity *expression and testing* tool. It is a superb **conditioning and readiness** modality, and a mediocre **velocity-acquisition** modality on its own.
- **The "long toss doesn't build arm strength" nuance:** Reinold points out throwing *fatigues* the cuff — MLB pitchers lose **~3–4% of rotator-cuff strength across a season** and **11–18% acutely from a single game's fatigue.** Long toss is a throwing stimulus, so its "strengthening" claim is really about tissue tolerance and endurance, not maximal strength — that comes from the weight room.

**For Soto:** Frame Neptune's velocity pitch honestly and evidence-first (Trevor will discount bro-science). Long toss = readiness, ROM, volume, and a testing lens (pulldowns). Velocity *acquisition* comes from strength/power development, mechanical efficiency (sequencing/extension — Triton's wheelhouse), and *carefully dosed* intent work. Selling long toss as "the velocity program" is exactly the overreach the evidence punishes.

---

## 7. The Jaeger System and How Practitioners Actually Program It

Alan Jaeger (Jaeger Sports) is the practitioner who most shaped modern long toss and coined the "pull-down" concept. His system rests on **three pillars — Arm Care, Long Toss, Throwing Mechanics** — and one governing principle: **"listen to your arm"** (autoregulation; the arm dictates pace, volume, and distance that day, rather than a rigid script). His reach: 200+ pro clients including Barry Zito (2002 Cy Young), Dan Haren, Andrew Bailey; his methods were adopted org-wide by the Texas Rangers.

**Structure of the two long-toss phases:**
- **Stretching-Out phase** — begins with a slight arc from the first throw, increasing arc as distance grows, staying loose; promotes ROM, relaxation, "freedom" in the arm. Preceded every session by **arm circles** and **J-Bands** (surgical-tubing) arm-care work.
- **Pull-Down phase** — at max distance the athlete turns and throws *on a line* coming back in **without dropping intensity** — only trajectory changes. **Compressions** are the on-a-line pulldowns with a shuffle step as the partner closes to ~90–120 ft.

**The published Jaeger off-season program** (representative structure): **2–3 weeks total rest** post-season, then a **6-week, 4-day/week** throwing block, entirely off the mound: Wk 1–2 stretch-out (build ~40→120+ ft), Wk 3–4 add pull-downs (150→195+ ft, flat-ground changeups introduced), Wk 5–6 deepen the base (225→240+ ft). Cost of entry is trivial: the *Thrive on Throwing 2* instructional is **$29.95**; **J-Bands Elite** are **~$44.95** (age 13+) — the whole system is a garage-and-a-partner operation, which is a big part of its cultural spread.

**Where tech shops converge and diverge from Jaeger:** Driveline, PRP, and Tread all keep the arc-out / compression-in flow, but add objective layers Jaeger's feel-based system lacks — radar on pulldowns, IMU torque monitoring, ACWR tracking, and hard gating (PT screen + mechanical video + 5–8 week on-ramp before max-intent pulldowns). The philosophical fusion: **Jaeger's autoregulation + tech's measurement** = "listen to your arm, *and* verify with the sleeve and the radar."

**For Soto:** This is the template Neptune should productize. The differentiator is not the throwing protocol (that's near-free and widely known) — it's the **assessment → programming → monitoring spine** wrapped around it: intake screen, individualized distance/intent prescription, TrackMan pulldown testing, and Triton-powered load/ACWR dashboards. That is precisely the "development lab" positioning that justifies 3–10x commodity-cage pricing.

---

## 8. The MLB Org Debate — 120 ft, the Draft Standoffs, and the 2024 Verdict

The "long toss debate" is really two arguments layered on top of each other: a **physiology** argument (how far is safe/useful) and a **control** argument (who decides — the org or the athlete).

**Where 120 ft came from.** It is a **rehabilitation number.** Interval throwing programs built to return pitchers from injury (including Tommy John) top out flat-ground progressions in the ~120–180 ft range before mound work — 120 ft as a mound-progression *criterion*, not a lifetime ceiling. ASMI's own published ITP and Reinold's rehab protocol both extend to **180 ft.** The number leaked from rehab into everyday performance policy, and roughly **half of MLB** historically enforced a ~120-ft cap while the other half allowed pitchers to extend to **300+ ft.**

**The draft standoffs (2011) that made it public.** Elite prep/college arms who long-tossed heavily pushed back on restrictive orgs. **Dylan Bundy** (100-mph HS arm; 156 K / 5 BB in 71 IP) reportedly told the Pirates (#1) and Royals (#5) *not* to draft him over their ~120-ft restrictions; **Trevor Bauer** (UCLA; 1.40 ERA, 203 K) was the era's most visible long-toss/arm-care evangelist and openly resisted teams that wanted to cap his routine. Reported org leans at the time: **long-toss-friendly** — Seattle, Arizona, Washington; **restrictive** — Pittsburgh, Kansas City, among others.

**The empirical vacuum both sides fought in.** As of the peak of the debate there were **no outcome studies** on long toss — good or bad — only anecdote (Lincecum, Haren, Bauer as pro-long-toss exemplars; the Rangers' minor-league long-toss program credited with producing deep pitching prospects and a staff-ERA improvement from a combined 4.83 to 3.90 across the before/after windows). Correlation, not causation, on both sides.

**The 2024 reframing.** MLB's **December 2024 pitcher-injury report** — 62 pages, **200+ interviews** (former players, execs, surgeons, ATs, biomechanists; Fleisig among them) — concluded the leading injury drivers are the **chase for velocity, pitch-shaping, and max-effort training**, explicitly implicating **weighted-ball training and high-intensity bullpens**, plus possible declines in aerobic/endurance base. It cleared the pitch clock. New injury patterns named: lat/teres-major tears, rib fractures, oblique strains — the signatures of whole-body max effort. This shifts the long-toss debate: it is **less about distance** and more about **cumulative max-intent volume.** Arc/recovery long toss looks favorable in that light; unlimited max-effort pulldown volume looks like exactly the kind of intent-maximizing stimulus the report warns about (promising).

**Synthesis for a modern program:** the defensible middle is (1) **arc long toss** freely for ROM/recovery/volume, extending past 120 ft when the athlete tolerates it — the cap is not sacred; (2) **on-a-line and pulldown/compression work dosed like max-effort pitching** — gated, low-frequency, load-monitored; (3) **individualization over dogma**, because the wearable data proves per-athlete elbow tax varies widely at identical distances.

**For Soto:** Neptune can occupy this middle credibly and market it as evidence-based. Concretely: (a) prescribe arc long toss by *feel + tolerance*, not a fixed cap; (b) treat pulldowns as a *tested, gated, weekly* stimulus with radar + IMU; (c) run every athlete on ACWR guardrails counting all throws. For Trevor specifically — post-TJ, staying-sharp rather than chasing a comeback — the 2024 report is the argument to **keep max-effort pulldown exposure low and arc/recovery long toss as the staple**, treating compression days as rare and deliberate. That is the arm-longevity read of the current best evidence.

---

## Sources

1. Calcei JG, Freehill MT. "The Science and Biomechanics of Long-Toss." *Current Reviews in Musculoskeletal Medicine*, 2021. https://pmc.ncbi.nlm.nih.gov/articles/PMC8137765/
2. Fleisig GS et al. "Biomechanical Comparison of Baseball Pitching and Long-Toss: Implications for Training and Rehabilitation." *JOSPT*, 2011. https://www.ovid.com/journals/jospt/abstract/10.2519/jospt.2011.3568
3. Reinold M. "5 Things You Must Understand About Baseball Long Toss Programs." https://mikereinold.com/long-toss-baseball-training-programs/
4. Slenker N, Limpisvasti O, Mohr K, Aguinaldo A, ElAttrache N. "Biomechanical Comparison of the Interval Throwing Program and Baseball Pitching." *AJSM*, 2014;42(5):1226-32. https://scholarlyworks.lvhn.org/surgery/6980/
5. Leafblad ND, Larson DR, Fleisig GS, et al. "Variability in Baseball Throwing Metrics During a Structured Long-Toss Program." *Sports Health*, 2019. https://pmc.ncbi.nlm.nih.gov/articles/PMC6822207/
6. Reinold MM et al. "An Interval Throwing Program for Baseball Pitchers Based upon Workload Data." *IJSPT*, 2024;19(3). https://ijspt.scholasticahq.com/article/94146
7. Dias N et al. "Biomechanical Basis of Interval Throwing Programs for Baseball Pitchers: A Systematic Review." *IJSPT*, 2023. https://pmc.ncbi.nlm.nih.gov/articles/PMC10547089/
8. Driveline Baseball. "Pitching Research: Long Toss." https://www.drivelinebaseball.com/pitching-research-long-toss/
9. Driveline Baseball. "Defining Long-Toss." https://www.drivelinebaseball.com/2017/04/defining-long-toss/
10. Driveline Baseball. "Comparison of Elbow Torques Between Pulldowns and Pitching." https://www.drivelinebaseball.com/2017/03/comparison-elbow-torques-pulldowns-pitching/
11. PRP Baseball. "Implementing Pulldowns and the Correlation between Mound Velocity and Pulldowns." https://www.prpbaseball.com/blog/2018/8/15/implementing-pulldowns-and-the-correlation-between-mound-velocity-and-pulldowns
12. Jaeger Sports. "2 Phases of Jaeger Sports Long Toss." https://jaegersports.com/2-phases-of-jaeger-sports-long-toss/
13. Jaeger Sports. "Off-Season Throwing Program." https://jaegersports.com/jaeger-sports-off-season-throwing-program/
14. Jaeger Sports. "Thrive on Throwing 2" (product / pricing). https://jaegersports.com/product/thrive-on-throwing/
15. Jaeger Sports. "J-Bands Elite" (product / pricing). https://jaegersports.com/product/j-bands-elite/
16. Escamilla RF, Ionno M, DeMahy MS, Fleisig GS, Wilk KE, et al. Throwing-velocity training comparison (Throwers-Ten / Keiser / med-ball), 68 HS players, 6 wk, 2012. Review via TD Athletes Edge. https://www.tdathletesedge.com/blog/2015/3/29/tdae-sunday-review-a-comparison-study-on-improving-throwing-velocity
17. Reinold MM, Macrina LC, et al. "Effects of a six-week weighted-implement throwing program on baseball pitching velocity, kinematics, arm stress, and arm range of motion." *PeerJ*, 2019. https://peerj.com/articles/6003/
18. Yahoo Sports. "Long-toss debate shakes up MLB draft" (Bundy/Bauer 2011; org positions). https://sports.yahoo.com/news/long-toss-debate-shakes-mlb-061100724--mlb.html
19. MLB / AP. "MLB study finds velocity, max efforts likely causing pitching injuries" (Dec 2024 report, 62 pp, 200+ interviews). https://www.mlb.com/news/mlb-releases-report-on-pitcher-injuries-2024
