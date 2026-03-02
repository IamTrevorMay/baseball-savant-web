# Deception Metrics: Unique, Deception, and xDeception

## Overview

Three complementary metrics that quantify how unusual and deceptive a pitcher's ball flight characteristics are relative to league norms. Each metric captures a different dimension of "deception" — the degree to which a pitcher's pitches deviate from what hitters typically see.

| Metric | What it measures | Whiff% correlation | Year-over-year stability |
|---|---|---|---|
| **Unique** | How unusual the ball flight is (magnitude only) | r = -0.03 | 0.934 |
| **Deception** | Directional deviation toward deceptive profiles | r = +0.27 | 0.934 |
| **xDeception** | Empirically optimized whiff prediction | r = +0.37 | — |

**Unique** is highly stable but not predictive on its own — being unusual doesn't inherently help. **Deception** adds directionality (certain deviations are good, others bad), which makes it predictive. **xDeception** uses regression weights derived from actual whiff% outcomes to maximize predictive validity.

---

## Foundation: Z-Score Baselines

All three metrics are built on the same z-score foundation. For each combination of:

- **Handedness** (`p_throws`: L or R)
- **Pitch type** (`pitch_type`: FF, SI, FC, SL, CU, CH, etc.)
- **Season** (`game_year`: 2017–2025)

We compute league baselines from all qualified pitchers (minimum 100 pitches of that type in that season). The five ball-flight components are:

| Component | Formula | What it captures |
|---|---|---|
| **VAA** (Vertical Approach Angle) | `DEGREES(ATAN((release_pos_z - plate_z) / (60.5 - release_extension)))` | The vertical angle at which the ball arrives at the plate. Flatter (less negative) VAA on fastballs makes them appear to "rise." |
| **HAA** (Horizontal Approach Angle) | `DEGREES(ATAN((release_pos_x - plate_x) / (60.5 - release_extension)))` | The horizontal angle of approach. Extreme HAA creates lateral deception. |
| **VB** (Vertical Break) | `pfx_z * 12` (inches) | Induced vertical movement. High VB on fastballs = "rise"; low VB on breaking balls = sharp drop. |
| **HB** (Horizontal Break) | `pfx_x * 12` (inches) | Induced horizontal movement. Drives lateral separation between pitch types. |
| **Extension** | `release_extension` (feet) | How far toward home plate the pitcher releases the ball. More extension = less reaction time. |

### Z-Score Calculation

For each pitcher's season average on each component:

```
z = (pitcher_avg - league_avg) / league_stddev
```

Where `league_avg` and `league_stddev` are computed from all pitchers of the same handedness throwing the same pitch type in that season. This normalizes across pitch types (a z-score of +1.0 on FF VAA means the same thing as +1.0 on SL VAA — one standard deviation above average).

### Qualification

- **Per pitch type**: Minimum 100 pitches of that type in the season
- **Overall scores**: Minimum 500 total pitches in the season
- **League baselines**: Minimum 2 qualified pitchers per handedness × pitch type group

---

## Metric 1: Unique

**What it measures**: How statistically unusual a pitcher's ball flight characteristics are, regardless of whether the deviations help or hurt.

### Formula

Unique uses **absolute z-scores** — it doesn't matter which direction you deviate, only how far from average you are.

**Fastballs** (FF, SI, FC):
```
Unique = 0.25×|z_vaa| + 0.15×|z_vb| + 0.20×|z_hb| + 0.20×|z_haa| + 0.20×|z_ext|
```

**Off-speed** (SL, CH, CU, FS, KC, ST, SV, SW):
```
Unique = 0.30×|z_vaa| + 0.20×|z_vb| + 0.25×|z_hb| + 0.25×|z_haa|
```

Extension is excluded from off-speed because extension varies less across off-speed pitches and is more impactful for fastballs (where it directly affects perceived velocity).

**Overall Unique** = pitch-count-weighted average across all of a pitcher's pitch types.

### Weight Rationale

- **VAA** gets the highest or tied-highest weight because approach angle is the primary driver of pitch perception — it determines the "plane" the hitter must adjust to
- **HB and HAA** are weighted meaningfully because horizontal deception creates left-right uncertainty
- **VB** is weighted lower on fastballs because vertical break variation is partially captured by VAA
- **Extension** matters for fastballs because it compresses reaction time

### Interpretation

| Unique Score | Meaning |
|---|---|
| > 1.20 | Elite uniqueness (90th percentile) — pitch characteristics most hitters rarely see |
| 0.93 | 75th percentile |
| 0.73 | 50th percentile — league average uniqueness |
| 0.56 | 25th percentile |
| < 0.44 | 10th percentile — very conventional ball flight |

### Why it's useful

Unique is not predictive of outcomes on its own (r = -0.03 with whiff%), but it is:

1. **Extremely stable** (0.934 year-over-year correlation) — it measures a true pitcher trait, not noise
2. **A building block** — it tells you *how different* a pitcher is, which matters for scouting context
3. **Complementary** — a pitcher with high Unique but low Deception has unusual stuff that isn't being leveraged effectively (potential coaching opportunity)

---

## Metric 2: Deception

**What it measures**: Directional deviation toward ball-flight profiles that are empirically harder to hit. Unlike Unique, Deception encodes *which direction* of deviation is beneficial.

### Formula

Deception uses **signed z-scores** with positive/negative weights encoding direction.

**Fastballs** (FF, SI, FC):
```
Deception = -0.25×z_vaa + 0.35×z_ext + 0.20×z_vb + -0.10×z_hb + -0.10×z_haa
```

**Off-speed** (SL, CH, CU, FS, KC, ST, SV, SW):
```
Deception = 0.35×z_vaa + 0.25×z_ext + 0.20×z_vb + -0.10×z_hb + 0.10×z_haa
```

**Overall Deception** = pitch-count-weighted average across all pitch types.

### Weight Rationale — What Makes Each Component Deceptive

**Fastball deception drivers:**

| Component | Weight | Sign | Why |
|---|---|---|---|
| VAA | 0.25 | **Negative** (flatter is better) | Flatter VAA on fastballs creates the illusion of "rise." Hitters must adjust their swing plane to match, and most are calibrated for average VAA. A negative z-score (flatter than average) gets rewarded. |
| Extension | 0.35 | **Positive** (more is better) | More extension = ball released closer to the plate = less reaction time. This is the strongest single contributor to fastball deception because it directly reduces the time hitters have to process pitch information. |
| VB | 0.20 | **Positive** (more rise is better) | More induced vertical break on fastballs makes them "ride" through the zone, generating swings underneath. Works synergistically with flat VAA. |
| HB | 0.10 | **Negative** (less is better) | Counter-intuitive: less horizontal break on fastballs means the ball stays on the perceived trajectory longer before deviating, making it harder to recognize pitch type early. |
| HAA | 0.10 | **Negative** (less is better) | Similar logic — a more direct horizontal approach angle gives hitters less lateral cue about where the pitch will end up. |

**Off-speed deception drivers:**

| Component | Weight | Sign | Why |
|---|---|---|---|
| VAA | 0.35 | **Positive** (steeper is better) | The opposite of fastballs — steeper approach angles on off-speed create maximum *difference* from the fastball. Hitters calibrate to the fastball VAA, so off-speed that deviates maximally in the other direction is hardest to adjust to. |
| Extension | 0.25 | **Positive** (more is better) | Same as fastballs — more extension compresses timing on all pitch types. |
| VB | 0.20 | **Positive** (more drop is better) | More vertical break on off-speed (lower VB, which is positive z-score for "more break than average") creates sharper downward action. |
| HB | 0.10 | **Negative** | Off-speed with less horizontal break stays on the fastball's trajectory longer before diving, delaying pitch recognition. |
| HAA | 0.10 | **Positive** | Wider horizontal approach on off-speed creates lateral separation from fastball tunnel. |

### Interpretation

| Deception Score | Meaning |
|---|---|
| > 0.48 | 90th percentile — elite deceptive profile |
| 0.25 | 75th percentile |
| 0.02 | 50th percentile — league average |
| -0.22 | 25th percentile |
| < -0.45 | 10th percentile — hitter-friendly ball flight |

### Why it's useful

Deception captures the *quality* of unusualness (r = +0.27 with whiff%). It tells you:

1. Whether a pitcher's stuff moves in ways that genuinely deceive hitters
2. Which pitch types are contributing to or detracting from overall deception
3. Potential arsenal optimization targets — if a pitcher's slider has high Unique but negative Deception, the movement is unusual but in a hitter-friendly direction

---

## Metric 3: xDeception

**What it measures**: Expected deception based on empirically derived regression weights that maximize correlation with actual whiff rates.

### Formula

xDeception operates at the **pitcher level** (not per pitch type). It takes the pitch-count-weighted average z-scores for fastballs (FB) and off-speed (OS) separately, then applies regression coefficients:

```
xDeception =
  FB_VAA × (-1.2219) + FB_HAA × (-0.2740) + FB_VB × (0.3830) +
  FB_HB × (-0.2684) + FB_EXT × (-0.8779) +
  OS_VAA × (1.1265) + OS_HAA × (0.3900) + OS_VB × (0.0947) +
  OS_HB × (-0.2621) + OS_EXT × (1.2845)
```

Where `FB_VAA` is the pitcher's pitch-count-weighted average VAA z-score across all fastball types (FF, SI, FC), and similarly for other components.

### Coefficient Interpretation

The regression coefficients tell us what the data says matters most for generating whiffs:

| Input | Coefficient | Interpretation |
|---|---|---|
| OS Extension | **+1.2845** | Strongest positive driver. Off-speed with high extension is devastating — the ball is released closer to the plate with less time to recognize it's not a fastball. |
| OS VAA | **+1.1265** | Steep off-speed approach angle creates maximum separation from fastball plane. |
| FB VAA | **-1.2219** | Flat fastball VAA is the strongest single FB driver. Confirms the "rising fastball" effect. |
| FB Extension | **-0.8779** | Negative because the z-score convention: more extension = negative deviation in the model's parameterization. The magnitude confirms extension matters greatly. |
| OS HAA | **+0.3900** | Wider horizontal approach on off-speed aids deception. |
| FB VB | **+0.3830** | More ride on fastballs generates whiffs. |
| FB HAA | **-0.2740** | Direct fastball approach horizontally. |
| FB HB | **-0.2684** | Less horizontal movement on fastballs. |
| OS HB | **-0.2621** | Less horizontal movement on off-speed (stays on FB trajectory longer). |
| OS VB | **+0.0947** | Minimal independent contribution — vertical break on off-speed is largely captured by VAA. |

### Requirement

xDeception requires a pitcher to throw **both** fastballs and off-speed pitches (with qualifying pitch counts). Pitchers who throw exclusively one category will not have an xDeception score.

### Interpretation

| xDeception Score | Meaning |
|---|---|
| > 1.11 | 90th percentile — elite predicted whiff generation from ball flight |
| 0.58 | 75th percentile |
| -0.03 | 50th percentile |
| -0.58 | 25th percentile |
| < -1.31 | 10th percentile |

### Why it's useful

xDeception is the most predictive single metric (r = +0.37 with whiff%) because:

1. **Empirically grounded** — weights come from actual outcomes, not theory
2. **Captures interactions** — the regression naturally accounts for how FB and OS characteristics interact (e.g., flat FB VAA + steep OS VAA = maximum tunnel disruption)
3. **Actionable** — the coefficients tell you exactly which changes would most improve a pitcher's deception profile

---

## How the Three Metrics Work Together

| Scenario | Unique | Deception | xDeception | Interpretation |
|---|---|---|---|---|
| High | High | High | **Elite deceiver** — unusual stuff that moves in the right directions. Peak performance. |
| High | Low | Low | **Unusual but not deceptive** — the ball flight is rare but the deviations are in hitter-friendly directions. Coaching opportunity: if the movement profile could be redirected, the uniqueness could become an asset. |
| Low | High | High | **Efficiently deceptive** — doesn't need to be dramatically different from average because the small deviations are all in the right directions. Often seen in crafty veterans. |
| Low | Low | Low | **Conventional** — league-average ball flight in every dimension. Must rely on command, sequencing, or other skills to succeed. |
| High | High | Low | **Per-pitch deceptive but poor interaction** — individual pitch types are deceptive but the FB/OS combination doesn't create good tunneling. Could benefit from arsenal reconfiguration. |

---

## Practical Applications

### Scouting

- Identify pitchers whose ball flight profiles predict future whiff improvement (high xDeception, currently underperforming in K%)
- Flag prospects with elite Unique scores who might benefit from pitch design adjustments to convert unusualness into deception

### Player Development

- Diagnose which components drive a pitcher's deception (or lack thereof)
- Quantify the impact of mechanical changes (e.g., gaining extension, altering release point) on projected deception
- Compare a pitcher's pre- and post-adjustment deception profiles

### In-Game Strategy

- Identify pitchers whose deception metrics suggest vulnerability despite good surface stats (low Deception/xDeception but high K% may regress)
- Inform lineup construction: hitters who struggle against specific deception profiles

### Fantasy / Analytics

- xDeception as a leading indicator for whiff% and K% changes
- Year-over-year Unique stability (0.934) makes it a reliable trait identifier

---

## Data Coverage

| Season | Pitchers | Pitch-Type Rows |
|---|---|---|
| 2017 | 588 | 1,743 |
| 2018 | 607 | 1,705 |
| 2019 | 640 | 1,782 |
| 2020 | 458 | 965 |
| 2021 | 660 | 1,805 |
| 2022 | 625 | 1,800 |
| 2023 | 635 | 1,859 |
| 2024 | 609 | 1,862 |
| 2025 | 617 | 1,938 |

Qualification: 100 pitches minimum per pitch type, 500 pitches minimum for overall scores.

---

## 2024 Deception Leaders

| Pitcher | Overall Deception | Overall Unique | Pitch Types |
|---|---|---|---|
| Alexis Diaz | 1.101 | 1.274 | FF, SL |
| Edwin Diaz | 0.942 | 1.221 | FF, SL |
| Colin Poche | 0.933 | 1.283 | FF, SL |
| Logan Gilbert | 0.915 | 0.977 | CU, FC, FF, FS, SL |
| Josh Hader | 0.898 | 1.379 | SI, SL |
| Aroldis Chapman | 0.888 | 1.434 | FF, FS, SI, SL |
| Joey Cantillo | 0.888 | 1.256 | CH, CU, FF |
| Bailey Falter | 0.880 | 1.000 | CU, FF, SI, SL |
| Bailey Ober | 0.856 | 0.633 | CH, FF, SL, ST |
| Zack Wheeler | 0.792 | 0.825 | CU, FC, FF, FS, SI, ST |

Note: Bailey Ober is an interesting case — relatively average Unique (0.633) but high Deception (0.856), meaning his stuff isn't dramatically unusual but the deviations are highly efficient. This is the "efficiently deceptive" archetype.
