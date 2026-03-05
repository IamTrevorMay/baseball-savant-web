# Formulas

A complete reference for every metric calculated in the Triton platform backend, with plain-language explanations and full formulas.

---

## Table of Contents

1. [Approach Angles](#1-approach-angles)
2. [Pitch Movement](#2-pitch-movement)
3. [Command Metrics (Raw)](#3-command-metrics-raw)
4. [Command Metrics (Plus Stats)](#4-command-metrics-plus-stats)
5. [Stuff+ Model](#5-stuff-model)
6. [Deception Metrics](#6-deception-metrics)
7. [Triton+ Composite](#7-triton-composite)
8. [Rate Stats](#8-rate-stats)
9. [Batting Stats](#9-batting-stats)
10. [ERA Estimators](#10-era-estimators)
11. [Park-Adjusted Stats](#11-park-adjusted-stats)
12. [Plus Stat System](#12-plus-stat-system)
13. [Grades & Percentiles](#13-grades--percentiles)
14. [Pitch Trajectory Physics](#14-pitch-trajectory-physics)
15. [Batted Ball Trajectory](#15-batted-ball-trajectory)
16. [Pitcher Workload & Risk (PURI)](#16-pitcher-workload--risk-puri)
17. [Umpire Scorecard](#17-umpire-scorecard)
18. [Game Intelligence Engines](#18-game-intelligence-engines)
19. [Trends & Alerts](#19-trends--alerts)
20. [Constants & Baselines](#20-constants--baselines)

---

## 1. Approach Angles

Approach angles describe the direction the ball is traveling as it crosses the plate. Flatter angles are harder to hit because the bat has to be in the right spot for a shorter window.

### Vertical Approach Angle (VAA)

How steeply the ball is moving up or down when it reaches the batter. A more negative value means the ball is dropping more sharply. Flatter (less negative) fastballs are harder to hit.

**How it works:** We figure out how long the ball takes to reach the plate using its forward speed and acceleration. Then we check the ball's vertical speed at that moment and compare it to its forward speed.

```
time_to_plate = (-vy0 - sqrt(vy0^2 - 2 * ay * (50 - extension))) / ay

vertical_speed_at_plate  = vz0 + az * time_to_plate
forward_speed_at_plate   = vy0 + ay * time_to_plate

VAA = arctan(vertical_speed_at_plate / -forward_speed_at_plate)   [in degrees]
```

**Inputs:** `vz0` (initial vertical velocity), `vy0` (initial forward velocity), `az` (vertical acceleration), `ay` (forward acceleration), `release_extension` (how far in front of the rubber the pitcher releases). All from Statcast tracking data.

The `50` in the formula is the approximate distance in feet from release point to the plate, adjusted by extension.

> File: `lib/enrichData.ts` lines 44-58

### Horizontal Approach Angle (HAA)

How much the ball is moving left or right when it reaches the batter. Same idea as VAA but in the horizontal direction.

```
time_to_plate = (same as VAA)

horizontal_speed_at_plate = vx0 + ax * time_to_plate
forward_speed_at_plate    = vy0 + ay * time_to_plate

HAA = arctan(horizontal_speed_at_plate / -forward_speed_at_plate)   [in degrees]
```

> File: `lib/enrichData.ts` lines 63-75

### HAVAA (Simplified Horizontal Approach Angle)

A simplified version used on the Starter Card. Instead of using velocity vectors, it draws a straight line from the release point to where the ball crossed the plate and measures the angle.

```
horizontal_distance = release_pos_x - plate_x
forward_distance    = 60.5 - release_extension

HAVAA = arctan(horizontal_distance / forward_distance)   [in degrees]
```

`60.5` is the distance in feet from the pitching rubber to home plate.

> File: `app/api/starter-card/route.ts` lines 341-346

### Server-Side VAA/HAA (Simplified Geometric)

The batch deception pipeline uses a simplified straight-line calculation instead of the full kinematic model:

```
VAA = arctan((release_pos_z - plate_z) / (60.5 - release_extension))   [in degrees]
HAA = arctan((release_pos_x - plate_x) / (60.5 - release_extension))   [in degrees]
```

This is slightly less precise than the client-side version but much faster to compute across millions of pitches in SQL.

> File: `app/api/compute-deception/route.ts` lines 21-41

---

## 2. Pitch Movement

Movement measures how much a pitch deviates from a hypothetical spinless trajectory (a "gyroball" with no spin-induced deflection). Statcast reports movement in feet; we convert to inches.

### Horizontal Break (HB) and Induced Vertical Break (IVB)

```
HB  = pfx_x * 12   [inches]
IVB = pfx_z * 12   [inches]
```

- **HB (Horizontal Break):** Positive = arm-side movement, negative = glove-side. A right-handed pitcher's sinker has positive HB (runs in on lefties).
- **IVB (Induced Vertical Break):** Positive = "rise" (fights gravity), negative = drops more than gravity alone. A good four-seam fastball might have 16+ inches of IVB.

> File: `lib/enrichData.ts` lines 81-82

---

## 3. Command Metrics (Raw)

These measure how precisely a pitcher locates their pitches. All distances are in inches.

### Brink (Distance to Zone Edge)

How close a pitch is to the edge of the strike zone. Positive values are inside the zone; negative values are outside. A pitch right on the edge has a brink near zero.

```
distance_to_left_edge   = plate_x + 0.83
distance_to_right_edge  = 0.83 - plate_x
distance_to_bottom_edge = plate_z - sz_bot
distance_to_top_edge    = sz_top - plate_z

Brink = min(all four distances) * 12   [inches]
```

`0.83 feet` is half the plate width plus the radius of a baseball (the ball only needs to clip the edge of the zone to be a strike). `sz_top` and `sz_bot` are the batter's personal strike zone boundaries from Statcast.

A **lower** average brink means the pitcher consistently works near the edges.

> Files: `lib/enrichData.ts` lines 88-94, `lib/outingCommand.ts` lines 57-61

### Cluster (Distance from Centroid)

How tightly grouped a pitcher's pitches are for each pitch type. We first find the average location (centroid) of all pitches of that type in the dataset, then measure how far each individual pitch is from that center.

```
centroid = (avg plate_x, avg plate_z)   for that pitch type and year

Cluster = sqrt((plate_x - centroid_x)^2 + (plate_z - centroid_z)^2) * 12   [inches]
```

A **lower** cluster value means the pitcher repeats their location consistently.

Centroids are computed per pitch type per game year. League-wide centroids are stored as baselines in `lib/leagueStats.ts`.

> Files: `lib/enrichData.ts` lines 99-107, `lib/outingCommand.ts` lines 66-69

### Horizontal Deviation (HDev) and Vertical Deviation (VDev)

The signed horizontal and vertical distances from the pitch-type centroid. These break cluster into its directional components.

```
HDev = (centroid_x - plate_x) * 12   [inches, positive = glove side of centroid]
VDev = (plate_z - centroid_z) * 12   [inches, positive = above centroid]
```

> File: `lib/enrichData.ts` lines 104-105

### Missfire (Average Miss Distance)

How far, on average, outside-zone pitches miss the strike zone. Only pitches outside the zone are included in the calculation. The distance is measured from the closest zone edge.

```
is_outside_zone = zone > 9
miss_distance   = abs(brink)   [for outside-zone pitches only]

Missfire = avg(miss_distance)   [inches]
```

A **lower** missfire value is better — it means when the pitcher does miss the zone, the misses stay close to the edge rather than sailing wide.

> File: `lib/outingCommand.ts` lines 73-78

### Close% (Close Miss Percentage)

The percentage of zone misses that land within 2 inches of the strike zone edge. Only pitches outside the zone are included in both the numerator and denominator.

```
is_outside_zone = zone > 9
is_close_miss   = is_outside_zone AND abs(brink) < 2 inches

Close% = close_miss_count / outside_zone_count * 100
```

A **higher** Close% is better — it means a greater proportion of the pitcher's misses stay near the zone edge, suggesting good command even on missed locations.

> File: `lib/outingCommand.ts` lines 73-78

### Waste Rate

The percentage of pitches that land far outside the zone — more than 10 inches from the nearest edge. These are intentional waste pitches or badly missed locations.

```
Waste% = pitches_with_brink_less_than_-10 / total_pitches * 100
```

> File: `lib/outingCommand.ts` lines 106-107

---

## 4. Command Metrics (Plus Stats)

Raw command numbers are hard to compare because different pitch types naturally have different location profiles. Plus stats normalize everything to a common scale where **100 = league average** and each 10 points = 1 standard deviation.

### Command+ (Cmd+)

A composite grade for overall pitch command, combining three components with these weights:

```
Cmd+ = 0.40 * Brink+ + 0.30 * Cluster+ + 0.30 * Missfire+
```

| Component | Weight | What it measures |
|-----------|--------|-----------------|
| Brink+ | 40% | Edge-painting ability |
| Cluster+ | 30% | Location repeatability |
| Missfire+ | 30% | Tight misses (lower avg miss distance = higher plus) |

> File: `lib/leagueStats.ts` lines 840-846

### RPCom+ (Reliever/Pitcher Command Plus)

An alternative command composite with five components instead of three, weighted by how strongly each correlates with preventing runs (measured against xwOBA):

```
RPCom+ = 0.31 * Brink+ + 0.16 * Cluster+ + 0.09 * HDev+ + 0.15 * VDev+ + 0.29 * Missfire+
```

These weights were derived from correlation analysis across 5,680 pitcher-pitch-type combinations (2020-2025, minimum 50 pitches each).

> File: `lib/leagueStats.ts` lines 848-856

### Close%+ (Close Miss Percentage Plus)

A plus stat for Close%. Since a **higher** Close% is better (more misses stay near the zone), this is NOT inverted — the standard plus formula applies directly:

```
Close%+ = ((pitcher_close_pct - league_mean) / league_stddev) * 10 + 100
```

Close%+ is displayed in the leaderboard and dashboard but is **not** included in the Cmd+ or RPCom+ composites.

### Inverted Plus Stats

For command metrics where a **lower raw number is better** (like cluster distance or missfire distance), we invert the plus stat so that higher = better on the plus scale:

```
Cluster+ = 100 - (raw_plus - 100)
         = 200 - raw_plus
```

This way, a pitcher with a tighter cluster (lower raw) gets a Cluster+ above 100.

> File: `lib/outingCommand.ts` lines 90-91

---

## 5. Stuff+ Model

Stuff+ measures pitch quality based purely on physical characteristics — how the ball moves, how fast it is, where it's released from — independent of where it's thrown or the outcome. Our model is trained using XGBoost on run values.

### Client-Side Linear Approximation

When the full XGBoost prediction isn't available in the database, we use a linear approximation:

```
stuff_rv = intercept + w1*release_speed + w2*pfx_x + w3*pfx_z + w4*release_spin_rate
         + w5*spin_axis + w6*release_extension + w7*release_pos_x + w8*release_pos_z
         + w9*arm_angle + w10*vx0 + w11*vy0 + w12*vz0 + w13*ax + w14*ay + w15*az
         + w16*p_throws_R
```

Each pitch type has its own set of 16 weights plus an intercept. `p_throws_R` is 1 for right-handed pitchers, 0 for lefties.

The raw output (`stuff_rv`) is a predicted run value — negative is better for the pitcher. This gets converted to a plus stat using league baselines:

```
Stuff+ = ((stuff_rv - league_mean) / league_stddev) * 10 + 100
```

Since lower run value = better stuff, the plus stat is inverted so higher Stuff+ = better.

**Feature list:** release_speed, pfx_x, pfx_z, release_spin_rate, spin_axis, release_extension, release_pos_x, release_pos_z, arm_angle, vx0, vy0, vz0, ax, ay, az, p_throws_R

> File: `lib/leagueStats.ts` lines 589-641

---

## 6. Deception Metrics

Deception metrics measure how unusual and hard-to-read a pitcher's delivery and pitch characteristics are. They use z-scores — how many standard deviations a pitcher's average is from the league mean for their handedness and pitch type.

### Unique Score

How statistically unusual a pitch is compared to the league. Uses the **absolute value** of z-scores (direction doesn't matter, only magnitude).

**For fastballs (4-Seam, Sinker, Cutter):**
```
Unique = 0.25 * |z_vaa| + 0.15 * |z_ivb| + 0.20 * |z_hb| + 0.20 * |z_haa| + 0.20 * |z_ext|
```

**For offspeed pitches (everything else):**
```
Unique = 0.30 * |z_vaa| + 0.20 * |z_ivb| + 0.25 * |z_hb| + 0.25 * |z_haa|
```

A higher Unique score means the pitch has characteristics batters rarely see, which is generally advantageous.

> File: `lib/leagueStats.ts` lines 888-903

### Deception Score

How deceptive a pitch is, using **signed** z-scores so that direction matters. Certain deviations are deceptive and others aren't — for example, a flatter-than-average fastball VAA is deceptive, but a steeper one isn't.

**For fastballs:**
```
Deception = -0.25 * z_vaa + 0.35 * z_ext + 0.20 * z_ivb - 0.10 * z_hb - 0.10 * z_haa
```

The negative weight on VAA means flatter fastball angles score higher. The positive weight on extension means longer extension (releasing closer to the batter) is deceptive.

**For offspeed:**
```
Deception = 0.35 * z_vaa + 0.25 * z_ext + 0.20 * z_ivb - 0.10 * z_hb + 0.10 * z_haa
```

For offspeed, the VAA weight is positive — steeper drop angles are more deceptive on breaking balls.

> File: `lib/leagueStats.ts` lines 905-921

### xDeception (Arsenal-Level Deception)

Combines z-scores from **both** a pitcher's fastball and offspeed pitches into a single number. This captures the deceptive contrast between pitch types (a "tunneling" effect).

```
xDeception = -1.2219 * fb_z_vaa - 0.2740 * fb_z_haa + 0.3830 * fb_z_ivb
           - 0.2684 * fb_z_hb  - 0.8779 * fb_z_ext
           + 1.1265 * os_z_vaa + 0.3900 * os_z_haa + 0.0947 * os_z_ivb
           - 0.2621 * os_z_hb  + 1.2845 * os_z_ext
```

The coefficients are regression-derived to predict actual batter performance. The large positive weight on `os_z_ext` means offspeed pitchers who release further from the rubber create more deception. The large negative weight on `fb_z_vaa` means flatter fastball angles combine well with the rest of the arsenal.

> File: `lib/leagueStats.ts` lines 953-961

---

## 7. Triton+ Composite

Triton+ is our overall pitch quality grade, combining stuff and command in equal parts:

```
Triton+ = 0.50 * Stuff+ + 0.50 * Cmd+
```

This is computed both per-pitch-type and as an overall grade (usage-weighted across all pitch types).

On the Starter Card, the "Start" grade uses the same formula as Triton+ to represent the overall outing quality.

> File: `app/api/starter-card/route.ts` lines 320-321

---

## 8. Rate Stats

These are percentages computed from pitch-level or plate-appearance-level data. All are calculated via SQL aggregation.

### Plate Appearances (PA)

The denominator for many rate stats. A PA is counted as each unique combination of game + at-bat number where a final event occurred:

```
PA = COUNT(DISTINCT (game_pk * 10000 + at_bat_number))   WHERE events IS NOT NULL
```

> File: `lib/reportMetrics.ts`

### Whiff%

Percentage of swings that miss the ball entirely:

```
Whiff% = swinging_strikes / total_swings * 100
```

Where `total_swings` = swinging strikes + fouls + balls hit into play + foul tips + missed bunts. Pitches where the batter didn't swing (called strikes, balls) are excluded from the denominator.

### SwStr% (Swinging Strike Rate)

Swinging strikes as a share of **all pitches**, not just swings:

```
SwStr% = swinging_strikes / total_pitches * 100
```

### CSW% (Called Strike + Whiff Rate)

Combines called strikes and swinging strikes — all pitches where the batter either didn't swing at a strike or swung and missed:

```
CSW% = (swinging_strikes + called_strikes) / total_pitches * 100
```

### Str% (Strike Rate)

Percentage of pitches that are strikes by any means (called, swinging, foul, in play):

```
is_strike = (zone 1-9) OR description contains 'strike' OR description contains 'foul'

Str% = strikes / total_pitches * 100
```

### Zone%

Percentage of pitches thrown inside the strike zone (zones 1-9 in Statcast's numbering):

```
Zone% = pitches_in_zone_1_to_9 / pitches_with_valid_zone * 100
```

### Chase%

Percentage of pitches outside the zone that the batter swung at:

```
Chase% = out_of_zone_swings / out_of_zone_pitches * 100
```

### Contact%

Percentage of swings where the bat made contact:

```
Contact% = (fouls + balls_in_play + foul_tips) / total_swings * 100
```

### Z-Swing%

Percentage of in-zone pitches the batter swung at:

```
Z-Swing% = in_zone_swings / in_zone_pitches * 100
```

### O-Contact%

Percentage of out-of-zone swings that made contact:

```
O-Contact% = out_of_zone_contact / out_of_zone_swings * 100
```

### K%

Strikeout rate per plate appearance:

```
K% = strikeout_events / plate_appearances * 100
```

### BB%

Walk rate per plate appearance:

```
BB% = walk_events / plate_appearances * 100
```

### K-BB%

The difference — a quick measure of a pitcher's dominance:

```
K-BB% = K% - BB%
```

### Hard Hit%

Percentage of batted balls with an exit velocity of 95 mph or higher:

```
Hard Hit% = (batted_balls with launch_speed >= 95) / total_batted_balls * 100
```

### Barrel%

Percentage of batted balls classified as "barrels" by Statcast (optimal combination of exit velocity and launch angle):

```
Barrel% = (batted_balls with launch_speed_angle = 6) / total_batted_balls * 100
```

`launch_speed_angle = 6` is Statcast's barrel classification.

### Batted Ball Distribution (GB%, FB%, LD%, PU%)

```
GB% = ground_balls / total_batted_balls * 100
FB% = fly_balls / total_batted_balls * 100
LD% = line_drives / total_batted_balls * 100
PU% = pop_ups / total_batted_balls * 100
```

### Usage%

How often a pitcher throws each pitch type:

```
Usage% = pitch_type_count / total_pitches_by_that_pitcher * 100
```

> File: `lib/reportMetrics.ts` lines 5-68

---

## 9. Batting Stats

### Batting Average (BA)

```
BA = hits / at_bats
```

Where at-bats exclude walks, HBP, sacrifice flies, sacrifice bunts, and catcher's interference.

### On-Base Percentage (OBP)

```
OBP = (hits + walks + HBP) / (PA - sac_bunts - catcher_interference)
```

### Slugging Percentage (SLG)

```
SLG = (1B + 2*2B + 3*3B + 4*HR) / at_bats
```

### OPS

```
OPS = OBP + SLG
```

### xSLGcon (Expected SLG on Contact)

The average expected slugging value of balls hit into play, based on Statcast's model using exit velocity and launch angle:

```
xSLGcon = AVG(estimated_slg_using_speedangle)   WHERE type = 'X' (ball in play)
```

This only counts pitches where the batter put the ball in play. A lower xSLGcon means the pitcher allows weaker contact.

> File: `app/api/starter-card/route.ts` lines 254-257

### Velocity Differential

How much slower a pitch is compared to the pitcher's primary fastball:

```
Velo Diff = pitch_avg_velo - primary_fastball_avg_velo
```

A negative value means the pitch is slower than the fastball (typical for changeups, curves).

> File: `app/api/starter-card/route.ts` line 263

---

## 10. ERA Estimators

These estimate what a pitcher's ERA "should" be based on underlying performance, removing the effects of defense, luck, and sequencing.

### FIP (Fielding Independent Pitching)

Estimates ERA using only outcomes the pitcher controls — strikeouts, walks, hit batters, and home runs:

```
FIP = ((13 * HR + 3 * (BB + HBP) - 2 * K) / IP) + cFIP
```

`cFIP` is a year-specific constant that scales FIP to match league-average ERA (typically around 3.1-3.2). The weights (13, 3, -2) reflect the run value of each event.

> File: `lib/expected-stats.ts` lines 34-38

### xFIP (Expected FIP)

Same as FIP but replaces actual home runs with the expected number based on fly ball count and the league-average HR/FB rate:

```
expected_HR = fly_balls * league_HR_per_FB_rate

xFIP = ((13 * expected_HR + 3 * (BB + HBP) - 2 * K) / IP) + cFIP
```

This removes the randomness of home run luck — a pitcher who gave up a lot of fly balls but happened to avoid home runs won't be "rewarded" by xFIP.

> File: `lib/expected-stats.ts` lines 44-49

### xERA (Expected ERA from xwOBA)

Converts Statcast's expected weighted on-base average into an ERA-scale number:

```
xERA = ((xwOBA - league_wOBA) / wOBA_scale) * (PA / IP) * 9 + league_ERA
```

- `xwOBA` comes from Statcast's model (exit velo, launch angle, sprint speed)
- `wOBA_scale` converts between the wOBA and runs scales
- `PA / IP * 9` converts per-PA run values to a per-9-innings rate

> File: `lib/expected-stats.ts` lines 56-61

### SIERA (Skill-Interactive ERA)

A more complex estimator that accounts for interactions between strikeout, walk, and ground ball rates:

```
SIERA = 6.145
  - 16.986 * (K / PA)
  + 11.434 * (BB / PA)
  -  1.858 * ((GB - FB - PU) / PA)
  +  7.653 * (K / PA)^2
  +  6.664 * ((GB - FB - PU) / PA)^2
  + 10.130 * (K / PA) * ((GB - FB - PU) / PA)
  -  5.195 * (BB / PA) * ((GB - FB - PU) / PA)
  -  0.986 * ln(IP)
```

The squared and interaction terms capture that high-K pitchers benefit more from ground balls, and that the relationship between walks and batted ball type is non-linear. The `ln(IP)` term accounts for workload/durability (pitchers who pitch more innings tend to be better).

Source: Swartz model coefficients.

> File: `lib/expected-stats.ts` lines 73-88

### Innings Pitched Parsing

IP in baseball is written in a special format where ".1" = 1/3 inning and ".2" = 2/3 inning:

```
"6.2" → 6 + 2/3 = 6.667 innings
"5.0" → 5.000 innings
"7.1" → 7 + 1/3 = 7.333 innings
```

> File: `lib/expected-stats.ts` lines 23-28

---

## 11. Park-Adjusted Stats

Different ballparks affect stats differently. A homer-friendly park inflates HR rates; a spacious park suppresses them. Park factors correct for this.

```
adjusted_stat = raw_stat * (100 / park_factor)
```

Applied to:
| Stat | Park Factor Used |
|------|-----------------|
| xwOBA | `basic` (overall runs factor) |
| HR% | `pf_hr` (home run factor) |
| K% | `pf_so` (strikeout factor) |
| BB% | `pf_bb` (walk factor) |

A park factor of 105 means 5% more of that event happens there. Dividing by 105/100 adjusts the stat downward to account for the park boost.

Park factors are 5-year rolling averages from FanGraphs for all 30 MLB teams.

> File: `app/api/park-adjusted/route.ts` lines 49-61, `lib/constants-data.ts` lines 27-61

---

## 12. Plus Stat System

Plus stats put every metric on a common scale where **100 = league average** and every 10 points = 1 standard deviation. A Stuff+ of 120 means the pitch is 2 standard deviations better than average.

### Core Formula

```
Plus = ((pitcher_average - league_mean) / league_stddev) * 10 + 100
```

This is a standard z-score scaled to a 100-centered scale. League baselines (mean and standard deviation) are stored per pitch type per year.

> File: `lib/leagueStats.ts` line 779

### Year-Weighted Plus

When a pitcher has data across multiple seasons, we compute the plus stat separately for each year (using that year's baselines) and then combine them weighted by usage:

```
Year-Weighted Plus = SUM(year_plus * year_pitch_count) / SUM(year_pitch_count)
```

> File: `lib/leagueStats.ts` lines 813-838

### Available League Baselines

Year-specific (2015-2025) mean and standard deviation by pitch type for:

| Metric | Description |
|--------|-------------|
| Brink | Distance to zone edge |
| Cluster | Distance from centroid |
| HDev | Horizontal deviation |
| VDev | Vertical deviation |
| Missfire | Average miss distance |
| Close% | Close miss percentage |
| Stuff | XGBoost run value |
| Centroids | League-average plate_x/plate_z per pitch type |

> File: `lib/leagueStats.ts` lines 9-587

---

## 13. Grades & Percentiles

### Plus-to-Grade Conversion

Converts a plus stat to a letter grade:

| Plus Range | Grade |
|-----------|-------|
| 130+ | A+ |
| 125-129 | A |
| 120-124 | A- |
| 115-119 | B+ |
| 110-114 | B |
| 105-109 | B- |
| 100-104 | C+ |
| 95-99 | C |
| 90-94 | C- |
| 85-89 | D+ |
| 80-84 | D |
| 75-79 | D- |
| Below 75 | F |

Grade colors: A = emerald, B = cyan, C = amber, D = orange, F = red.

> File: `lib/leagueStats.ts` lines 925-939

### Plus-to-Percentile Conversion

Converts a plus stat to a percentile (1-99) using the normal distribution:

```
z = (plus - 100) / 10
percentile = normalCDF(z) * 100   [clamped to 1-99]
```

A plus of 110 (z = 1.0) maps to roughly the 84th percentile. The normal CDF uses the Abramowitz & Stegun polynomial approximation.

> File: `lib/leagueStats.ts` lines 784-798

### Savant-Style Percentiles

For metrics displayed on percentile cards (like Baseball Savant's player pages), we interpolate between 5 breakpoints:

```
Breakpoints: [p10, p25, p50, p75, p90]
Mapped to:   [10,  25,  50,  75,  90]
```

If a value falls between two breakpoints, we linearly interpolate the percentile. Values beyond the extremes are clamped to 1 or 99.

Available for: avg_velo, max_velo, k_pct, bb_pct, whiff_pct, chase_pct, barrel_pct, hard_hit, avg_ev, xba, gb_pct, avg_spin, extension, ivb_ff, vaa_ff, unique_score, deception_score, xdeception_score.

> File: `lib/leagueStats.ts` lines 743-758

---

## 14. Pitch Trajectory Physics

Used for the 3D pitch flight visualization. Models the ball's path from release to the plate using constant-acceleration kinematics.

### Time to Plate

```
y_release = 50 - release_extension

discriminant = vy0^2 - 2 * ay * (y_release - plate_front_y)
time_to_plate = (-vy0 - sqrt(discriminant)) / ay
```

`plate_front_y = 17/12 feet` (17 inches, the front edge of home plate).

### Position at Time t

```
x(t) = x0 + vx0 * t + 0.5 * ax * t^2
y(t) = y0 + vy0 * t + 0.5 * ay * t^2
z(t) = z0 + vz0 * t + 0.5 * az * t^2
```

### Simulated Pitch (from user-defined parameters)

When creating a pitch from velocity and movement inputs instead of raw tracking data:

```
speed_ft_per_s = velocity_mph * 5280 / 3600

ax = (2 * horizontal_break_ft) / flight_time^2
az = -32.174 + (2 * vertical_break_ft) / flight_time^2
ay = -28   [approximate drag deceleration, ft/s^2]
```

`-32.174 ft/s^2` is gravity. The `az` formula adds the spin-induced break on top of gravitational drop.

### Perspective Projection (3D to Screen)

```
focal_length = canvas_height / 2 / tan(field_of_view / 2)
scale = focal_length / depth

screen_x = canvas_width/2 + horizontal_offset * scale
screen_y = canvas_height/2 - vertical_offset * scale
```

> File: `lib/trajectoryPhysics.ts` lines 79-152, 184-236

---

## 15. Batted Ball Trajectory

Models the flight of a batted ball using projectile motion with air drag.

### Physics Model

```
gravity = 32.174 ft/s^2
drag_coefficient (Cd) = 0.35
air_density (rho) = 0.0023769 slugs/ft^3
baseball_cross_section (A) = 0.02922 ft^2
baseball_mass = 5 oz = 0.3125 / 32.174 slugs

drag_factor (k) = 0.5 * Cd * rho * A / mass
```

Euler integration with 20ms timesteps:

```
speed = sqrt(vx^2 + vy^2 + vz^2)
drag_accel = k * speed

vx_new = vx - drag_accel * vx/speed * dt
vy_new = vy - drag_accel * vy/speed * dt
vz_new = vz - (gravity + drag_accel * vz/speed) * dt

x_new = x + vx * dt
y_new = y + vy * dt
z_new = z + vz * dt
```

Simulation stops when `z < 0` (ball hits the ground) or after 10 seconds.

### Spray Angle

Direction the ball was hit, measured from home plate coordinates:

```
spray_angle = arctan((hc_x - 125.42) / (198.27 - hc_y))   [in degrees]
```

`(125.42, 198.27)` is home plate in Statcast's hit coordinate system. 0 degrees is straight up the middle, negative is toward left field, positive is toward right field.

> File: `lib/trajectoryPhysics.ts` lines 265-335

---

## 16. Pitcher Workload & Risk (PURI)

The Pitcher Usage & Risk Intelligence engine monitors workload and fatigue indicators.

### ACWR (Acute-to-Chronic Workload Ratio)

Compares recent workload to the pitcher's established workload pattern:

```
acute_load   = total_pitches in last 7 days
chronic_load = average pitches per 7-day period over the last 28 days

ACWR = acute_load / chronic_load
```

| ACWR | Interpretation |
|------|---------------|
| > 1.5 | Workload spike (high injury risk, +25 risk) |
| > 1.3 | Caution zone (+12 risk) |
| 0.8-1.3 | Normal range |
| < 0.8 | Underwork (detraining, +8 risk) |

### Velocity Fade

How much velocity a pitcher loses over the course of a game:

```
velo_fade = first_inning_avg_velo - last_inning_avg_velo
```

A fade greater than 1.5 mph is an alarm (+20 risk). Greater than 1 mph adds +10.

### Risk Score

Starts at a baseline of 20 and adjusts based on multiple factors, capped at 0-100:

| Factor | Adjustment |
|--------|-----------|
| Workload spike (ACWR > 1.5) | +25 |
| Workload caution (ACWR > 1.3) | +12 |
| Underwork (ACWR < 0.8) | +8 |
| Velo alarm (> 1.5 mph fade) | +20 |
| Velo concern (> 1 mph fade) | +10 |
| Short rest | +15 |
| Back-to-back appearances | +10 |
| High-leverage load | +10 |
| Velo fade in-game | +10 |
| Heavy game (high pitch count) | +8 |
| Sweet-spot workload bonus | -10 |

### Role Detection

```
avg_pitches_per_game > 60 → Starter
otherwise → Reliever
```

> File: `lib/engines/puri.ts`

---

## 17. Umpire Scorecard

Evaluates umpire accuracy on called pitches (pitches where the batter didn't swing).

### Zone Definitions

```
In Zone:  |plate_x| <= 0.83 AND plate_z BETWEEN sz_bot AND sz_top
Shadow:   Within 1-inch buffer (0.083 feet) around the zone edge
```

### Accuracy

```
correct_call = (in_zone AND called_strike) OR (out_of_zone AND called_ball)

Overall Accuracy   = correct_calls / total_called_pitches * 100
Non-Shadow Accuracy = correct_non_shadow_calls / non_shadow_called_pitches * 100
```

The shadow zone is the 1-inch band around the edge where pitches are genuinely borderline. Excluding it shows how often the umpire gets clear-cut calls right.

> File: `app/api/umpire/route.ts` lines 5-12

---

## 18. Game Intelligence Engines

These engines provide real-time pitch suggestions and analysis during games.

### PAIE (Pitch Approach Intelligence Engine)

Scores zones based on historical batter damage:

```
zone_score = 0.3 * avg_exit_velo + 0.4 * barrel_pct + 0.3 * (xwOBA * 300)
```

Confidence adjustments:
| Factor | Range |
|--------|-------|
| Chase zone bonus (swing% > 30, whiff% > 35) | up to +20 |
| Fatigue | +/- 15 |
| Count advantage/disadvantage | +/- 10 |
| Times Through Order exposure | -10 to +5 |
| Head-to-head damage | -15 |

> File: `lib/engines/paie.ts`

### CGCIE (Catcher's Game-Call Intelligence Engine)

Recommends the next pitch call based on arsenal effectiveness and sequencing patterns:

```
base_confidence = 0.4 * whiff% + 0.3 * (100 - avg_damage/1.5) + 0.3 * usage%
```

Then applies 13 adjustment rules:

| Rule | Adjustment |
|------|-----------|
| Same pitch repeated | -12 |
| Same pitch three times | -25 |
| Recent pitch recency | -5 per occurrence |
| Large speed differential (> 8 mph gap) | +8 to +15 |
| Tunnel effect (similar early trajectory) | +8 |
| Transition whiff (pitch after different type) | up to +12 |
| Transition damage (got hit last time) | -10 |
| Pattern disruption (breaks sequence) | +8 |
| First-pitch predictability | -8 |
| H2H damage (batter owns this pitch) | -12 |
| H2H whiff success | +8 |
| Put-away count (two strikes) | +10 |
| Hitter's count (batter advantage) | -8 |

> File: `lib/engines/cgcie.ts`

### HAIE (Hitter's Approach Intelligence Engine)

Advises batters on which zones to attack and which pitches to take:

```
zone_score = 0.3 * avg_exit_velo + 0.4 * barrel_pct + 0.3 * (xwOBA * 300)
```

- "Sit-on" zones: the 3 zones with highest attack scores
- Chase warnings: zones outside the strike zone where the batter has high swing% and high whiff%
- Fatigue detection: flags when pitcher velocity drops more than 1 mph below season average

> File: `lib/engines/haie.ts`

---

## 19. Trends & Alerts

Detects when a pitcher's recent performance deviates significantly from their season average.

### Sigma (Standard Deviation Alert)

```
delta = recent_14_day_value - full_season_value
sigma = delta / population_stddev
```

`population_stddev` is the standard deviation of that metric across all qualifying players.

An alert fires when `|sigma| >= 1.5`, meaning the recent change is at least 1.5 standard deviations from normal variation.

> File: `app/api/trends/route.ts` lines 92-99

---

## 20. Constants & Baselines

### Physical Constants

| Constant | Value | Description |
|----------|-------|-------------|
| Rubber-to-plate distance | 60.5 ft | Mound to front of plate |
| Plate front | 17 inches (1.417 ft) | Front edge of home plate |
| Zone half-width | 0.83 ft | Half plate width + ball radius |
| Gravity | 32.174 ft/s^2 | Standard gravity |
| Baseball mass | 5 oz | Official ball weight |
| Forward drag deceleration | ~28 ft/s^2 | Approximate air resistance on pitched ball |

### FanGraphs Guts! Constants (Year-Specific)

Used for ERA estimators and run value conversions. Stored for 2015-2025:

| Constant | Description |
|----------|-------------|
| `woba` | League-average wOBA |
| `woba_scale` | Converts wOBA to runs |
| `wbb`, `whbp`, `w1b`, `w2b`, `w3b`, `whr` | Linear weights for each event |
| `cfip` | FIP constant to align with league ERA |
| `lg_era` | League-average ERA |
| `lg_babip` | League-average BABIP |
| `lg_k_pct`, `lg_bb_pct`, `lg_hr_pct` | League-average rates |
| `lg_hr_fb` | League-average HR per fly ball |

> File: `lib/constants-data.ts` lines 4-22

### Statcast Hit Coordinate System

Home plate is at coordinates `(125.42, 198.27)`. The x-axis runs left-right and the y-axis runs catcher-to-outfield. Spray angle is computed relative to this origin.

### Statcast Zone Numbering

Zones 1-9 are inside the strike zone (3x3 grid). Zones 11-14 are outside the zone. This is used for Zone%, Chase%, and Str% calculations.
