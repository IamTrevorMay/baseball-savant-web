---
title: Cutters & Hybrid Pitches — Bridge-Pitch Design Between the Four-Seam and the Gyro Slider
domain: pitch-design
tags:
  - cutter
  - gyro-slider
  - bridge-pitch
  - pitch-design
  - arsenal-construction
  - tunneling
  - platoon-splits
  - stuff-models
sources_reviewed: 22
last_updated: 2026-07-19
---

# Cutters & Hybrid Pitches — Bridge-Pitch Design Between the Four-Seam and the Gyro Slider

## TL;DR

- **The cutter is the fastest-growing fastball in baseball.** Cutter usage roughly doubled from ~1.7% of MLB pitches (2002) to 3.6–7.8% depending on classifier (Statcast had cutters at 7.8% of all pitches and 14.2% of all *fastballs* by 2023), while four-seam usage fell from 64.4% (2002) to ~48% (2025). In 2026, more MLB pitchers added 2+ inches of cut to their fastballs than added 2+ inches of run. (proven)
- **Design targets for a "true" cutter:** 3–6 mph off the four-seam, +5 to +12" induced vertical break, 0–6" glove-side horizontal, spin efficiency ~35–55%, axis ≈ 11:30 for a RHP. A hard gyro "bullet" lives lower: near 0" on both axes, <20% efficiency, only 4–8 mph off the fastball. These are two different pitches with different jobs. (proven, consensus practitioner benchmarks)
- **Bridge-pitch theory is real and quantified:** BP's tunneling work shows elite pairs share a flight path for 75–80% of ball flight, with hitters committing around the last 12–15 feet. When a four-seam and slider are too far apart to tunnel, a cutter that "looks like both of them" restores the illusion — the FB and SL don't have to resemble each other, only the cutter. (promising)
- **Cutters are the most platoon-neutral pitch in baseball:** RHP cutters ran an identical .313 wOBA vs LHH and RHH in 2021; splits stay within ~50 points of wOBA across seasons, vs large slider splits. This is why cutter adds so often accompany "throw your best pitch to everyone" strategies. (proven)
- **Cutters do NOT measurably kill fastball velocity in established pros** — Sarris's 40-pitcher, 2002–2012 aging-curve study found no excess velo decline even at 20%+ cutter usage (Pettitte lost 2–3 mph *less* than expected) — but the developmental counterfactual for young/amateur arms is untested, and "40% cutter usage as a crutch" remains a legitimate coaching concern. (promising, with an honest caveat)
- **Cannibalization is usually a shape problem, not a usage problem.** Burnes 2019 is the canonical case: a 99th-percentile-spin four-seam that *cut* instead of rode got hit to a .425 AVG / .823 SLG; the fix was not deleting the cut but reorganizing around it (FF 52.5%→3.1%, cutter to 25.4%+, sinker 3.7%→37.1%) — 8.82 ERA to 2.11 and, a year later, a Cy Young. (proven case, promising as a general rule)
- **Stuff models undervalue cutters.** FanGraphs-style Stuff+ graded the average slider ~119 vs ~94 for cutters in 2021, yet cutters persistently beat four-seamers (.336 vs .349 wOBA in 2023) and sinkers on results. Cutter value is contextual — arsenal fit, zone rate, contact management — which velocity/movement-only models miss. Triton's Z-score Stuff+ has the same blind spot. (promising)
- **Biomechanically the cutter is at-or-below fastball stress:** in 31 pros (AJSM, March 2025), fastballs produced the highest peak elbow varus torque (90.1 ± 3.5 N·m) vs sliders 87.7 ± 2.7 and curveballs 87.5 ± 2.7; spin rate showed no relationship to torque. Breaking-ball-specific injury fear is largely debunked at the tissue-load level — workload and velocity are the drivers. (proven)

## 1. The Shape Space: Where the Cutter Lives

Plot every pitch in baseball on a movement chart and the cutter occupies the no-man's-land between the four-seam and the gyro slider. 2023 Statcast league averages frame the corridor: four-seamers ~7.5" arm-side / 15.8" rise; sinkers ~15.0" arm-side / 7.9" rise; cutters ~2.5" *glove-side* / 7.7" rise (proven). Simple Sabermetrics' survey puts the full cutter envelope at roughly **+5 to +15" IVB and 0–6" glove-side break** — a strikingly narrow box compared to sliders and curves, which sprawl across 20" in either direction (proven).

What makes the pitch physically distinct is its spin *composition*. A four-seam is dominated by backspin; a gyro slider is dominated by bullet spin. The cutter is the only pitch that blends **roughly equal parts backspin, gyro spin, and a small dose of side spin** (proven). Driveline's reference cutter: 87.3 mph, 2,474 rpm, **55.7% spin efficiency**, 11:50 axis, −0.9" horizontal, +11.2" vertical. RPP's practitioner benchmarks converge on the same window: **3–6 mph slower than the four-seam, ~+10" IVB, 3–5" glove-side, 35–40% (or slightly higher) spin efficiency** (proven benchmarks). The axis cue for a RHP is ~11:30 on the clock face vs a typical 1:30 four-seam axis.

Two aerodynamic notes matter for design:

1. **Gyro spin doesn't move the ball (via Magnus).** Only transverse spin does. A cutter's "cut" comes from the small side-spin component plus *loss* of arm-side run; much of its deception is what it *doesn't* do relative to the fastball (proven).
2. **Seam-shifted wake (SSW) is a wildcard on cutters.** Barton Smith's Utah State group showed seam placement can force early boundary-layer separation and move the ball independent of spin; cutters are affected but are "extremely variable" and hard to study because grips vary so much (promising). Practically: two cutters with identical Rapsodo spin profiles can move differently — trust TrackMan measured movement over inferred movement.

**For Soto:** Triton's `pitch_baselines` are per pitch_name/game_year, so the cutter baseline already floats between FB-like and SL-like populations. Consider adding a *within-pitcher* cutter descriptor: velocity delta and movement delta vs that pitcher's own four-seam, since the cutter's value is relational, not absolute. TrackMan Compete data has spin axis + efficiency; a `cutter_type` derived field (true cutter vs gyro bullet, thresholded at ~30% efficiency and IVB > 5") would cost one query.

## 2. Bridge-Pitch Theory: Why an "In-Between" Pitch Isn't a Mistake

Old-school coaching treated in-between shape as a flaw ("it's a cement mixer, pick a lane"). The tunneling literature inverted that.

Baseball Prospectus's pitch-tunnel work established the geometry: hitters must commit when the ball is roughly **12–15 feet from the plate**, and the best MLB pitch pairs share a visual flight path for **75–80% of the distance** — identical images for the first 45–48 feet (promising; BP's PreMax metric — distance between back-to-back pitches at the decision point — operationalizes it). The bridge-pitch corollary, articulated in Prospects Live's tunneling work: when a pitcher's four-seam and slider are separated by an extreme movement gap, they can't tunnel with each other — but **"the fastball and slider don't have to look the same — they just have to look like the cutter, which looks like both of them."** The cutter splits the plate and bridges the vertical and horizontal gap simultaneously (promising).

Three quantified payoffs of bridging:

- **Zone economics.** Cutters increasingly absorb slider usage precisely because the tighter, shorter shape is easier to command; FB/cutter pitchers live in the zone more and generate more swings than slider-heavy peers, *without* paying in exit velocity or hard-hit rate (promising, Just Baseball 2026 analysis). This is the "two-fastball revolution": Crochet, Skubal, Woo, Hunter Brown, and Skenes — all top-10 SPs entering 2026 — throw a second fastball ≥12–15% of the time, trading some whiffs for weak contact and deeper outings.
- **Platoon neutrality.** Ciardiello (FanGraphs, 2021): RHP cutters posted **.313 wOBA vs both LHH and RHH** — a 0.06 run/100 differential; LHP cutters split .310/.358, still tame next to the ~42-point league-wide platoon gap, and cutter splits stayed within ~50 wOBA points every year 2018–2020. Sliders, by contrast, carry large splits (proven). A cutter is the glove-side weapon you can throw to anyone — Baumann found pitchers *without* the platoon advantage threw glove-side-moving pitches 33.3% of the time in 2023, up from 23.9% in 2015.
- **Protecting the fastball.** Pitcher List's 2026 analysis frames the current cutter wave as hitter-adaptation payback: whiff rates on 18"+ IVB four-seams fell 2.5% since 2019 as hitters recalibrated to ride, so pitchers are diversifying fastball shapes. Cut fastballs both mask mediocre four-seams and attack the inner third against opposite-handed hitters (promising).

**For Soto:** Triton's deception model (`deception_score`, `unique_score`) is per-pitch; bridge value is a *pairwise* property. A cheap, shippable arsenal feature: for each pitcher-season, compute movement-space distances FF↔CT↔SL and flag "bridged" vs "gapped" arsenals (BP's Movement Spread / Surprise Factor arsenal metrics are prior art). That's also the Neptune pitch-design intake question: "show me your movement plot — is there a hole a hitter can sort by?"

## 3. True Cutter vs Hard Gyro Bullet: Two Pitches, Two Jobs

The word "cutter" hides two distinct designs. Getting athletes to pick one deliberately is most of the coaching battle.

**True cutter (fastball-family):**
- 3–6 mph off the four-seam (88–92 for a 94 mph arm)
- +8 to +12" IVB, 0 to −5" glove-side; efficiency 35–55%; axis ~11:30
- Job: called strikes, weak/mishit contact, inner-third to opposite hand, bridge the tunnel. Lives *in* the zone (Crochet's cutter: 72% strikes, ~70% GB on contact vs LHH in 2025).
- Elite exemplar: Logan Gilbert's 94th-percentile 11.5" IVB cutter; Kenley Jansen (84–93% usage every year 2010–2018) and Mariano Rivera (87.5% usage in his final four seasons, career 2.21 ERA / 1.00 WHIP, ~700–1,000 broken bats by varying estimates) prove a great one can *be* the fastball (proven cases).

**Hard gyro bullet (breaking-ball-family):**
- 4–8 mph off the fastball, typically 83+ mph (often 87–92 for big arms)
- Movement near 0/0 ("spinning football"), efficiency <20–25%, visible red-dot gyro spin
- Job: chase and whiff pitch off the fastball tunnel; drops late relative to the FB plane purely via velocity loss + no lift. Fills a *vertical* gap where the true cutter fills a *horizontal* one (practitioner consensus, promising).
- Exemplar: Cole Ragans splitting his hard breaking ball into a low-90s cutter *and* an upper-80s gyro slider — two distinct jobs from one movement neighborhood (Brozdowski).

**The velocity-efficiency law that separates them (Driveline, n=240 cutters):** nearly all cutters *gain* spin efficiency as velocity rises — Burnes' cutter gained **+5.5% efficiency per +1 mph** — while curveballs almost universally lose efficiency with velocity and sliders (n=734) split (promising). Design implication: you cannot usually throw a gyro bullet "harder" and keep it a bullet; past a velocity threshold the pitch self-converts into a true cutter (more backspin, more ride, less depth). Gavin Williams demonstrated it live in 2024: his 85 mph slider (1" IVB, 3–4" sweep) became a 91.6 mph cutter (7" IVB, 0" sweep) — a classic "throw your breaking ball harder" morph, and in his case a *downgrade* flag because it broke his platoon-neutral arsenal (case study, plausible caution).

Classification chaos is the corollary: Statcast, BIS, and pitchers themselves disagree on cutter-vs-slider labels around the ~88 mph / 20% efficiency boundary. Emmanuel Clase's "cutter" — **98.9 mph average, 102 top, ~2,600 rpm, .285 wOBA / .277 xwOBA against in 2025** — is really a third thing: a max-velo cut-ride pitch that functions as a primary fastball (proven case).

**For Soto:** Triton Stuff+ z-scores a pitch against its *label's* population. A hard gyro bullet mislabeled "cutter" gets punished on movement z-scores; a true cutter mislabeled "slider" gets punished on velo. Before trusting cutter Stuff+ values, add the efficiency/IVB sub-classification above — it will likely explain a chunk of cutter residuals vs run value.

## 4. Complement or Cannibalize: The Four-Seam Interaction

The core fear — "the cutter will ruin my fastball" — decomposes into three separate claims worth separate verdicts.

**Claim 1: Cutters bleed fastball velocity.** Sarris (FanGraphs, 2012) tested 40 qualified starters at 20%+ cutter usage (Pettitte, Halladay, Lester, Buehrle, Danks, Haren…) against aging curves and found **no excess velocity decline**; Pettitte lost 2–3 mph *less* than expected (promising — but survivorship-limited: prospects whose velo died with a cutter never reach the sample, a counterfactual Sarris himself flagged). The surviving kernel of the old warning is a usage-dose concern for developing arms: the quoted coaching heuristic that "a cutter thrown 40% of the time for a young power pitcher can become a crutch, then your velocity drops" is plausible but unproven. Practical rule: cap cutter usage in development-phase athletes (~15–20%) and monitor four-seam velo in-season; in vets, let results dictate (plausible).

**Claim 2: The cutter's grip/intent bleeds into the four-seam.** This is the real, observable failure mode — and it cuts both ways. Burnes 2019: elite-spin four-seam that cut instead of rode → redundant with his slider, dead-zone-adjacent shape → .425/.823 against, 17 HR in 49 IP, 8.82 ERA. The fix was leaning *into* the cut: FF 3.1%, cutter 25.4%+ (later his majority pitch), sinker 37.1% → 2.11 ERA in 2020, Cy Young in 2021 (proven case). The inverse failure — a rider who starts cutting accidentally after adding a cutter — shows up as lost IVB and added glove-side on the four-seam; Williams' 2024 fastball drifted 1" of ride and 2" of run in the same window he morphed his slider (plausible pattern; monitor, don't assume).

**Claim 3: A cutter shrinks the FB's perceived movement gap and makes both easier to hit.** Mostly debunked as a blanket claim: cutters run *better* results than four-seamers league-wide (.336 vs .349 wOBA in 2023) and the two-fastball cohort shows no contact-quality penalty. The true risk case is narrow: an elite-ride four-seam (17–19" IVB, flat VAA) whose whiffs come from hitters sitting under it — giving that hitter a 90 mph, 10" IVB look in the same tunnel can *calibrate* him to the ride. Diagnosis by profile:

- **Add a cutter when:** the four-seam is dead-zone (movement ≈ arm-slot expectation), low-ride from a lower slot, getting damaged despite good velo, or the FB↔SL movement gap is un-tunnelable; or the athlete needs a platoon-neutral glove-side option because his slider splits are ugly (promising, multiple practitioner sources).
- **Be cautious when:** the four-seam is a top-decile ride/flat-VAA whiff pitch and the athlete already owns a good gyro slider — the marginal bridge value is small and the shape-bleed risk is real; consider the gyro bullet (vertical gap-filler) instead of a true cutter (plausible).
- **Iowa Baseball Managers' "flat zone" rule:** whatever you design, avoid equal parts VB and HB — fastball-family pitches with matched vertical and horizontal break present the flattest, most barrel-able plane. Effective cut *creates ride relative to slot expectation*; ineffective cut just sinks and runs like every other low-slot ball (promising).

**For Soto:** this is a Triton query, not a debate. With 7.4M pitches: bucket four-seams by (IVB, VAA-proxy, velo), condition on same-pitcher cutter existence/usage, and measure FF run-value delta. That's the in-house answer to "when does a cutter cannibalize" — nobody public has done it convincingly at scale. Also directly relevant to Trevor's own history: a late-career reliever adding a cutter (the classic vet move per Sarris's cohort) is exactly the demographic where the evidence says velo risk is nil.

## 5. Building One: Grips, Cues, and Anatomy

Consensus build process (Driveline, Tread, RPP):

- **Start from the fastball, not the slider.** Driveline's primary grip (their "CT 1," used by ~80% of athletes): four-seam-like grip with index/middle fingers together on seams, **offset toward the pinky side**, thumb under, ring finger stabilizing. Cue: *"Think fastball — pull down on the seams; yank the ball down as hard as possible."* Alternatives set the fingers between seams (CT 2) or up near the horseshoe (CT 3) for more cut at some velo cost (proven practitioner method).
- **Cue menu (RPP), because responders vary:** "trust the grip, throw it like a fastball" → "middle-finger pressure" → "come off the side of it" → "throw a football spiral," escalating intervention only if the shape doesn't appear. Release intent: bottom-right quadrant of the ball (RHP) for backspin-plus-gyro.
- **Respect the athlete's pronation/supination bias (Tread).** Natural supinators often cut the ball for free (and fight to create ride); natural *pronators* need help: offset the grip further, leverage the middle finger on a seam, reduce index-finger pressure ("baby spike"). Shape target follows the goal — more depth for whiffs, more velo for weak contact (promising, practitioner-grade).
- **Exploit the velocity-efficiency dial.** Because cutter efficiency rises ~linearly with velo (Burnes: +5.5%/mph), the same grip thrown with more intent drifts fastball-ward and with less intent drifts slider-ward. Very slight manipulations can move a cutter's model grade 25 points without it becoming a different pitch — which is also why stuff models struggle with it (promising).
- **Verify with measured movement, not spin.** SSW variance on cutters means Rapsodo-inferred break can lie; confirm shape on TrackMan measured break and, ideally, high-speed video of seam orientation (promising).

**Health note:** the best current biomechanics says the cutter/slider family is *not* an elevated elbow load. AJSM March 2025 (31 pros, 480 Hz mocap + TrackMan): peak elbow varus torque — fastballs 90.1 ± 3.5 N·m > sliders 87.7 ± 2.7 ≈ curveballs 87.5 ± 2.7 > changeups 81.3 ± 2.4; fastballs also highest in loading rate and cumulative torque; **spin rate uncorrelated with torque** (proven). The companion high-school study replicated it: fastballs highest torque/loading; injury prevention should target workload and physical development, not pitch-type avoidance (proven). The youth-curveball panic is effectively debunked at the load level; the honest residual concern is that supinated releases may load tissue differently in ways net-joint torque misses (plausible).

**For Soto / Neptune:** cutter installs are the highest-floor pitch-design service Neptune can sell — fastball-adjacent motor pattern (fast learning curve), fastball-or-lower elbow load, command-friendly shape, platoon-neutral. Protocol: (1) assess pronation/supination bias + current FB shape on TrackMan, (2) pick true-cutter vs gyro-bullet target from the arsenal-gap analysis, (3) grip ladder CT1→CT3, cue menu, (4) 2-week shape-stabilization block with measured-movement gates (velo delta 3–6, IVB > 8", HB 0 to −5" for true cutter), (5) monitor the four-seam's IVB/velo weekly for bleed.

## 6. Case-Study File: Arsenal Transformation via Cutter

| Pitcher | Change | Before → After | Verdict |
|---|---|---|---|
| **Mariano Rivera** | Accidental cutter (1997) became identity | 87.5% usage final 4 yrs; career 2.21 ERA, 1.00 WHIP, ~44 broken bats in 80.2 IP (2001) | Proof one elite cutter can be an entire arsenal |
| **Kenley Jansen** | Converted catcher; cutter 84–93% usage 2010–2018 | 90.3% usage over a 4-yr peak — higher than Rivera | Ditto; also proof of ride+cut ("cut-ride") archetype |
| **Corbin Burnes** | 2019→2020 rebuild: cutting FF scrapped, cutter promoted | 8.82 ERA → 2.11; FF 52.5%→3.1%; CT to 25.4%+ (later ~50%+); Cy Young 2021 | Canonical "reorganize around your natural shape" |
| **Emmanuel Clase** | Max-velo cutter as primary | 98.9 avg / 102 max mph, 2,600 rpm; .285 wOBA 2025 | The cutter-as-fastball ceiling |
| **Clay Holmes** | RP→SP conversion (Mets 2025) added cutter + FF + CH to SI/SL/sweeper | 165.2 IP, 3.55 ERA; cutter +4 run value at only 8.3% usage, .173 xBA/.232 xSLG | Cutter as *bridge glue* enabling a starter's pitch count |
| **Garrett Crochet** | Cutter ~37% vs LHH (2025 Red Sox) | 72% strikes, ~70% GB on contact; top-3 SP | Two-fastball contact-management model |
| **Gavin Williams** | 85 mph SL morphed to 91.6 mph CT (2024) | +6.6 mph, 1"→7" IVB, lost sweep; analyst stock-down | Cautionary: velocity self-converts shape; platoon profile broke |
| **Logan Gilbert / 2026 wave** (Kikuchi, Sasaki, Chandler, McGreevy) | Added cut to the four-seam itself | Gilbert: 8.5"→3.9" HB, Stuff+ 96→102; Kikuchi 103→118; but Chandler 108→93, McGreevy 81→71 | Cut-ride conversion is athlete-specific — roughly half the 2026 adders got *worse* by Stuff+ |

The last row is the load-bearing lesson: the 2026 cut-fastball wave produced both winners and losers in the same spring. Cut helps when it moves a fastball *out* of the dead zone or unlocks the arsenal; it hurts when it costs ride the pitcher needed (promising).

## 7. Benchmarks & Implementation Cheat Sheet

**True cutter targets (MLB-caliber; scale down ~2–3 mph per level to HS):**
velo = FB − (3–6 mph) · IVB +8–12" · HB 0 to −5" (RHP) · efficiency 35–55% · axis ~11:30 · zone% high, ~60%+ strikes from day one.

**Gyro bullet targets:** velo = FB − (4–8 mph), ≥83 mph · IVB −2 to +4" · HB ±2" · efficiency <20–25% · chase/whiff usage, below-zone tunnel off the FB.

**Red flags during an install:** four-seam IVB down >1.5" or run up >2" from baseline; FB velo down >1 mph without workload explanation; cutter drifting to equal VB/HB ("flat zone"); usage creeping past ~35% in a developing arm.

**For Soto — concrete build list:**
1. `cutter_type` sub-classifier (true vs bullet) on `pitches` + `compete_pitches` via efficiency/IVB thresholds.
2. Pairwise arsenal-spacing metric (FF↔CT↔SL movement distances; flag un-bridged gaps) surfaced on the pitching dashboard.
3. The cannibalization study from §4 on the 7.4M-row table — publishable differentiation for both Triton and Neptune marketing.
4. Neptune cutter-install protocol (§5) as a templated 2-week block with TrackMan gates; it's the cheapest high-confidence pitch-design win in the service menu.

## Sources

1. Driveline Baseball — How to Throw a Cutter (2020): https://www.drivelinebaseball.com/2020/07/how-to-throw-a-cutter/
2. Driveline Baseball — Optimizing Breaking Ball Shape Through Data-Driven Pitch Design, Part II (2021): https://www.drivelinebaseball.com/2021/10/optimizing-breaking-ball-shape-through-data-driven-pitch-design-part-ii/
3. Eno Sarris, FanGraphs — Do Cutters Kill Fastball Velocity? (2012): https://blogs.fangraphs.com/do-cutters-kill-fastball-velocity/
4. Michael Baumann, FanGraphs — I Have Seen the Fastball of the Future, and It Is a Cutter (2023): https://blogs.fangraphs.com/i-have-seen-the-fastball-of-the-future-and-it-is-a-cutter/
5. Carmen Ciardiello, FanGraphs — The Cutter: A Platoon Neutral Offering? (2021): https://blogs.fangraphs.com/the-cutter-a-platoon-neutral-offering/
6. Shaan Donohue, Just Baseball — Welcome to the Two-Fastball Revolution (Feb 2026): https://www.justbaseball.com/mlb/welcome-to-the-two-fastball-revolution/
7. Nate Schwartz, Pitcher List — The Cut Fastball is Back in Style (Apr 2026): https://pitcherlist.com/the-cut-fastball-is-back-in-style/
8. Simple Sabermetrics — "Did That Cut?" An Intro to Cutters: https://simplesabermetrics.com/blogs/simple-sabermetrics-blog/did-that-cut-an-intro-to-cutters
9. Baseball Prospectus — Introducing Pitch Tunnels (PreMax): https://www.baseballprospectus.com/news/article/31030/prospectus-feature-introducing-pitch-tunnels/
10. Prospects Live — The Mystic Art of Pitch Tunneling: https://www.prospectslive.com/the-mystic-art-of-pitch-tunneling/
11. RPP Baseball — How to Throw a Cutter (Grips, Cues, Movement, Types): https://rocklandpeakperformance.com/how-to-throw-a-cutter/
12. Tread Athletics — cutter-for-pronators cues (grip offset, middle-finger seam leverage): https://www.tiktok.com/@tread_athletics/video/7465726196089638187
13. Hodakowski et al., AJSM (Mar 2025) — Pitch Types and Their Influence on Elbow Varus Torque and Spin Rate in Professional Baseball Pitchers: https://pubmed.ncbi.nlm.nih.gov/39836440/
14. Hodakowski et al., AJSM (2025) — The Effect of Pitch Type on Elbow Biomechanics in High School Pitchers: https://pubmed.ncbi.nlm.nih.gov/41137446/
15. CBS Sports — How Brewers righty Corbin Burnes caught fire with revamped arsenal in 2020: https://www.cbssports.com/mlb/news/how-brewers-righty-corbin-burnes-caught-fire-with-revamped-arsenal-in-2020/
16. MLB.com — Why Emmanuel Clase's cutter is one of MLB's most unhittable pitches: https://www.mlb.com/news/why-emmanuel-clase-cutter-is-one-of-most-unhittable-pitches-in-mlb
17. Lance Brozdowski (Substack) — Gavin Williams Changed His Slider (Jul 2024): https://lancebroz.substack.com/p/gavin-williams-cutter-ryan-pepiot-mechanics
18. Metsmerized — 2025 Report Card: Clay Holmes: https://metsmerizedonline.com/2025-report-card-clay-holmes-rhp/
19. Casey Day, Iowa Baseball Managers — The Difference Between Effective and Ineffective Cut on Fastballs: https://medium.com/iowabaseballmanagers/the-difference-between-effective-and-ineffective-cut-on-fastballs-cb1f09734bdc
20. Baseball Aero (Barton Smith) / Wikipedia — Seam-Shifted Wake: https://en.wikipedia.org/wiki/Seam-shifted_wake and https://baseballaero.com/2020/02/17/a-zero-gyro-seam-shifted-wake-pitch-the-looper-post-49/
21. Baseball Prospectus — Introducing BP's New Arsenal Metrics (Movement Spread, Surprise Factor): https://www.baseballprospectus.com/news/article/96026/introducing-new-arsenal-metrics/
22. RotoWire — MLB Pitch Speed & Usage Trends 2002–2025: https://www.rotowire.com/baseball/article/mlb-pitch-speed-and-usage-2002-to-2025-94262
