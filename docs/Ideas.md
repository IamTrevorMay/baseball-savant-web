# Ideas Log

Living document of exploratory conversations around metrics, algorithms, and analytical concepts.
Entries are added manually when prompted.

---

## 2026-06-04 — Momentum Differential & Composite Win Predictors

### Context
Explored how well the existing Momentum Differential (SD For% - SD Against%) predicts team win percentage over 2022–2026 (150 team-seasons), and whether a weighted composite could do better.

### Findings

**Momentum Differential is mostly redundant with Run Differential.**
- Momentum Diff vs Win%: r = 0.649, R² = 0.422
- Run Diff vs Win%: r = 0.910, R² = 0.828
- Momentum Diff vs Run Diff: r = 0.669 (heavily correlated)
- Adding momentum to run diff *hurts* the model (R² drops from 0.828 to 0.803)
- Response Diff and SD Diff produce identical correlations (r = 0.649) — same signal from opposite sides of the ball
- Leverage Shutdown For has nearly zero correlation with winning (r = -0.017)

**Close-game win% captures independent signal that momentum doesn't.**
- Close-game win% (decided by ≤2 runs) vs Win%: r = 0.658
- Close-game win% vs Run Diff: r = 0.404 (relatively independent)
- Best composite: **Run Diff (70%) + Close-Game Win% (30%) → R² = 0.929**
- This is a 10pp improvement over run diff alone

**Composite weight sensitivity (all z-scored):**
| Composite | R² |
|-----------|-----|
| Run Diff alone | 0.828 |
| RD 70% + Close Win% 30% | **0.929** |
| RD 60% + Close Win% 40% | 0.917 |
| RD 80% + Close Win% 20% | 0.913 |
| RD 70% + 1-Run Win% 30% | 0.902 |
| RD 55% + Close 25% + Momentum 20% | 0.921 |
| RD 70% + Momentum 30% | 0.803 |

### Game-Level Conversion Buckets (2025)
Bucketed every game by whether a team had More, Even, or Fewer total momentum conversions (SD For + R For successes) than their opponent.

**League-wide patterns:**
- "More" bucket: teams win ~78–88% of the time with large positive run diffs
- "Fewer" bucket: teams win ~10–30% with large negative run diffs
- "Even" bucket: ~45–65% win rate, near-zero run diffs — this is where team quality separates

**Notable 2025 outliers:**
- DET "More": 63-4 (.940) — best in MLB. Elite pitching, but only 67 games in this bucket (low offense limits opportunities)
- COL "Fewer": 5-81 (.058) — nearly unwinnable
- BAL "Fewer": 84 games — most in MLB, opponents out-converted them in over half their games
- PHI "Even": 15-4 (.789) — best Even-bucket record, won tight games regardless of conversion edge
- CIN "More": 68-10 (.872) — second best More win rate despite middling overall record

### Potential Metric: "Resilience Score"
A composite team-level metric combining:
1. **Run Differential** (70%) — raw production
2. **Close-Game Win%** (30%) — bullpen quality, clutch sequencing, managerial decisions in tight spots

This outperforms momentum-based composites because close-game performance captures variance that run differential misses (sequencing, bullpen, late-game execution) while momentum differential is largely just run differential in disguise.

### Conversion Bucket Metrics — Correlation Analysis (2022–2026, 150 team-seasons)

Tested whether the game-level conversion buckets (More/Even/Fewer) produce better team-level metrics than raw momentum differential.

**Individual correlations with Win%:**
| Metric | r | R² | vs Run Diff (r) |
|--------|---|----|-----------------|
| Run Differential | .910 | .828 | — |
| Conversion Edge Rate | .757 | .572 | .750 |
| Close-Game Win% | .658 | .433 | .404 |
| Even-Bucket Win Rate | .638 | .407 | .552 |
| Fewer-Bucket Win Rate | .637 | .406 | — |

**Edge Rate is the strongest single momentum-derived metric** (r = .757) — well above raw momentum differential (.649). But it's highly correlated with run differential (.750), so it carries less independent signal than close-game win% (.404 vs run diff).

**Independence between bucket metrics:**
- Edge Rate vs Even Win Rate: r = .369 (fairly independent)
- Edge Rate vs Close Win%: r = .345
- Even Win Rate vs Close Win%: r = .443

**Composite R² values:**
| Composite | R² |
|-----------|-----|
| **Run Diff 70% + Close Win% 30%** | **.929 (still best)** |
| Edge + Even + Fewer + RD (30/15/15/40) | .907 |
| Edge 50% + Even 20% + Fewer 30% | .871 |
| Edge 30% + Even 20% + RD 50% | .863 |
| Edge 30% + RD 70% | .834 |
| Run Diff alone | .828 |
| Edge 60% + Even 40% | .722 |

### Key Conclusions

1. **Run Diff + Close-Game Win% (70/30) remains the best composite at R² = .929.** Nothing from the conversion bucket framework beats it as a predictive model.

2. **Conversion Edge Rate is a better metric than Momentum Differential.** It replaces the .649 correlation with .757, but it's still mostly redundant with run differential (.750 cross-correlation). The skill isn't in what you do when you have the edge — it's in how often you get the edge, which is mostly driven by being a better team overall.

3. **The bucket framework captures nearly as much as run differential without using it.** Edge + Even + Fewer together (R² = .871) approaches run differential alone (.828) from a completely different angle. This makes the buckets valuable as a **scouting/narrative lens** even if they don't outperform the simpler predictive model.

4. **Even-Bucket Win Rate is the most independent signal.** It has the lowest correlation with both run differential (.552) and edge rate (.369). It captures something distinct — how a team performs when neither side has a conversion advantage. This is likely a proxy for pitching depth, lineup consistency, and managerial decisions in neutral game states.

5. **The conversion buckets are better for team profiling than prediction.** They reveal archetypes:
   - **Dominant**: high edge rate + high more-bucket win rate (2025 CHC, CIN)
   - **Boom-or-bust**: extreme more/fewer split, low even-bucket wins (2025 DET, ATL)
   - **Resilient**: high even-bucket and fewer-bucket win rates (2025 PHI, MIL)
   - **Fragile**: low fewer-bucket win rate, few more-bucket games (2025 COL, BAL)

### Close-Game Win% Is Not Repeatable (2021–2026)

Tested year-over-year autocorrelation of close-game win% (games decided by ≤2 runs) across 150 consecutive team-season pairs.

**YoY autocorrelation by pair:**
| Pair | Close Win% r | Win% r |
|------|-------------|--------|
| 2021→22 | .270 | .550 |
| 2022→23 | -.116 | .528 |
| 2023→24 | -.001 | .534 |
| 2024→25 | .382 | .694 |
| 2025→26 | .098 | .308 |
| **Pooled** | **.123** | **.523** |

**Stability comparison (pooled, 150 pairs):**
| Metric | YoY autocorrelation | Predicts next year Win% |
|--------|--------------------|-----------------------------|
| Run Differential | .580 | .564 |
| Win% | .523 | — |
| Close-Game Win% | **.123** | **.190** |

**Implications for the Resilience Score concept:**
- Close-game win% explains 92.9% of concurrent win% variance (in the 70/30 composite) but has almost zero year-over-year stability (r = .123). Two of five year-pairs are negative or flat.
- It barely predicts *itself* next year, let alone next year's record (r = .190 vs .564 for run diff).
- **Conclusion: close-game win% is a descriptive/retrospective metric, not a predictive one.** It captures in-season variance — luck, sequencing, small-sample bullpen performance — rather than a repeatable team skill.
- For **projections** (preseason, trade deadline evaluation), lean on run differential alone or find the repeatable skills that *drive* close-game outcomes (bullpen FIP, defensive runs saved, baserunning efficiency) rather than the outcome itself.
- For **narrative/retrospective analysis** (end-of-season reviews, team profiling), the 70/30 composite remains excellent at explaining what happened and why a team's record diverged from their run differential.

### Open Questions
- Can we decompose Even-bucket win rate into actionable components (bullpen ERA, pinch-hit performance, defensive runs saved)?
- Would conversion buckets be useful as an in-season "team identity" dashboard on the Teams page?
- Is there a minimum game threshold where Edge Rate stabilizes? (Could be useful for in-season projections)
- Which underlying skills (bullpen FIP, defensive runs saved, baserunning) are repeatable AND drive close-game performance? Building a composite from those inputs rather than the outcome itself could yield a metric that's both descriptive and predictive.

---
