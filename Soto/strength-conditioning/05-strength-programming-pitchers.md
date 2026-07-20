---
title: Strength Programming for Pitchers
domain: strength-conditioning
tags:
  - strength-training
  - pitching-velocity
  - periodization
  - in-season-training
  - exercise-selection
  - force-plates
  - offseason-programming
  - injury-prevention
sources_reviewed: 22
last_updated: 2026-07-19
---

# Strength Programming for Pitchers

## TL;DR

- **Body mass is the single strongest weight-room-adjacent predictor of fastball velocity** — r = 0.58 for body mass and r = 0.52 for lean mass in D-I pitchers (2025, JSCR, n = 33), stronger than any jump or power test in the same sample. "Mass equals gas" is directionally real, with diminishing returns and a body-comp ceiling. (proven)
- **Absolute lower-body power beats relative power for velocity prediction.** CMJ peak power (r = 0.43) and Wingate peak power (r = 0.44) correlate with fastball velo; jump *height* and body-mass-normalized power do not. Driveline's force-plate model (SJ peak power, CMJ RSI-mod, hop-test RSI, IMTP net peak force) predicts fastball velocity with R² = 0.54, MAE ±2.7 mph. (proven)
- **Hip strength is the best-established lower-body strength predictor of velocity** — a 2023 systematic review of 17 studies / 909 pitchers (65% pro) found hip abductor/rotator strength and hip ROM repeatedly associated with pitch velocity; stride-length findings were mixed. (proven)
- **1RM squat/bench correlate weakly-to-not-at-all with velocity once you control for mass** — maximal strength is a capacity that must be converted (through mass gain, power work, and throwing), not a direct velocity dial. (promising)
- **The debated exercises resolve to "dose and variation, not blanket bans":** barbell overhead press and full Olympic catches are the least defensible risk:reward for throwers (landmine press, trap-bar jumps, and pull variations capture most of the benefit); bench press is fine with scap-friendly setup and ROM management. (promising)
- **In-season lifting is non-negotiable:** pitchers who stop lifting lose strength and velocity across a season; the working consensus is cut volume ~30–50%, keep intensity high (~80–90% loads in low doses), 2 lifts/week anchored to the throwing schedule (hardest lift the day after a start; CNS-light, concentric-focused touch-up 2 days before the next one). (promising)
- **Preseason rotator-cuff weakness predicts arm injury:** in a 5-year prospective study of 207 pro pitchers (Byram et al.), preseason ER weakness predicted injuries requiring surgery; supraspinatus weakness predicted shoulder/elbow injury in HS pitchers (Tyler et al.). Cuff/scap strength work is injury insurance, not velocity training. (proven)
- **For Soto:** Driveline's assessment→bucket model (IMTP + CMJ + SJ + hop test every 6 weeks) is the exact spine Neptune's assessment → programming → monitoring product should copy, with results stored in the Compete pipeline next to TrackMan velo so Neptune can compute its own "predicted velo vs actual velo" gap metric.

## 1. What Strength Qualities Actually Correlate with Velocity

The correlational literature is now good enough to rank the physical inputs to throwing velocity:

**Body mass and lean mass.** The strongest and most replicated finding. In 33 NCAA D-I pitchers (JSCR 2025), body mass correlated with peak fastball velocity at r = 0.58 (p = 0.0004) and lean mass at r = 0.52 (p = 0.002) — larger than any power test in the same cohort (proven). An earlier D-I study (n = 25) found lean body mass correlated with mean FB velo at r = 0.51 and best FB velo at r = 0.56 (proven). Tread Athletics built an entire client-facing philosophy ("mass equals gas") on this: almost every 95+ arm they develop is 190+ lb, and truly small hard throwers are rare outliers (promising as a causal claim — mass gain in a trained thrower usually buys velo, but the correlation partly reflects selection).

**Absolute lower-body power.** The same 2025 JSCR study is the cleanest demonstration of a subtle point: CMJ *peak power in watts* correlated with velocity (r = 0.43, p = 0.014) and Wingate peak power at r = 0.44, but **jump height, power-per-kg, and Sparta scores did not**. Power unadjusted for body mass explained ~19% of velocity variance alone but added little beyond body mass itself (34% vs 32% combined) — because absolute power *contains* mass (proven). Practical translation: a 215-lb pitcher with a 26-inch vertical out-produces a 165-lb pitcher with a 32-inch vertical, and the mound rewards the former.

**Driveline's force-plate model** is the largest applied dataset. Their gradient-boosted model predicting fastball velocity from force-plate testing achieves R² = 0.54 with MAE ±2.7 mph, weighting (in order): squat-jump peak power (W), CMJ modified reactive strength index (m/s), hop-test RSI (flight time / contact time), and IMTP net peak force (N) (promising — proprietary sample, but consistent with peer-reviewed direction). The residual is the useful product: an athlete throwing 4+ mph *under* prediction has a skill/mechanics problem; one throwing *over* prediction has a physical-capacity ceiling to raise. Notably, Driveline's own 2016 internal look found vertical-jump force/BW had essentially zero correlation with velocity (r² = 0.014–0.022, n = 17–29) — the signal only appeared once they moved to absolute power and multi-metric models (plausible lesson: normalize wrong and the signal vanishes).

**Hip strength and hip ROM.** The 2023 Journal of Sport Rehabilitation systematic review (Manzi et al.; 17 studies, 909 pitchers, 65% pro) concluded hip strength — particularly abduction and rotation strength of the drive and lead legs — is "a well-established predictor of increased pitch velocity in adult pitchers," alongside lead-knee extension behavior (harder throwers extend the lead knee more aggressively through release) and pelvis–trunk sequencing (proven). Stride length results were mixed — it's an individual-optimization variable, not a bigger-is-better one (proven).

**Rotational/trunk power.** Rotational medicine-ball throw velocity correlates r ≈ 0.60–0.85 with throwing velocity and bat speed in college samples, and trunk-rotation strength correlates r = 0.68–0.79 with rotational med-ball performance (promising — smaller samples, D-III populations). The 2021 Reinold/Klein offseason review flags trunk rotational power as having "the largest influence on throwing velocity" among trainable qualities (promising).

**Maximal strength (1RM squat/bench/deadlift).** Weak direct correlations, repeatedly. Studies of college pitchers find 1RM squat and bench don't reliably associate with velocity once body mass is in the model (promising). The correct read is *not* "strength doesn't matter" — it's that strength is an enabling capacity: it lets you gain functional mass, produce absolute power, and tolerate throwing workload, but converting it to mound velo requires power work and high-intent throwing (promising).

**Grip strength** correlates weakly with velocity and with elbow varus torque in HS pitchers; pinch strength (FDS/FCU) relates more to spin efficiency than raw velo (plausible). Not a programming priority beyond what heavy pulling already provides.

**For Soto:** this rank ordering is directly implementable as a Neptune intake report: weight/lean mass → SJ/CMJ absolute peak power → IMTP → hip strength (handheld dynamometer) → rotational med-ball velo (radar), each benchmarked against the athlete's velo band. A "predicted velo" regression on Neptune's own accumulating dataset is a natural Triton model — same Z-score architecture as Stuff+.

## 2. The Development Hierarchy: Mass → Force → Power → Transfer

Elite practitioner consensus (Driveline, Tread, Cressey Sports Performance) converges on a hierarchy that matches the correlations above:

1. **Get bigger (if under-massed).** For a 6'2" HS or college arm at 170 lb, 15–25 lb of lean mass is often worth more than any exercise-selection cleverness. Tread's staff case study is illustrative: coach Paul Schwendel went 96 → 99+ mph at age 31, and their write-up attributes the jump to prioritizing throwing-specific power and mass/recovery management over continued heavy maximal strength work once he was already strong (plausible — n = 1, but it frames their "strength is a gateway, not the goal" position).
2. **Get strong enough.** Common practitioner thresholds: ~1.5–2.0× BW trap-bar deadlift or squat as a "strong enough" gate, after which further 1RM chasing has poor marginal velocity return (plausible — thresholds are practitioner heuristics, not validated cut-points).
3. **Get powerful.** Convert force into rate: loaded jumps, med-ball throws, sprint work, Olympic-lift derivatives or trap-bar jumps. This is where Driveline's bucket system lives: an athlete with elite IMTP but poor CMJ/hop RSI gets a plyometric/ballistic emphasis while heavy lifting drops to maintenance volume (promising).
4. **Transfer via throwing.** Velocity is ultimately expressed skill; weighted-ball/high-intent throwing is the specificity layer (covered in the throwing-program doc). Strength work that steals recovery from throwing in a velo block is miscounted volume.

**For Soto / Trevor:** Trevor is a former MLB arm — his personal hierarchy inverts the teenager's. He's past the mass/strength accrual phase; his programming priority is power retention (fast concentric work, jumps, med balls), tissue durability (post-TJ elbow, cuff/scap maintenance), and joint-friendly exercise selection. A 2× BW pull is unnecessary; a maintained 4,000+ W CMJ absolute peak power is the relevant KPI.

## 3. Debated Exercise #1: Overhead Pressing

The most contested exercise in baseball weight rooms. The positions:

**The case against (Cressey, historically most-cited):** throwers show reduced scapular upward rotation at 60°+ abduction; throwing is a *traction* stress (humerus distracted from the glenoid) while pressing is *approximation* (humerus driven into the socket), and barbell/dumbbell overhead pressing under load tends to produce the largest compensations — lumbar extension, scap depression, forearm/biceps overuse — in exactly the population with the least room for error (plausible mechanism, no controlled outcome data). Cressey's actual position is frequently misquoted as a blanket ban; his written stance is "not all overhead work is created equal."

**The graded middle (current consensus):** overhead *patterning* is kept, heavy bilateral barbell overhead pressing is dropped for most throwers. Cressey's published substitution ladder: landmine presses (a horizontal/vertical hybrid whose bar path optimizes scapular upward rotation without fighting gravity vertically), bottoms-up kettlebell presses (serratus-biased, self-limiting load), waiter's walks and bottoms-up carries, TRX Y's, pull-ups, and overhead med-ball throws (promising — mechanistically coherent, widely adopted at CSP, Driveline, Tread). Practitioners who allow true overhead pressing gate it on demonstrated overhead mobility (full shoulder flexion without rib flare, adequate scap upward rotation) (plausible).

**Verdict:** blanket contraindication is (debunked) as an absolute; heavy barbell OHP for pitchers is a poor risk:reward when landmine variations train the pattern — treat it as "earn it with mobility, and even then it's optional."

## 4. Debated Exercise #2: Olympic Lifts

**For:** Olympic lift derivatives produce among the highest barbell power outputs measured, and training programs built on them improve sprint, squat jump, and CMJ more than strength-only programs (proven for general power development). Injury rates in supervised weightlifting are low; the "Oly lifts hurt athletes" claim is (debunked) in general populations.

**Against, for pitchers specifically:** (1) the *catch* position — full clean catch and especially snatch/jerk overhead catch — loads the wrist, elbow, and shoulder in ways with no baseball payoff and real cost for a thrower nursing a season's worth of arm stress; the 2021 Reinold review explicitly recommends avoiding catch positions and substituting plyometrics for "similar benefits" (promising). (2) Technical learning cost: weeks of coaching time for a movement whose power stimulus is replaceable. (3) The "power is planar" argument (Driveline, 2011-era) — that vertical-plane barbell power doesn't transfer to rotational throwing — is overstated as a ban rationale (plausible at best; general power capacity does transfer through throwing practice), but it correctly predicts that Oly lifts are not *privileged* for pitchers.

**Current practice:** trap-bar jumps (loaded ~20–40% 1RM), hang high pulls to the chest (no catch), clean pulls, push presses to landmine, banded trap-bar jumps, and heavy med-ball work capture the high-RFD stimulus without the catch. Sportsmith's trap-bar-jump-vs-Oly analysis and multiple facility programs land here (promising). **Verdict:** derivatives yes, full catches optional-to-avoid for throwers; if an athlete is already a skilled Olympic lifter, hang cleans in the off-season are defensible.

## 5. Debated Exercise #3: Bench Press

The mildest of the three debates. The old "benching makes you tight and ruins your shoulder" claim is (debunked) — there's no evidence horizontal pressing harms throwers, and pec/anterior strength contributes to arm deceleration and general mass. Concerns are about *execution*: pinned-scapula max-effort bilateral benching with excessive arch adds little for a thrower. Standard modifications across CSP/Driveline/Tread: dumbbell pressing (freer scapular motion), slight decline or floor press (ROM control late in season), controlled loading rather than 1RM testing, and roughly balanced or pull-biased push:pull ratios (2:1 pull:push volume is a common facility heuristic) (promising). Cressey and Driveline have both published "yes, pitchers can bench, here's how" positions since ~2010.

## 6. Exercise Selection Framework for Throwers

What actually goes in the program, by category:

- **Bilateral lower force:** trap-bar deadlift (most facilities' default over straight-bar for spinal position and higher peak velocity/power at equal effort), front/safety-bar squat (friendlier rack position than back squat for cranky shoulders/elbows) (promising).
- **Single-leg / lateral:** rear-foot-elevated split squats, lateral lunges, lateral sled drags, skater jumps — mapping to the drive-leg/lead-leg demands and the hip abduction-rotation strength that the systematic review flags as the established velocity correlate (promising).
- **Hinge/posterior chain:** RDLs, hip thrusts, Nordic/GHR work — hamstring strains are a top-5 baseball injury category (Reinold 2021), and the lead leg accepts ~1.5–2× BW ground reaction force at foot plant (proven for GRF magnitude).
- **Power:** trap-bar jumps, weighted/counterweighted CMJs, broad jumps, lateral bounds, hang pulls; rotational med-ball throws (scoop toss, rotational shot put, step-behind throws) 2–3×/week, 6–10 lb balls for power work (promising).
- **Upper pull (emphasized):** chin-up/pull-up variations, rows of every kind. Lat recruitment during acceleration is higher in pro pitchers than amateurs (EMG evidence) and lats are the key force-transfer link between hip and hand (promising). Traction-based (hanging) work is shoulder-friendly per Cressey's approximation/traction logic.
- **Upper push:** landmine press, DB bench variations, push-up variations (serratus-rich, scap-free) — push-ups are underrated for throwers because the scapula moves freely.
- **Cuff/scap/forearm micro-dosing:** ER strength work (side-lying ER, prone Y-T-W, cable ER at 0° abduction — the position that best isolates cuff ER), serratus work, rebounders, light wrist/forearm circuits. Justified by prospective injury data (§9), programmed as daily-ish low-load "arm care," 10–15 min (proven for the risk-factor link; promising for the intervention effect).
- **Deliberately rare:** barbell OHP, snatch, upright rows, dips (deep), max-effort barbell bench singles, heavy straight-bar deadlift from floor for athletes with poor hinge patterns.

**For Soto:** this list is a Neptune exercise-library seed — tag each exercise with {category, plane, thrower-risk-tier, equipment} and template generation becomes a data problem, which is exactly the leverage-over-headcount play the facility needs.

## 7. Off-Season Programming

The published clinical framework (Klein, Cobian, Simmons, Reinold — *Current Reviews in Musculoskeletal Medicine*, 2021) matches elite-facility practice closely. September-to-February structure for a spring-competition athlete:

1. **Recuperation (2–4 wks, ~September):** active rest; restore hip/shoulder ROM lost during the season; no throwing; low-load movement quality work.
2. **Reconditioning / hypertrophy (~4 wks, October):** higher volumes, lighter loads — 60–70% 1RM, 3–4 × 8–12. This is the mass-gain window; pair with a caloric surplus for under-massed athletes (0.5–1.0 lb/wk gain is the common facility target).
3. **Accumulative strength (4–6 wks, Nov–Dec):** 80–85% 1RM, 3–4 × 6–8. Throwing typically resumes light-to-moderate here.
4. **Strength-speed (2–3 wks, Dec–Jan):** complex/contrast training at 80–90% 1RM paired with jumps/throws; bar speed becomes a coached variable (VBT: ~0.75–1.0 m/s for strength-speed work is the standard band).
5. **Pre-competitive / power (4–6 wks, Jan–Feb):** 85–90% 1RM but sharply reduced volume; plyometrics and sprint work ramp to ~20% of the program; high-intent throwing (velo blocks) peaks here — lifting must yield recovery to the mound (promising overall; the phase durations are expert consensus, not RCT-derived).

Cressey Sports Performance runs this as *concurrent* rather than strict block periodization — all qualities are present year-round, with the emphasis sliding along the strength-speed continuum from absolute-strength-biased (early offseason) to speed-biased (late) (promising). Both models work; the invariant is: **heaviest, highest-volume lifting lives as far from high-intent throwing as possible**, and the last 6–8 weeks before competition trade barbell load for velocity of movement.

**By-level offseason durations:** HS athletes may have only 8–12 usable weeks (fall ball compresses it); college arms typically get a genuine 12–16 weeks; pro arms get ~16–20 weeks (season ends late Sept/Oct, report Feb) — which is why pro offseasons can fit a real 4-week hypertrophy block that HS multi-sport athletes should not force.

## 8. In-Season Programming and Weekly Splits Around Throwing

**The core rule:** in-season lifting continues or velocity decays. Detraining data and universal facility experience show pitchers who stop lifting lose strength, mass, and velo across a 3–4 month season (promising — mechanistically certain, thinly RCT'd in baseball). Working parameters:

- **Volume:** cut 30–50% from offseason; **intensity stays high** (loads ~80–90% for 2–4 sets of 2–5 reps preserve strength with minimal soreness). Low-volume heavy > moderate-volume moderate, because DOMS is the enemy of throwing (promising).
- **Frequency:** 2 full-body-ish sessions/week for most; 1 is a floor during heavy competition weeks; 3 short sessions can work for relievers with irregular usage.
- **Exercise rules:** minimize eccentric-heavy novelty (no new exercises in-season), bias concentric-dominant work (sled pushes, trap-bar from blocks, med balls) as the start approaches, keep arm-care daily.

**Starter's 5-day rotation template** (consensus across Cressey's pro in-season series, Gaynor S&P, Tread's in-season blueprint):

- **Day 0 — Start.**
- **Day 1 (post-start):** *hardest lift of the week* — lower-body dominant, moderate-heavy; the athlete is already fatigued, so training stress is condensed here, maximizing recovery days before the next start. Light recovery throwing only.
- **Day 2:** upper-body lift (good intensity), moderate throwing / long toss.
- **Day 3:** bullpen day — no lifting or movement/mobility only; full plyo/med-ball series can ride with the pen for athletes who tolerate it.
- **Day 4 (2 days out):** short, CNS-light, concentric-biased full-body touch-up — speed work, med balls, no heavy squats/deadlifts, stop well short of failure.
- **Day 5 (day before):** off or mobility/priming only (some programs use low-dose priming — a few jumps/throws — the day before; a minority, e.g., Anzmann, argue light speed work the day before helps; (plausible), athlete-dependent).

**Reliever template:** usage is unpredictable, so anchor to a rolling rule — never heavy lower-body within ~48 h *before* likely high-leverage availability; lift on announced down-days; use 2 short sessions (A: lower + push, B: hinge + pull) and float them. Trevor lived this pattern as a late-inning arm; the honest guidance is that relievers train on probability, not certainty, and micro-dosed 20–30 min sessions beat skipped ideal ones.

**Upper/lower splitting logic around throwing:** heavy lower-body stress and high-intent throwing compete for the same recovery; heavy upper pressing close to throwing days aggravates arm-soreness. Hence the standard mapping — lower-heavy immediately after the start (arm is sore anyway, legs have max time to recover), upper earlier in the cycle, nothing heavy within 48 h of competition throwing (promising — near-universal practice, minimal controlled evidence).

## 9. Injury-Resilience Strength: What the Prospective Data Supports

- **Preseason shoulder ER weakness → surgery-level injury** in 207 pro pitchers followed 5 years (Byram et al., AJSM 2010) (proven as a risk factor).
- **Preseason supraspinatus weakness → shoulder/elbow injury** in HS pitchers (Tyler et al.) (proven as a risk factor).
- **Total rotational ROM deficit >5°** (vs non-throwing side) elevates injury rate; GIRD plus prone-ER weakness is the classic HS risk profile (proven).
- **Intervention evidence:** a randomized non-inferiority trial (n = 113 HS pitchers, *Scientific Reports* 2022) found ER strength training was non-inferior to sleeper stretching for arm-injury prevention — i.e., cuff strengthening is at least as protective as the traditional stretching-first approach (promising).
- Measurement note: assess isolated cuff ER strength at 0° abduction, not 90/90, or true cuff weakness gets masked by synergists (promising).

**For Soto:** a $200–400 handheld dynamometer (or ~$1,500 ForceFrame-style fixed rig) makes preseason ER/IR strength and ER:IR ratio (target ≥ ~0.75 ER:IR, side-to-side ER within ~10%) a 5-minute Neptune intake screen with genuine prospective-evidence backing — one of the few injury screens in baseball that actually has predictive receipts. Log it per athlete per season in Compete-adjacent tables and trend it.

## 10. Assessment Stack and Benchmarks by Level

**Driveline's cadence is the template:** force-plate battery (IMTP, CMJ, SJ, repeated hop) at intake and every 6 weeks; results sort athletes into buckets — *strength-deficient* (low IMTP → heavy bilateral emphasis), *power/elastic-deficient* (good IMTP, poor CMJ-RSI/hop RSI → ballistic/plyo emphasis, lifting to maintenance), *mass-deficient* (hypertrophy + nutrition emphasis) (promising).

**Benchmark anchors** (practitioner norms; treat as bands, not gates):
- D-I baseball average bilateral CMJ ≈ 27 in jump height; broad jump ≈ 96 in (reported in NSCA SCJ 2024 review sample).
- MLB vs MiLB levels separate on CMJ *peak/mean power (W)*, not jump height — power in watts rises with level even when heights don't (proven, classic Hoffman-era pro data reanalysis).
- Driveline predicted-velo residual of ±2.7 mph MAE means: an athlete >3 mph under force-plate-predicted velo is flagged "skill/mechanics work"; >3 mph over is flagged "build the body" (promising).
- Body-mass heuristic by level: big-league arms cluster ~200–230 lb; a sub-180 lb college arm chasing 92+ almost always has mass gain as intervention #1 (plausible heuristic).
- Hardware costs for Neptune planning: dual force plates run ~$5k–15k (VALD ForceDecks ~$10k+ w/ subscription; Hawkin Dynamics ~$5–8k), handheld dynamometer $200–400, radar for med-ball velo $150 (Pocket Radar) — the whole strength-assessment layer is <$20k, an order of magnitude below mocap.

**Example templates by level (condensed):**
- **HS (14–18):** 2–3 full-body sessions/wk year-round; master hinge/squat/lunge/push/pull/carry patterns; NSCA LTAD position: resistance training is safe and beneficial for youth with qualified supervision — the "lifting stunts growth" myth is (debunked). No 1RM testing until technique is stable; velocity work is mostly "get bigger, jump, sprint, throw."
- **College:** true offseason block per §7; 3–4 lifts/wk offseason → 2/wk in-season; force-plate testing each phase; trap-bar and single-leg bias; landmine over barbell OHP.
- **Pro:** longest offseason, most individualized; early offseason (Oct–Nov) is the only real hypertrophy/strength window; from January the program bends entirely around the throwing ramp; in-season follows the Day-1-heavy starter rotation or the reliever floating micro-dose model.
- **Post-career / Trevor:** 2–3 sessions/wk concurrent model; power retention (jumps, med balls at high intent), cuff/scap micro-dosing for the post-TJ arm, joint-friendly selection (trap bar, landmine, DBs); the KPI set is CMJ absolute power, ER strength symmetry, and how the arm feels at 85–90% intent demos — not 1RMs.

## Sources

1. Manzi JE et al., "A Systematic Review of Lower-Body Kinematic and Strength Factors Associated With Pitch Velocity in Adult Baseball Pitchers," *J Sport Rehabil* 2023 — https://pubmed.ncbi.nlm.nih.gov/36809769/
2. "Peak Lower-Extremity Power Unadjusted for Body Mass Predicts Fastball Velocity in Collegiate Baseball Pitchers," *JSCR* 2025 — https://pubmed.ncbi.nlm.nih.gov/39446825/
3. Driveline Baseball, "Predicted Velocity Through Jump and Strength Testing" (2021) — https://www.drivelinebaseball.com/2021/05/predicted-pitch-velocity/
4. Driveline Baseball, "High Performance Assessment: Strength Testing Using Force Plates" (2020) — https://www.drivelinebaseball.com/2020/11/high-performance-assessment-strength-testing-using-force-plates/
5. Driveline Baseball, "Relationship Between Vertical Jump Force and Pitching Velocity" (2016) — https://www.drivelinebaseball.com/2016/09/examining-the-relationship-between-vertical-jump-force-and-velocity/
6. Klein B, Cobian D, Simmons G, Reinold M, "Offseason Workout Recommendations for Baseball Players," *Curr Rev Musculoskelet Med* 2021 — https://pmc.ncbi.nlm.nih.gov/articles/PMC7990992/
7. Eric Cressey, "Should We Really Contraindicate ALL Overhead Lifting?" — https://ericcressey.com/should-we-really-contraindicate-all-overhead-lifting/
8. Eric Cressey, "Should Pitchers Bench Press?" — https://ericcressey.com/should-pitchers-bench-press/
9. Eric Cressey, "In-Season Baseball Strength and Conditioning: Part 4 — Professional Baseball" — https://ericcressey.com/in-season-baseball-strength-and-conditioning-part-4-professional-baseball/
10. Tread Athletics, "Mass Equals Gas: Why Muscle Matters for Pitching Velocity" — https://treadathletics.com/mass-equals-gas-why-muscle-matters-for-pitching-velocity/
11. Tread Athletics, "I Stopped Strength Training and Went From 96 to 99 MPH at 31" — https://treadathletics.com/high-velocity-training/
12. Tread Athletics, "In-Season Training Blueprint" (PDF) — https://treadathletics.com/wp-content/uploads/2016/04/In-Season-Training-BluePrint-5.pdf
13. "The Relationship Between Various Jump Tests and Baseball Performance," *Strength & Conditioning Journal* 2024 — https://journals.lww.com/nsca-scj/fulltext/2024/10000/the_relationship_between_various_jump_tests_and.2.aspx
14. "Countermovement Jump and Momentum Generation Associations to Fastball Velocity Performance Among Division I Collegiate Pitchers," *JSCR* 2024 — https://pubmed.ncbi.nlm.nih.gov/38900174/
15. "Rotational Medicine Ball Throw Velocity Relates to NCAA D-III Bat Swing, Batted Ball, and Pitching Velocity" — https://pubmed.ncbi.nlm.nih.gov/34570055/
16. "Influence of trunk rotator strength on rotational medicine ball throwing performance" — https://pubmed.ncbi.nlm.nih.gov/37721721/
17. Byram et al. / prospective shoulder-strength injury data summarized in "A Profile of Glenohumeral Internal and External Rotation... Part II: Strength" — https://pmc.ncbi.nlm.nih.gov/articles/PMC3419558/
18. "Shoulder stretching versus shoulder muscle strength training for the prevention of baseball-related arm injuries: RCT," *Sci Rep* 2022 — https://www.nature.com/articles/s41598-022-26682-1
19. Sportsmith, "Trap bar jumps vs. Olympic lifts" — https://www.sportsmith.co/articles/trap-bar-jumps-olympic-lifts/
20. NSCA, "Youth Training and Long-Term Athletic Development Position Statement" — https://www.nsca.com/about-us/position-statements/youth-training-and-long-term-athletic-development/
21. Gaynor Strength & Pitching, "In-Season Starting Pitcher Throwing and Lifting Schedule" — https://www.gaynorstrength-pitching.com/blog/2019/1/17/in-season-starting-pitcher-throwing-and-lifting-schedule
22. "Poster 60: Relationship Between Grip, Pinch Strength, Ball Velocity, and Elbow Varus Torque in High School Pitchers" — https://pmc.ncbi.nlm.nih.gov/articles/PMC12475626/
