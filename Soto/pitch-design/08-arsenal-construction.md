---
title: Arsenal Construction — Pitch Mix Theory, Movement Coverage, and How Many Pitches You Actually Need
domain: pitch-design
tags:
  - arsenal-construction
  - pitch-mix
  - platoon-splits
  - movement-profiles
  - usage-optimization
  - times-through-order
  - pitcher-archetypes
  - pitch-design
sources_reviewed: 22
last_updated: 2026-07-19
---

# Arsenal Construction — Pitch Mix Theory, Movement Coverage, and How Many Pitches You Actually Need

## TL;DR

- **Repertoire diversity directly shrinks the times-through-order penalty**: starters throwing >75% fastballs lose ~47 points of wOBA by the third time through the order; starters throwing <50% fastballs lose only ~18 points (Lichtman, 2002–2012 sample). Arsenal size is a workload/role decision, not just a stuff decision. (proven)
- **Platoon splits are pitch-shape-driven and quantifiable**: sinkers (~1.08 RV/100 split) and sweepers/slurves (~1.12) are the most platoon-sensitive pitches; changeups (~0.01 to −0.77) and 12–6 curves are platoon-neutral to reverse. A sweeper that's worth −0.94 RV/100 vs same-handed hitters was roughly neutral (−0.05) vs opposite-handed ones in 2019–22 data. (proven)
- **Every functional arsenal needs three jobs covered, not N pitches**: a primary in-zone pitch, a secondary in-zone (strike-stealing/bridge) pitch, and an out-of-zone chase/whiff pitch — with arm-side and glove-side variants determining platoon coverage (Whitelaw's PP/SiP/SoP framework). Low-leverage relievers can compress this to two pitches; starters generally can't. (promising)
- **Usage optimization is real, cheap, and underexploited**: ESPN's 2025 Nash Score analysis found pitchers like Tommy Kahnle (78% changeup usage, +3.79 RV) and Merrill Kelly (23% usage on a +2.96 RV changeup) far from equilibrium — value available with zero physical change. Modeling work suggests usage reallocation (e.g., 50%→26% four-seam vs LHB) can rival a 2–4 pt whiff gain from shape redesign. (promising)
- **Arsenals are the biggest they've ever been**: MLB's usage-weighted "pitch palette" hit a record in 2025; Seth Lugo and Yu Darvish carry ~10 pitch types; offspeed usage climbed from 11% (2008) to 14.1% (2025), and league fastball usage fell below 50% for the first time in 2022 (47.6% by 2023). (proven)
- **Biomechanical bias should pick the pitches**: pronators default to the "pronator's triangle" (ride four-seam + changeup/splitter + gyro slider); supinators get superior seam-shifted-wake breakers but weaker four-seam backspin — and the 2024–25 kick-change wave exists specifically to give supinators a changeup. Fit the pitch to the arm, not the trend. (promising)
- **A "dead zone" primary is survivable only with compensators**: in 100k+ D1 fastballs, generic movement + generic release predicted poor outcomes; survival paths were elite velocity, extreme approach angles/release, edge% command, and first-pitch-strike leverage. Arsenal fit can rescue a mediocre shape — sometimes. (promising)
- **By level: 2 commanded pitches wins in youth ball, 3 in HS, 3–4 usable in college, 4–6 with platoon-specific splits at pro level.** Adding a pitch before commanding the previous one is the classic amateur failure mode. (plausible, consensus practitioner guidance)

## 1. What an Arsenal Is For: Jobs, Not Pitch Counts

The naive question — "how many pitches does he have?" — is the wrong unit of analysis. The functional question is **which jobs are covered**. Ben Whitelaw's arsenal-construction framework (2024–25, refined across two essays) is the cleanest public articulation (promising):

- **PP (Primary Pitch)** — the most-used in-zone pitch, regardless of shape or velocity. Usually a fastball, but not necessarily (Crochet's cutter, Kahnle's changeup).
- **SiP (Secondary in-zone Pitch)** — a second pitch the pitcher can land for strikes at 50%+ in-zone rates; the "bridge" that keeps counts alive and protects the PP.
- **SoP (Secondary out-of-zone Pitch)** — the chase/whiff weapon, lowest command demand, highest swing-and-miss.

Each slot then carries an arm-side (a) or glove-side (g) tag, because *direction of movement is what determines platoon behavior* (§3). A high-volume starter wants opposite-direction movement between PP and SiP and, ideally, both an arm-side and glove-side option somewhere in the set. Whitelaw's worked examples: Jared Jones (aPP + gSiP + aSiP + gSoP = platoon-flexible), and Calvin Faucher, whose 2024 reorganization into aPP + gSiP-as-bridge + gSoP coincided with a FIP drop from 5.59 to 3.36 (promising — single-case, but mechanism is coherent).

Two other jobs frameworks converge on the same answer:

- **Three analytical questions** (Whitelaw v2): What difficult angles can the pitcher create? How does he disrupt timing? Can he locate where it matters? An arsenal missing any one of the three has a hole regardless of pitch count.
- **Four utility channels** (Resnick's D1 logistic-regression work, 100k+ Yakkertech fastballs): in-zone whiffs, out-of-zone chases, called strikes, contact management. Different shapes win different channels — flat VAA + velo wins in-zone whiffs; sub-5" IVB sinkers win barrel suppression; *no single pitch wins all four* (promising).

**For Soto:** Triton's Stuff+ (velo/movement/extension Z-scores) grades pitches in isolation. This framework says the marginal value of a pitch is conditional on slot coverage. A cheap Triton upgrade: classify each pitcher's arsenal into PP/SiP/SoP × arm-side/glove-side from existing pitch-level data (in-zone rate, usage, whiff rate) and flag uncovered slots on the pitching dashboard. That's an "arsenal completeness" feature no Stuff+ number carries.

## 2. Movement-Plot Coverage: East-West, North-South, Hybrid

Plot a pitcher's arsenal on the horizontal-break × induced-vertical-break plane and you get his coverage map. Practitioner consensus (PitchingCoachU, Tread, Driveline) sorts pitchers into three profiles (promising):

- **North-South**: big vertical separation, small horizontal spread. Ride four-seam up + curveball/splitter down. Prototypes: Glasnow, Rodón. Naturally **platoon-neutral** — vertical movement reads the same from both batter's boxes — which is why N/S profiles skew toward starters.
- **East-West**: big horizontal separation. Sinker arm-side + sweeper/slider glove-side. Prototypes: Logan Webb, Manaea. Dominant vs same-handed hitters, structurally exposed vs opposite-handed ones (the ball moves *toward* the opposite-side barrel). Mitigation = adding a cutter, four-seam, or changeup to reclaim a neutral lane.
- **Hybrid**: the most common profile — an east-west attack vs same-side hitters and a north-south attack vs opposite-side hitters, from the same arm. Wheeler and Sandoval are the archetypes. This is effectively the platonic starter's arsenal: it *is* platoon adjustment, encoded in shape.

Core plot-geometry principles that recur across Driveline, Rapsodo, and RPP material:

1. **Separation between pitch types** — maximize distance between cluster centers so pitches force different swing decisions; a changeup's value is its movement *and velocity* separation off the fastball (proven at the correlational level in stuff models).
2. **Tightness within pitch types** — small clusters (consistent shape pitch-to-pitch) correlate with command and predictable tunnels (plausible).
3. **Avoid the dead zone** — the middle of the plot (≈1:30 spin direction for RHP, equal parts hop and run, unremarkable total movement) is where fastballs get barreled. Resnick's D1 study operationalized this as "genericness" — distance from median movement *and* release — and found generic fastballs underperform in every utility channel (promising). Survival paths for a dead-zone primary: elite velo, extreme release/approach angles, elite edge% across the whole arsenal, and living ahead in counts (first-pitch strike% was a significant predictor of dead-zone fastball xwOBA).
4. **Coverage beats magnitude** — two pitches 20" apart on the plot beat three pitches stacked within 6" of each other. The 2023 league data shows why pitchers eat a bad standalone pitch for coverage: cutters posted a .335 wOBA (worst on record) yet gained the most usage of any pitch (+0.8 pts), because they bridge the fastball-slider tunnel (proven as a usage fact; the tunneling payoff is promising).

**For Soto:** the Compete session browser already has TrackMan HB/IVB. Neptune's assessment report should render each athlete's movement plot with (a) cluster ellipses, (b) the dead-zone region shaded, and (c) uncovered quadrants annotated — that single graphic is the arsenal-construction conversation with a HS/college athlete. Trivial to build on `compete_pitches`.

## 3. Platoon-Neutral vs Platoon-Specific Weapons

This is the best-quantified part of arsenal theory. Max Marchi's multilevel-model estimates (THT, PITCHf/x era) of platoon split size in RV/100 pitches, RHP perspective (proven — replicated directionally in every subsequent public study):

| Pitch | Platoon split (RV/100, adj.) | Read |
|---|---|---|
| Slurve/sweeper-type | **1.12** | most platoon-specific |
| Sinker | **1.08** | most platoon-specific fastball |
| Four-seam ("heater") | 0.80 | meaningful normal split |
| Slider | 0.57 | normal split |
| Cutter | 0.41 | mild |
| Power changeup | 0.01 | neutral |
| Tight curve | −0.13 | neutral/slight reverse |
| Roundhouse curve | −0.69 | reverse |
| Straight change | −0.77 | reverse |

Modern confirmations with numbers:

- **Sweepers** (Clemens, FanGraphs 2022): vs same-handed contact .325 wOBA (vs .357 for regular sliders), but the whole edge evaporates opposite-handed (.370 for both); 2019–22 run values were −0.94/100 same-handed vs −0.05 opposite-handed. A sweeper is a same-side wipeout pitch and roughly a league-average pitch the other way (proven).
- **Sinker vs changeup** (Sarris, FanGraphs 2014): nearly identical movement profiles, but RHP sinkers allowed a .767 OPS to LHB vs .713 for changeups — a 54-point gap driven by velocity separation and timing disruption, not shape (proven).

Construction rules that fall out:

1. **Platoon-specific weapons** (sinker, sweeper, slurve): elite same-side, liabilities opposite-side. Fine as a *whole identity* for a matchup reliever; for a starter they must be paired with a neutralizer.
2. **Platoon-neutral weapons** (changeup/splitter, deep curve, cutter, ride four-seam up): the pitches that make a starter viable against the ~50%+ of PAs that come opposite-handed. The splitter boom (16.5% of all changeups in 2023, up from 12.2%) and the kick-change wave are both, at root, platoon-neutralizer acquisition programs (proven trend, promising mechanism).
3. **The minimum viable starter kit** is therefore: one same-side kill pitch + one platoon-neutral secondary + a primary that plays to both sides. Depth beyond that buys TTO protection (§5), not platoon protection.

**For Soto:** `pitcher_season_command`/report tooling should carry a per-pitch **platoon delta** (RV/100 or wOBA vs L/R) with a small-sample shrinkage prior seeded from the Marchi-style league values above — 7.4M Statcast rows is more than enough to re-fit these priors in-house by pitch_name × handedness, and it's a natural Reports Builder tile. For Neptune athletes (tiny samples), *assign* the league prior by pitch shape rather than measure it.

## 4. Usage Optimization vs Shape Optimization

Two levers improve an arsenal: change what the pitches *are* (shape/design) or change how often each is *thrown* (usage). The evidence says both matter and usage is the cheaper lever.

**The game-theory frame.** Pitch selection is a mixed-strategy equilibrium problem: at optimum, the marginal run value of every pitch equalizes, because overusing the best pitch degrades it through anticipation (plausible as a strict model — real hitters adapt, counts and fatigue confound; the equilibrium is a compass, not a GPS). Kovash & Levitt's well-known finding that MLB pitchers deviate from minimax (fastballs over-thrown relative to outcome value) anchors the empirical case (promising).

**2025 evidence — the Nash Score** (ESPN, Statcast + FanGraphs linear weights, 3-yr weighted): dispersion between a pitcher's per-pitch run values, where 0 = equilibrium. Findings:

- Well-optimized: Jake Irvin 0.05 (FB 35%/+0.13 RV, CB 33%/−0.13), Crochet 0.06, elite relievers ~0.01 (Sewald, Poche).
- Badly optimized: Ronel Blanco 4.36 (38% on a −2.44 RV four-seam while his +2.40 slider sat at 32%), Merrill Kelly 3.9 (+2.96 RV changeup thrown only 23%), Kahnle 14.24 (78% changeup at +3.79 — even the best pitch in baseball is past its equilibrium share at 78%). Even Skenes graded 1.82 while leading MLB in WAR (promising — descriptive, not causal).
- Relievers sit closer to equilibrium than starters — fewer pitches, one time through, simpler optimization problem (promising).

**Shape-vs-usage head-to-head** (Uram Analytics, 2025, counterfactual modeling on Statcast): substituting a biomechanically-plausible improved pitch shape (donor pitchers matched on release vector) yielded typical whiff gains of **2–4 percentage points**; but Monte Carlo usage re-optimization (1,000 sims × 5) on the *existing* arsenal produced comparable modeled value — e.g., Shane Smith cutting four-seam usage 50%→26% vs LHB for movement-velocity-space separation. The author's honest caveat is the field's central open problem: "a pitch has even more value when it enhances the rest of the repertoire," and arsenal-level interaction modeling "is still very hard to incorporate in a way that reliably improves predictions" (promising).

**The league has been running this experiment for 15 years**: fastball usage fell every year to below 50% in 2022 (47.6% in 2023) because fastballs sit at the top of the wOBA-allowed table; per-pitch offspeed run values stay strong *partly because* they aren't overexposed (proven as trend; the equilibrium interpretation is promising). The practical sequencing for a development block: **fix shape first** (it changes what equilibrium is available), **then re-optimize usage** (it harvests the shape), and never grade a usage plan on per-pitch RV alone — per-pitch RV of a rarely-thrown pitch is inflated by its own scarcity.

**For Soto:** a "Nash gap" tile is nearly free in Triton — per-pitch RV dispersion weighted by usage, from the `pitches` table. For Neptune, the coaching translation is blunt and level-appropriate: chart the athlete's usage% vs results% by pitch and ask "why does your best pitch have the lowest usage?" That one chart is most of an offseason plan for a college arm.

## 5. Arsenal Size, the TTO Penalty, and Role

**The TTO evidence** (Lichtman, SABR/BP, 2002–2012 starters) is the strongest quantitative argument for arsenal depth (proven):

- Starters throwing **>75% fastballs**: ~**47-point wOBA** penalty by the 3rd time through the order.
- Starters throwing **<50% fastballs**: ~**18-point** penalty.
- Companion analyses: one-pitch-dominant pitchers lose ~36 points by TTO3 vs ~24 for four-pitch pitchers.

Mechanism: familiarity. Every additional distinct look reduces the batter's ability to solve timing and shape on re-exposure. Baseball Prospectus's 2025 arsenal metrics (Sutton-Brown) formalize this: **Pitch Type Probability** (how identifiable the incoming pitch is), **Movement Spread**, **Velocity Spread**, and **Surprise Factor**. Pitches with above-average arsenal-metric values showed worse batter decision rates and a *muted familiarity penalty*, and whiff rates rose on "surprising" pitches even against familiar batters (promising — new metrics, one shop). Leaders are instructive: Lorenzen (least detectable), Waldron (knuckleball = max surprise), Bassitt (max spread) — none of them stuff monsters, all of them rotation survivors.

**Role math falls out directly:**

- **Reliever**: faces each hitter once; TTO protection worthless; platoon exposure manageable via deployment. Equilibrium is 2 pitches thrown hard with max shape (Sewald: 58/41 FB/SL at Nash 0.01). A third pitch is only worth it if it's a platoon-neutralizer for full-inning work.
- **Bulk/swing**: 3 pitches, at least one platoon-neutral.
- **Starter**: 4+ distinct looks with both movement directions covered; the 5th/6th pitch is a TTO and count-flexibility investment even at mediocre standalone RV (the cutter lesson, §2).

**And the league agrees**: 2025 set the record for usage-weighted arsenal size ("pitch palette"), with Lugo and Darvish carrying ~10 pitch types and the only functional 7+ palettes among starters; offspeed share rose from 11% (2008) to 14.1% (2025) (proven). The diffusion engine is technological: Edgertronic + TrackMan feedback loops, stuff models to validate a new pitch in a bullpen instead of a season, and biomechanical profiling to pick the right variant per arm (Andrews, FanGraphs 2025) (proven as description).

## 6. Fit the Arm: Pronators, Supinators, and the Kick-Change Lesson

Which pitches an athlete *can* make elite is constrained by forearm bias (promising — strong practitioner consensus, thin peer-reviewed base):

- **Pronators** → the "pronator's triangle" (Tyler Zombro, Tread): ride four-seam + changeup/splitter + gyro slider. Clean vertical arsenal, but power-and-sweep breaking balls are hard for them.
- **Supinators** → superior seam-shifted-wake breakers, natural cut/sweep families, broader breaking-ball variety — but lower active-spin four-seamers and, historically, *no changeup*.
- **"Spin doctors"** (Pitcher List): rare both-spectrum arms — 80–89% spin-efficiency four-seamers *plus* big breakers with small velo separation (King, Woo, Wheeler; Gray and Schmidt as extreme supinators).

The **kick-change** (spiked-middle-finger changeup; slider-adjacent velocity, splitter-like drop via a forward-tilted axis rather than spin-kill) went from curiosity to "pitch of 2025" precisely because it solves the supinator's missing-slot problem — Bannister's Giants and a wave of adopters (Muñoz, Pablo López, Clay Holmes, Leiter, Davis Martin, Gausman-adjacent Toronto arms) (promising). The generalizable lesson for arsenal construction: **when a slot is uncovered, search the space of variants compatible with the athlete's bias** (splitter vs kick-change vs straight change; gyro vs sweeper vs slurve) rather than forcing the textbook grip. Sweeper history teaches the complementary caution: league sweeper share ran 2.28% (2021) → ~7.5% (2025) and is now flattening/declining as teams re-learned its platoon bill (§3) — chasing the trend pitch without checking arsenal fit is how you buy a same-side-only weapon you didn't need (proven trend, promising interpretation).

**For Soto:** Neptune's intake battery should include a pronation/supination screen (cheap: observed breaking-ball spin efficiency + a few grip trials on TrackMan) and route pitch-design recommendations through it. This is exactly the "assessment → programming" spine the facility positioning calls for, and it's a differentiator a cage barn can't fake.

## 7. Arsenal Archetypes by Role

Synthesizing the clustering work (MLB Data Warehouse's four failure/success clusters; PitchingCoachU's movement profiles; the role math in §5) into buildable archetypes:

**Starters**
1. **N/S power starter** (Glasnow, Rodón, Skubal-ish): ride FB up + downer breaker + offspeed. Platoon-neutral by construction; needs velo/carry to work; changeup is the third-pitch unlock (Skubal: 28% usage, +0.62 RV in 2025).
2. **E/W contact manager** (Webb, Manaea): sinker/sweeper core, sub-10" IVB, barrels suppressed; *must* carry a changeup or four-seam/cutter for opposite-handed lanes; lives on edge% and first-pitch strikes.
3. **Hybrid/two-mix starter** (Wheeler, Sandoval): east-west same-side, north-south opposite-side — the modern default and the highest-floor template.
4. **Kitchen-sink/low-detectability starter** (Lugo, Darvish, Bassitt, Lorenzen): 6–10 medium pitches, wins on Movement/Velocity Spread and TTO resistance rather than any single plus offering.

**Relievers**
5. **Two-pitch max-stuff RP** (Sewald/Poche template): FB + one wipeout breaker at near-Nash usage; platoon risk absorbed by leverage matching.
6. **Platoon-specific weapon RP**: sweeper/sinker same-side monster (e.g., Bender's 54% slider) — highest per-inning ceiling, narrowest deployment.
7. **Reverse-mix RP** (Kahnle): secondary-as-primary (60–80% changeup/splitter). Works because one-time-through removes the familiarity tax that would sink it in a rotation.

Failure clusters to screen for (MLB Data Warehouse) (promising): **"Lacking a fastball"** (elite secondaries orphaned by a .400+ xwOBA primary — Gavin Stone case: 23.5% SwStr slider, 19.3% change, 40% strike fastball) and **"Lacking a complement"** (73% fastball-family usage with no putaway pitch — Varland case). Both are slot diagnoses, not talent diagnoses — which is why they're fixable.

## 8. How Many Pitches by Level

Consensus practitioner guidance (Driveline, Tread, Rapsodo, RPP) plus the pro evidence above (plausible→promising; no RCTs exist at amateur levels):

| Level | Usable pitches | Construction priority |
|---|---|---|
| Youth (≤13) | **2**: fastball + changeup | Command + athleticism; breaking-ball intro is an arm-care/skill-sequencing call, not an arsenal call |
| High school | **3** (master 3–4 max): FB + one breaker + changeup | Order: fastball foundation → breaking ball → offspeed. Tunnel quality > pitch count (Rapsodo). A commanded 3-mix out-recruits an uncommanded 5-mix |
| College (D1) | **3–4** with command of 3 | Shape identity emerges: pick N/S vs E/W lane; kill dead-zone fastballs (Resnick thresholds: flat VAA + velo for whiffs, <5" IVB for ground balls — the middle is the worst place) |
| MiLB/pro starter | **4–6**, both movement directions, ≥1 platoon-neutral secondary | TTO-driven; 5th/6th pitch justified at neutral standalone RV |
| MLB reliever | **2–3** at max intent | Add a 3rd only as platoon insurance |

The universal failure mode at amateur levels is *addition before command*: a new pitch that can't be landed for a strike occupies zero slots (it's neither SiP nor a credible SoP because hitters never have to honor it). The universal underexploited move at pro level is *usage reallocation* (§4), which costs nothing.

**For Soto:** Neptune's age bands (once confirmed) should hard-code this table into programming templates — the arsenal-expansion conversation with a 15-year-old and a college junior are different products. For Trevor's own training/content: his lived arc (four-seam/changeup/slider starter → two-look power reliever with 21 saves in 2023) is literally the §5 role-math story, and it's a credible on-camera teaching artifact for exactly this doc's material.

## 9. Construction Checklist (Synthesis)

1. **Slot audit**: PP / SiP / SoP each covered? In-zone rate ≥ ~50% on the SiP? (promising)
2. **Plot audit**: both a north-south and an east-west lane available (or an honest single-lane role assignment)? Primary outside the dead zone, or compensated by velo/angle/edge%? (promising)
3. **Platoon audit**: at least one neutral-or-reverse pitch (changeup family, deep curve, cutter, ride FB) for a starter; expected platoon delta assigned by shape prior, not tiny-sample splits. (proven priors)
4. **Bias audit**: every recommended addition compatible with the athlete's pronation/supination profile; search variants (kick-change vs splitter; gyro vs sweeper) inside the compatible set. (promising)
5. **Usage audit**: per-pitch RV dispersion (Nash gap) — is the best pitch under-thrown, the primary over-thrown? Re-optimize after any shape change, never before grading it. (promising)
6. **Role audit**: pitch count matched to exposure — 2 for one-time-through, 4+ for rotation work; the marginal pitch is a TTO investment and may be RV-neutral on its own. (proven)

## Sources

1. Ben Whitelaw — "Largely Theoretical Pitcher Arsenal Construction" — https://benwhitelaw.substack.com/p/largely-theoretical-pitcher-arsenal
2. Ben Whitelaw — "Revisiting Pitcher Arsenal Analysis" — https://benwhitelaw.substack.com/p/revisiting-pitcher-arsenal-analysis
3. Max Marchi — "Platoon Splits 2.0," The Hardball Times — https://tht.fangraphs.com/platoon-splits-20/
4. Mitchel Lichtman — "Pitch Types and the Times Through the Order Penalty," SABR — https://sabr.org/latest/lichtman-pitch-types-and-the-times-through-the-order-penalty/
5. Lichtman — "Everything You Always Wanted to Know About the TTOP," Baseball Prospectus — https://www.baseballprospectus.com/news/article/22156/
6. ESPN — "Which MLB pitchers are throwing their best stuff most often?" (Nash Scores, 2025) — https://www.espn.com/mlb/story/_/id/45539286/which-2025-mlb-pitchers-throwing-right-wrong-pitches-game-theory
7. Ben Clemens — "The Secret Benefit (and Cost) of Sweeping Sliders," FanGraphs — https://blogs.fangraphs.com/the-secret-benefit-and-cost-of-sweeping-sliders/
8. Stephen Sutton-Brown — "Introducing BP's New Arsenal Metrics," Baseball Prospectus (Jan 2025) — https://www.baseballprospectus.com/news/article/96026/introducing-new-arsenal-metrics/
9. Davy Andrews — "A League-Wide Update on Pitch Mix," FanGraphs (2023) — https://blogs.fangraphs.com/a-league-wide-update-on-pitch-mix/
10. Davy Andrews — "Why Is It Always the Year of the (Insert Pitch Here)?," FanGraphs (Apr 2025) — https://blogs.fangraphs.com/why-is-it-always-the-year-of-the-insert-pitch-here/
11. Uram Analytics — "From Stuff to Strategy: Improving MLB Pitch Profiles and Optimizing Usage" — https://www.uramanalytics.com/post/from-stuff-to-strategy-improving-mlb-pitch-profiles-and-optimizing-usage
12. Eno Sarris — "Sinkers, Change-ups and Platoon Splits," FanGraphs (2014) — https://blogs.fangraphs.com/sinkers-change-ups-and-platoon-splits/
13. Maxwell Resnick — "Avoid the Dead Zone" (D1 fastball logistic regressions) — https://www.seemagnus.com/blog-posts-test/avoid-the-dead-zone-an-extensive-analysis-of-the-relationship-between-fastball-stuff-characteristics-and-utility-through-four-logistic-regression-models
14. MLB Data Warehouse — "Pitch Arsenal Archetyping" — https://www.mlbdatawarehouse.com/p/pitch-arsenal-archetyping
15. PitchingCoachU — "The 3 Types of Pitch Movement Profiles" — https://www.pitchingcoachu.com/blog/mmv088
16. Pitcher List — "Spin Doctors: The Most Versatile Pitcher Archetype" — https://pitcherlist.com/spin-doctors-a-look-at-the-most-versatile-pitcher-archetype/
17. Lookout Landing — "What the 'kick change' is and why it's the pitch of 2025" — https://www.lookoutlanding.com/2025/2/28/24367452/what-the-kick-change-is-pitch-of-2025-andres-munoz-brian-bannister-supination-pronation
18. MLB.com — "MLB pitch arsenals are bigger than ever in 2025" (pitch palette) — https://www.mlb.com/news/mlb-pitch-arsenals-are-bigger-than-ever-in-2025
19. Driveline Baseball — "Revisiting Stuff+" (May 2024) — https://www.drivelinebaseball.com/2024/05/revisiting-stuff-plus/
20. Rapsodo — "Building a Pitch Arsenal for High School Athletes" — https://rapsodo.com/blogs/baseball/building-a-pitch-arsenal-for-high-school-athletes
21. Pitch Atlas — "State of the Craft: Sweep, Fade, Wake, and Lost Lines" — https://pitch-atlas.com/learn/trends/
22. The Hardball Times — "Game Theory and Baseball, Part 2: Pitch Selection" — https://tht.fangraphs.com/game-theory-and-baseball-part-2-introduction-to-pitch-selection/
