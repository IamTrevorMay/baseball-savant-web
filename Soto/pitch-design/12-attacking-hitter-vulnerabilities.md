---
title: Attacking Hitter Vulnerabilities — Swing Planes, Attack Zones, Count Leverage, and Chase Profiles
domain: pitch-design
tags:
  - swing-plane-matchups
  - attack-zones
  - count-leverage
  - pitch-sequencing
  - chase-rate
  - zone-contact
  - arsenal-design
  - vertical-approach-angle
sources_reviewed: 24
last_updated: 2026-07-19
---

# Attacking Hitter Vulnerabilities — Swing Planes, Attack Zones, Count Leverage, and Chase Profiles

## TL;DR

- **Hitting is plane-matching, and pitch design is plane-mismatching.** MLB hitters average a 10° attack angle overall but adapt by location — ~16° on low pitches, ~9° middle, ~7° up — so a flat-VAA four-seam (≥ -4.5°, roughly +1σ where σ ≈ 0.5°) at the top of the zone forces the largest angle mismatch and the most under-swings (proven).
- **VAA only pays at the zone edges.** Within the heart of the zone, whiff rates show "virtually no gains" from approach angle; at the top/bottom thresholds, extreme VAAs drive large whiff differences — flat four-seamers up, steep breakers down (proven).
- **The shadow zone is where pitchers earn their living**: pitches within ~2.9 in (one ball width) of the zone edge are ~40%+ of all MLB pitches, get swung at ~50% of the time, split ~50/50 on called ball/strike, host ~half of all strikeouts, and run a ~1.7 run/100 pitcher advantage vs ~0.9 run/100 in the heart (proven).
- **Count leverage is the cheapest edge in baseball**: a first-pitch strike drops expected runs from ~.069 to ~.029 (~100 pts of wOBA swing), hitters bat ~.239 after 0-1 vs ~.280 after 1-0, and hitter-count wOBA (.474) nearly doubles pitcher-count wOBA (.224). On 0-2 specifically, out-of-zone pitches run -0.39 RV/100 vs +0.70 for in-zone — chase, don't challenge (proven).
- **Tunneling is real but second-order**: BP's tunnel metrics (~9 in average separation at the decision point for elite pairs; Keuchel at the 95th percentile in 2015) correlate with success, but effect sizes are modest and pitch selection by expected outcome dominates (promising).
- **Chase and zone-contact define the two exploit paths**: MLB averages are ~28.4% chase and ~85.4% zone contact; a high-chase hitter is beaten off the plate with shape (expand after strike one), while an elite zone-contact hitter (93%+) must be beaten on quality of contact and count leverage, not whiffs (proven).
- **Platoon splits are pitch-shape-specific, not just handedness-specific**: LHP relief sliders show a ~1.47 run/100 same-hand vs opposite-hand gap, while RHP changeups/curves show a ~0.32 run/100 *reverse* split — arsenal design against a lineup is really glove-side/arm-side movement portfolio design (proven).
- **Arsenal design must match the hitter population by level**: MLB four-seam usage fell from 64.4% (2002) to 47.9% (2025) because MLB hitters punish fastballs; college chase (~21–22% vs four-seams, up to 35%+ for aggressive draft prospects) and HS pitch recognition are far weaker, so amateur arsenals should over-index on fastball command and one distinct breaker, not MLB-style secondary-heavy mixes (promising).

## 1. The Matchup Frame: Pitching Is Exploit-Finding

Pitch design (docs 02–03 in this folder) answers "what should this pitch look like?" This doc answers the complementary question: *given what my stuff looks like, whose swing does it beat, and how do I present it?* The modern answer decomposes hitter vulnerability into four measurable layers:

1. **Geometric** — the hitter's swing plane vs the pitch's approach plane (bat tracking × VAA/HAA).
2. **Spatial** — where in/around the zone the hitter's damage and holes live (attack zones).
3. **Temporal** — how count state changes both parties' behavior (count leverage, sequencing, tunneling).
4. **Decisional** — the hitter's swing-decision profile (chase vs zone-contact vs selectively aggressive).

Since Statcast bat tracking went public (bat speed/swing length in 2024; attack angle, attack direction, swing path tilt, and ideal-attack-angle rate in 2025), all four layers are quantifiable at the individual-hitter level for MLB, and at the facility level with mocap/Blast-style sensors (proven — the measurement, not every downstream claim).

**For Soto:** Triton already computes VAA/HAA client-side from trajectory data. The natural extension is a per-hitter "vulnerability card" — attack-zone run values, chase/zone-contact, and (for MLB) Savant swing-path metrics — joined against a pitcher's arsenal shapes. That's a Reports Builder tile family, not a new platform.

## 2. Swing-Plane Matchups: VAA × Attack Angle

The physics: contact quality is maximized when the bat's attack angle mirrors the pitch's descent angle. League-wide, the most productive contact occurs at attack angles between **5° and 20°** (MLB's "ideal attack angle" band; league average ideal-attack-angle rate is **51.5%**), precisely because most pitches enter the zone at -4° to -12° VAA (proven). A bat path much flatter or steeper than the pitch plane produces weak contact or a whiff.

Key numbers to anchor on:

- **Four-seam VAA distribution**: league mean ≈ -4.9° at typical velocity/height, with ±1σ ≈ ±0.5° (Chamberlain, FanGraphs 2022). "Flat" is roughly -4.5° or shallower; "steep" is -5.5° or steeper. Sliders (σ ≈ 0.7–0.8°) and curves (σ ≈ 1.0–1.1°) vary more (proven).
- **Location dependence is everything**: within the heart of the zone, VAA delivers "virtually no gains" in whiff rate. At and just beyond the top/bottom thresholds, extreme VAAs dominate — flat four-seamers sustain whiffs above the zone where every other pitch dies; steep breakers beat flat ones on whiff-per-swing below the zone (Chamberlain, FanGraphs 2021) (proven).
- **Hitters bend their swing to location**: average attack angle runs ~**16° on low pitches, ~9° middle, ~7° up** (Driveline/Blast-derived). So the *elevated* flat fastball attacks the hitter where his adjusted attack angle is already smallest — and still typically steeper than the pitch's plane — producing swing-under whiffs and pop-ups (proven).
- **VAA is velocity-gated**: Chamberlain's caveat — "a pitch's VAA is only as important as its velocity." A flat 89 mph four-seam up gives the hitter time to re-plane; the same shape at 95 doesn't (promising).
- **Individual hitter tells**: Statcast swing path tilt averages **~32°** (individual means range ~23°–46°). Steep-tilt/steep-attack hitters (uppercut profiles) are disproportionately vulnerable up-and-in to flat ride; flat-swing, high-contact hitters (Kwan/Arraez types) neutralize ride but are more beatable with vertical depth below the zone and velocity above their adjustment window (promising — matchup-level public research is still young).
- **Two-strike flattening**: with two strikes, MLB hitters measurably shorten and flatten — average swing speed drops ~2 mph (e.g., **69.8 mph on 0-2** vs ~72 mph overall) — which is exactly why put-away breakers below the zone play up late in counts: the defensive swing covers the top, not the bottom (proven).

Practical pairing logic: a pitcher with a -4.3° VAA four-seam should live in the upper third against steep-swing hitters and accept that vs elite flat-swing zone-contact hitters, the same pitch is a called-strike tool more than a whiff tool (Chamberlain's Peralta 17.1% SwStr up vs Buehler's 23.8% called-strike rate down illustrates the two profit models) (proven).

**For Soto:** Triton's Stuff+ (velo/movement/extension Z-scores) doesn't see VAA or release height. A cheap, high-value feature: flat-VAA-above-average per pitch, plus a "plane matchup" score = pitcher VAA percentile × hitter attack-angle/tilt percentile from Savant bat-tracking (available 2024+, joinable on batter id). For Neptune, hitter attack angle by pitch height is measurable day one with a Blast sensor + TrackMan pitch location — that's the assessment-battery version of this section.

## 3. Attack-Zone Analysis: The Economics of Heart / Shadow / Chase / Waste

Statcast's four attack zones turn "command" into a ledger:

- **Heart** (middle of the zone): most hittable region. Pitchers still net **~+0.9 runs/100** here in aggregate — because called and swinging strikes on hittable pitches are common — but it's where all hitter damage concentrates (proven).
- **Shadow** (±one ball width, ~2.9 in, around the zone edge): the professional pitcher's home. **40%+ of all MLB pitches** land here; hitters swing **~50%** of the time; called pitches split roughly **50/50** ball/strike; roughly **half of all strikeouts** are recorded here; net pitcher advantage **~1.7 runs/100 pitches** — nearly double the heart (proven).
- **Chase** (beyond shadow but still swing-inducible): profitable only against hitters who swing; a take here is a clean ball. Its value is conditional on the hitter's chase rate and the count (proven).
- **Waste** (far off the plate): ~7% of pitches; almost purely strategic (effort management, setting eye level, intentional balls). Systematically negative expected value except as a rare 0-2 eye-level reset (proven).

Two operating rules fall out of the ledger:

1. **Command is shadow-share.** The best command artists aren't "in the zone" more — they convert would-be heart pitches into shadow pitches. Gausman-style profiles show how a two-pitch arsenal survives elite lineups by maximizing shadow occupancy with both pitches.
2. **Attack-zone splits are the fastest hitter scouting read.** A hitter's swing/take run values by zone (Savant swing/take tool) expose whether he loses value by chasing (attack the chase zone off the shadow), by taking hittable strikes (steal early-count shadow/heart strikes), or by neither (you must win on contact quality) (proven).

**For Soto:** Implement the four attack zones as derived fields on `pitches`/`milb_pitches`/`compete_pitches` (pure geometry from plate_x/plate_z + sz_top/sz_bot). Then: (a) pitcher shadow% becomes a command sub-metric candidate for `pitcher_season_command`; (b) hitter run value by attack zone becomes the vulnerability card's spine; (c) for Neptune bullpens, "shadow-share at intended-quadrant" is a trainable, level-agnostic command KPI.

## 4. Count Leverage: The Compounding Math of Strike One

The count is a lever that multiplies or divides every other edge:

- **First pitch**: expected runs for the PA fall from **.069 after ball one to .029 after strike one**; the swing is ~**100 points of wOBA (~0.071 runs)** on a single pitch. Hitters bat **~.239 for the PA after 0-1** vs **~.280 after 1-0** (proven).
- **Aggregate count states**: hitter counts (1-0, 2-0, 2-1, 3-0, 3-1) produce a combined **.474 wOBA**; pitcher counts (0-1, 0-2, 1-2, 2-2) produce **.224** (proven).
- **The single highest-leverage non-terminal pitch is 2-0**: strike → .352 wOBA state, ball → .622; a **.270 wOBA / 0.207 run** swing on one pitch. Sequencing plans should protect exactly these pitches — this is where a pitcher's highest-strike-probability weapon belongs, not his best whiff pitch (proven).
- **0-2 is not "waste one"**: MLB pitchers zone only **36%** of 0-2 pitches (vs 49% overall), and they're right to expand — but not to waste. Out-of-zone 0-2 pitches (mostly shadow/chase, not waste) allowed **.217 wOBA with 45.2% K**, vs **.231 wOBA / 41.1% K** in-zone; per-pitch run values were **-0.39 RV/100 out-of-zone vs +0.70 in-zone**, driven by the brutal cost of 0-2 balls in play (**+12.05 RV/100**) against the trivial cost of a called ball (Ciardiello, FanGraphs 2021). Translation: on 0-2, throw your best chase shape in the chase/shadow band; never surrender a hittable strike (proven).
- **Batters hit ~.154 in 0-2 counts vs ~.260 in all other counts** (2019–20), and their 0-2 swings are ~2.2 mph slower — the count doesn't just change outcomes, it degrades the opponent's weapon (proven).

Sequencing basics that survive scrutiny: (1) win pitch one with your highest-called-strike-probability offering, shaded away from the hitter's early-count damage zone; (2) with the count advantage, migrate from shadow to chase along the axis of your best secondary's movement; (3) behind in the count, don't retreat to heart-zone fastballs by default — this is exactly where the modern "throw your best secondary in any count" shift came from, since hitters sit fastball at 2-0/3-1 (promising — team-level practice, directionally supported by pitch-mix trends).

**For Soto:** Triton should surface count-state run-value grids per pitcher (and per hitter): wOBA/RV by count, zone% by count, and putaway% by pitch. For Neptune athletes, the cheapest performance gain to coach is first-pitch-strike rate — at amateur levels the .069/.029 gap is *wider* because free bases convert to runs more often. Track FPS% per bullpen/live AB in Compete sessions.

## 5. Tunneling and Sequencing: What the Evidence Actually Supports

Baseball Prospectus introduced public tunnel metrics in 2017 (Long, Judge, Pavlidis): pitch pairs are compared at the "tunnel point" (~the swing-decision moment, ~167 ms before contact), with metrics like PreMax (separation at decision time) and break-to-tunnel ratio. Key empirical anchors:

- Elite tunnelers get consecutive-pitch separation at the decision point down to **~9 inches**, with release-point separation ~2 inches (Keuchel 2015, 95th percentile); his sinker→changeup pair produced strikes or ground balls **63.6%** of the time (promising).
- Keuchel's arsenal simplification (30 → 25 distinct pitch pairs from 2013–15) tracked his improvement; his expansion to 35 pairs in 2016 tracked his decline — suggestive, not causal (plausible).
- Independent checks (Blewett, THT 2017; later public replications) find tunneling effects real but **modest**, and largely subordinate to pitch selection by expected outcome: pitchers pick the best pitch for the situation first, and tunnels are often a byproduct of a well-designed arsenal (shared release, complementary shapes) rather than a separate skill to chase (promising for arsenal-level tunnel geometry; plausible for pair-sequencing as an independent skill).

The durable takeaway for pitch design: **build tunnels into the arsenal, not the game call.** Two pitches with matched release and ≥12 in of late divergence tunnel automatically; no sequencing cleverness can rescue two pitches the hitter can separate out of hand. This is why the fastball/breaker VAA-spread and the "bridge pitch" (cutter/gyro slider between four-seam and sweeper) have become standard arsenal architecture (promising).

**For Soto:** Triton's `deception_score`/`unique_score` are adjacent to this. A tunnel metric is computable from Statcast trajectories (position at t-decision from release kinematics) — worth prototyping as `pair_premax` per pitcher pitch-pair, but grade it honestly: expect small marginal R² over stuff+command.

## 6. Chase vs Zone-Contact: The Two Hitter Exploit Paths

League benchmarks (MLB): chase (O-Swing) **~28.4%**, zone contact **~85.4%** (2023; 88%+ good, 93%+ elite), swinging-strike rate **~11.1%**. Individual hitters range from ~15% to ~45% chase. The 2×2 of chase × zone-contact defines four attack plans:

1. **High chase / low zone-contact** (free-swinger with holes): the pitcher's dream. Expand immediately after strike one; shadow-to-chase breakers in any count; you may never need to throw a heart-zone pitch after 0-0 (proven).
2. **High chase / high zone-contact** (aggressive contact hitter — many amateur and some MLB bad-ball hitters): whiffs are scarce in-zone, so move the *contact point*: chase-zone shapes that induce weak contact (sinkers off the plate arm-side, changeups below), and accept early-count outs on pitcher-controlled contact (promising).
3. **Low chase / low zone-contact** (three-true-outcomes, damage-seeking): they will not chase early — so take the free strikes they concede (steal shadow called strikes, especially early), then finish above/below the zone where their long, steep swing whiffs. Count leverage is the whole game: their .474-wOBA hitter-count damage is the thing to never allow (proven).
4. **Low chase / high zone-contact** (elite swing decisions — Soto/Arraez/Kwan archetypes, or Seager-style "selective aggression"): there is no discipline exploit. BP's SEAGER work shows these hitters combine correct takes with near-100% swing rates at damage pitches, and the metric predicts wOBA/ISO well. You beat them on physical mismatch (velocity + plane at the top, or elite shape they haven't seen) and on contact management, and you accept walks at the margin (proven that the profile exists and resists exploitation; promising on specific counter-strategies).

Two refinements: chase rate is count-dependent (everyone chases more at 0-2, less at 3-1), so hitter cards should show chase *by count-state*; and chase has a direction — most hitters chase down/away far more than up, so "high chase" must be resolved to a chase *map*, not a scalar (proven).

**For Soto:** All four quadrant stats are computable from Triton's `pitches` table today (swing/contact flags × zone geometry). For Compete/Neptune live at-bats, chase% and z-contact% per session are the first two hitter KPIs worth persisting — they're stable, level-portable, and directly coachable.

## 7. Handedness and Movement-Direction Portfolios

Platoon vulnerability is pitch-shape-specific:

- **Sliders/sweepers carry the largest same-hand edge**: LHP relief sliders ran **-0.88 runs/100 vs LHB but +0.59 vs RHB** — a **1.47 run/100** platoon gap. Sweepers, with more horizontal break, are even more polarized: leaned on vs same-hand bats, dialed back or bridged (cutter) vs opposite-hand (proven).
- **Changeups and curves show reverse or neutral splits**: RH starters' changeups/curves ran a **0.32 run/100 reverse split** (better vs LHB) — the physical basis for "changeup = the equalizer" and for splitters functioning as platoon-neutral put-aways (proven).
- Arsenal implication: a starter's minimum viable portfolio is one glove-side breaker (same-hand weapon), one arm-side fader or platoon-neutral offspeed (opposite-hand weapon), and a fastball whose plane plays to both. A pitcher whose two best secondaries both break glove-side is structurally exposed to opposite-hand lineups regardless of Stuff+ (promising).

**For Soto:** Triton's pitcher pages should show RV/100 and usage splits by batter side per pitch — and flag "portfolio gaps" (no arm-side or platoon-neutral secondary). This is also Trevor's own history: the four-seam/slider/changeup RHP template is the canonical balanced portfolio.

## 8. Arsenal Design by Level: Pitch to the Population You Face

The optimal arsenal is a function of the hitter population, and populations differ sharply by level:

- **MLB**: hitters punish fastballs, so four-seam usage collapsed from **64.4% (2002) to 47.9% (2025)** while sliders rose **12.1% → 22.4%** and offspeed crossed **20%** for the first time — even as average fastball velocity climbed from 91.4 (2008) to **94.4 mph**. At this level, secondary-heavy, shape-diverse arsenals are rational because the hitters' recognition and plane-matching are elite (proven).
- **Power-4 college (2023–26 TrackMan era)**: four-seam usage fell **51.7% → 46.0%**, average P4 velocity 91.1 → 91.5 mph (90th percentile 95.0), average IVB up to **16.2 in (16.9 at P4)** — yet in-zone whiff on four-seams stayed flat (~13%) and chase *fell* (22.2% → 21.0%): college hitters are adapting to ride, and SLG against four-seams dropped .530 → .503 mostly from contact-quality decline, not whiffs. Cutters nearly tripled (2.2% → 5.8%) as the bridge-pitch trend trickled down (proven for the data; promising for interpretation).
- **College hitter discipline is genuinely worse than MLB**: even top draft-model college hitters run chase rates up to **35.8%** against a ~28.4% MLB average; the exploitable chase population is much larger, so shadow-to-chase expansion works more often per plan (promising).
- **High school**: average velocity 75–85 mph (D1-bound starters 88–92), recognition windows far shorter, and stuff separates cleanly: elite-showcase TrackMan showed fastballs at **2500+ rpm generating 9.1% swinging strikes vs 5.0% for sub-2000 rpm**, and curveballs at 2600+ rpm holding hitters to **.170 AVG with 13% swinging strikes**. But the *dominant* edge at HS and below is simply strikes: amateur walk/HBP run leakage dwarfs shape optimization, and a fastball-command + one-distinct-breaker arsenal beats a five-pitch MLB imitation (promising).
- **Design rule**: as level drops, shift weight from *shape diversity* toward *fastball command and count leverage*; as level rises, shift toward *plane/shape mismatches and portfolio completeness*. A pitch that "works" at one level can be a trap at the next (e.g., a big, slow, early-hump curve dominates HS chase but gets recognized and taken — or teed off — by college zone-contact hitters) (promising).

**For Soto:** This is the core Neptune programming principle. Athlete pitch-design plans should carry a "level target" field: HS athletes get FPS%, shadow-share, and one-breaker distinctness goals; college/pro athletes get VAA/portfolio/tunnel work. Triton's `milb_pitches` (AAA) vs `pitches` (MLB) already lets Soto quantify one level gap in-house — chase, z-contact, and per-shape RV/100 at AAA vs MLB is a publishable internal study and directly calibrates advice for players between levels.

## 9. A Working Game-Plan Algorithm

Synthesizing the above into the order Soto should evaluate a matchup:

1. **Portfolio check (season scale)**: does the pitcher's arsenal cover both handedness directions and both vertical thresholds? Fix structural gaps before game-planning around them.
2. **Plane scan (per hitter)**: hitter attack angle / tilt / ideal-attack-angle rate vs pitcher VAA extremes → pick the vertical band to live in.
3. **Zone ledger (per hitter)**: swing/take RV by attack zone → identify whether the exploit is chase, taken strikes, or nothing (→ contact management).
4. **Count script**: 0-0 highest-strike-probability pitch away from damage; ahead → migrate shadow→chase along best secondary's break; 2-0/3-1 → protect with the highest-zone-probability *non-heart* option; 0-2 → best chase shape, never heart, waste only to reset eye level.
5. **Sequencing overlay**: prefer pairs with shared release and late divergence; don't sacrifice expected pitch value for tunnel aesthetics.
6. **Level adjustment**: weight steps 2–5 by population — amateur: steps 3–4 dominate; MLB: steps 1–2 dominate.

## Sources

1. Alex Chamberlain, "A Visualized Primer on Vertical Approach Angle (VAA)," FanGraphs (Feb 2022) — https://blogs.fangraphs.com/a-visualized-primer-on-vertical-approach-angle-vaa/
2. Alex Chamberlain, "Where Vertical Approach Angle Seems to Matter Most," FanGraphs (Jan 2021) — https://blogs.fangraphs.com/where-vertical-approach-angle-seems-to-matter-most/
3. Statcast Swing Path / Attack Angle leaderboard, Baseball Savant — https://baseballsavant.mlb.com/leaderboard/bat-tracking/swing-path-attack-angle
4. MLB.com, "New Statcast metrics measure swing path, attack angle, attack direction" (2025) — https://www.mlb.com/news/new-statcast-swing-metrics-2025
5. MLB.com Glossary, "Attack Angle" — https://www.mlb.com/glossary/statcast/attack-angle
6. MLB.com Glossary, "Swing Path (Tilt)" — https://www.mlb.com/glossary/statcast/swing-path-tilt
7. Jack Lambert, "Using MLB Bat Tracking Data to Better Understand Swings," Driveline Baseball (Jul 2024) — https://www.drivelinebaseball.com/2024/07/using-mlb-bat-tracking-data-to-better-understand-swings/
8. Driveline Baseball, "Using Swing Plane to Coach Hitters: a Deeper Look" (2018) — https://www.drivelinebaseball.com/2018/05/using-swing-plane-coach-hitters-deeper-look/
9. "Surviving in the Shadows," Viva El Birdos (Feb 2024) — https://www.vivaelbirdos.com/2024/2/20/24048030/surviving-in-the-shadows
10. "Looking at xK% and xBB% Using StatCast Zones," FanGraphs Community — https://community.fangraphs.com/looking-at-xk-and-xbb-using-statcast-zones/
11. "Kevin Gausman, The Heart, and the Shadow," Pitcher List — https://pitcherlist.com/kevin-gausman-the-heart-and-the-shadow/
12. Carmen Ciardiello, "How Should Pitchers Approach 0-2 Counts?," FanGraphs (Jul 2021) — https://blogs.fangraphs.com/how-should-pitchers-approach-0-2-counts/
13. ABCA Inside Pitch, "Quick Pitch: The Value of First Pitch Strikes" (2019) — https://www.abca.org/magazine/magazine/2019-2-March_April/Quick_Pitch_Value_of_First_Pitch_Strikes.aspx
14. "Dynamic Run Value of Throwing a Strike (Instead of a Ball)," The Hardball Times — https://tht.fangraphs.com/dynamic-run-value-of-throwing-a-strike-instead-of-a-ball/
15. Jeff Long & Kate Morrison, "Tunnels and Sequencing: Applications on the Field," Baseball Prospectus (Sep 2017) — https://www.baseballprospectus.com/news/article/32790/prospectus-feature-tunnels-and-sequencing-applications-on-the-field/
16. "Introducing Pitch Tunnels," Baseball Prospectus (Jan 2017) — https://www.baseballprospectus.com/news/article/31030/prospectus-feature-introducing-pitch-tunnels/
17. Dan Blewett, "Pitch Tunneling: Is It Real? And How Do Pitchers Actually Pitch?," The Hardball Times (Jun 2017) — https://tht.fangraphs.com/pitch-tunneling-is-it-real-and-how-do-pitchers-actually-pitch/
18. Tom Tango (Tangotiger), "Platoon splits by pitch type" — https://tangotiger.com/index.php/site/article/platoon-splits-by-pitch-type
19. "Sinkers, Change-ups and Platoon Splits," FanGraphs — https://blogs.fangraphs.com/sinkers-change-ups-and-platoon-splits/
20. Pitch Atlas, "Handedness & Platoon Strategy" — https://pitch-atlas.com/learn/handedness/
21. RotoWire, "MLB Pitch Speed & Usage Trends: 2002–2025" — https://www.rotowire.com/baseball/article/mlb-pitch-speed-and-usage-2002-to-2025-94262
22. Paradigm PDS / 11Point7, "The Four-Seam Fastball Is Changing College Baseball — Just Not How You Think" (Apr 2026) — https://www.11point7.com/news/the-four-seam-fastball-is-changing-college-baseball----just-not-how-you-think
23. Baseball America, "Power, Contact & Chase Rates For Top 2025 College Hitters" — https://www.baseballamerica.com/stories/mlb-draft-prospects-power-contact-chase-rates-for-top-2025-college-hitters/
24. Perfect Game, "All-American TrackMan data" (Aug 2014) — https://www.perfectgame.org/Articles/View.aspx?article=10457
25. Robert Orr's SEAGER — "Quantifying the Corey Seager Approach," Baseball Prospectus — https://www.baseballprospectus.com/news/article/86572/the-crooked-inning-corey-seager-rangers/ ; Sky Kalkman, "Simple Seager" — https://skykalkman.substack.com/p/simple-seager
26. FanGraphs Library, "Plate Discipline (O-Swing%, Z-Swing%, etc.)" — https://library.fangraphs.com/offense/plate-discipline/
