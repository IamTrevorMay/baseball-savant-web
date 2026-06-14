"""
1v1 Baseball Duel — Scoring Simulator
======================================

Format: 1 pitcher vs 1 hitter, 6 ABs total (2 per inning x 3 innings).
Each AB resolves to one of 9 outcomes; outcome awards points to ONE side (zero-sum, no double-count).

v2 scoring (locked 2026-06-14 after lever sweep — see sim_1v1_levers.py / sim_1v1_levers_v2.py):
    Pitcher scores:
        strikeout        +2   (lowered from v1's +3 to flatten K spike; brought elite-vs-elite to ~50/50)
        soft_contact     +1   (frequent "small ball" defense)
    Hitter scores:
        walk             +2   (rewards discipline; hitter's non-hit floor)
        barrel           +4   (premium contact, even if it's caught)
        single           +2
        double           +3
        triple           +4
        home_run         +5
    Neutral (0/0):
        hard_no_barrel   0    (hitter denies pitcher a point — contact defense)

Outcome distributions per archetype are realistic 2024-25 MLB rate stats.
Matchup probabilities combine pitcher + hitter via log5 against league average.

Usage:
    python scripts/sim_1v1.py                              # all 4 pairings, N=10000
    python scripts/sim_1v1.py --pitcher power --hitter contact --n 50000
    python scripts/sim_1v1.py --tune                       # quick re-run after editing SCORING
"""

from __future__ import annotations
import argparse
import random
from collections import Counter
from statistics import mean, stdev

# --------------------------------------------------------------------------
# TUNABLE: scoring table. Edit and re-run.
# --------------------------------------------------------------------------
SCORING: dict[str, tuple[int, int]] = {
    # outcome:        (pitcher_pts, hitter_pts)
    "strikeout":      (2, 0),
    "walk":           (0, 2),
    "soft_contact":   (1, 0),
    "hard_no_barrel": (0, 0),   # neutral — contact defense
    "barrel":         (0, 4),
    "single":         (0, 2),
    "double":         (0, 3),
    "triple":         (0, 4),
    "home_run":       (0, 5),
}

# --------------------------------------------------------------------------
# Outcome probabilities per AB (must sum to ~1.0 per archetype).
# Based on 2024-25 MLB season rates.
# --------------------------------------------------------------------------
# League average reference (used as log5 denominator).
LEAGUE_AVG: dict[str, float] = {
    "strikeout":      0.220,
    "walk":           0.085,
    "soft_contact":   0.330,
    "hard_no_barrel": 0.110,
    "barrel":         0.030,   # barrel that goes for out
    "single":         0.140,
    "double":         0.045,
    "triple":         0.005,
    "home_run":       0.035,
}

PITCHERS: dict[str, dict[str, float]] = {
    "power": {   # Skubal-like: high K, low BB, gives up some HR
        "strikeout":      0.32,
        "walk":           0.070,
        "soft_contact":   0.300,
        "hard_no_barrel": 0.090,
        "barrel":         0.030,
        "single":         0.120,
        "double":         0.035,
        "triple":         0.005,
        "home_run":       0.030,
    },
    "control": {  # Eovaldi-like: low BB, lots of soft contact, average K
        "strikeout":      0.22,
        "walk":           0.040,
        "soft_contact":   0.380,
        "hard_no_barrel": 0.120,
        "barrel":         0.030,
        "single":         0.140,
        "double":         0.040,
        "triple":         0.005,
        "home_run":       0.025,
    },
}

HITTERS: dict[str, dict[str, float]] = {
    "power": {   # Judge-like: high K, high BB, high barrel/HR
        "strikeout":      0.28,
        "walk":           0.130,
        "soft_contact":   0.230,
        "hard_no_barrel": 0.110,
        "barrel":         0.027,
        "single":         0.100,
        "double":         0.050,
        "triple":         0.003,
        "home_run":       0.070,
    },
    "contact": {  # Arraez-like: low K, mid BB, lots of contact, few HR
        "strikeout":      0.11,
        "walk":           0.080,
        "soft_contact":   0.400,
        "hard_no_barrel": 0.130,
        "barrel":         0.020,
        "single":         0.180,
        "double":         0.050,
        "triple":         0.005,
        "home_run":       0.025,
    },
}

HIT_OUTCOMES = {"single", "double", "triple", "home_run"}


# --------------------------------------------------------------------------
# log5 matchup combiner
# --------------------------------------------------------------------------
def log5(p_h: float, p_p: float, p_lg: float) -> float:
    """Combine independent hitter + pitcher rates against league avg."""
    if p_lg <= 0 or p_lg >= 1:
        return p_h
    num = (p_h * p_p) / p_lg
    den = num + ((1 - p_h) * (1 - p_p) / (1 - p_lg))
    return num / den if den > 0 else 0.0


def matchup_probs(pitcher: dict, hitter: dict) -> dict[str, float]:
    raw = {
        outcome: log5(hitter[outcome], pitcher[outcome], LEAGUE_AVG[outcome])
        for outcome in LEAGUE_AVG
    }
    total = sum(raw.values())
    return {k: v / total for k, v in raw.items()}


# --------------------------------------------------------------------------
# Simulator
# --------------------------------------------------------------------------
def sample_outcome(probs: dict[str, float], rng: random.Random) -> str:
    r = rng.random()
    cum = 0.0
    for outcome, p in probs.items():
        cum += p
        if r <= cum:
            return outcome
    return outcome  # float drift safety


def simulate_game(probs: dict[str, float], rng: random.Random, n_abs: int = 6):
    p_score = h_score = 0
    outcomes: list[str] = []
    for _ in range(n_abs):
        o = sample_outcome(probs, rng)
        outcomes.append(o)
        dp, dh = SCORING[o]
        p_score += dp
        h_score += dh
    return p_score, h_score, outcomes


def run_monte_carlo(pitcher_name: str, hitter_name: str, n: int, seed: int = 42):
    rng = random.Random(seed)
    probs = matchup_probs(PITCHERS[pitcher_name], HITTERS[hitter_name])

    p_scores: list[int] = []
    h_scores: list[int] = []
    margins: list[int] = []   # positive = pitcher won
    pitcher_wins = hitter_wins = ties = 0
    zero_hit_hitter_wins = 0
    zero_hit_games = 0
    outcome_totals: Counter = Counter()

    for _ in range(n):
        ps, hs, outs = simulate_game(probs, rng)
        p_scores.append(ps)
        h_scores.append(hs)
        margins.append(ps - hs)
        outcome_totals.update(outs)
        if ps > hs:
            pitcher_wins += 1
        elif hs > ps:
            hitter_wins += 1
        else:
            ties += 1
        hits = sum(1 for o in outs if o in HIT_OUTCOMES)
        if hits == 0:
            zero_hit_games += 1
            if hs > ps:
                zero_hit_hitter_wins += 1

    abs_margins = [abs(m) for m in margins]
    blowouts = sum(1 for m in abs_margins if m >= 8)
    close_games = sum(1 for m in abs_margins if m <= 2)

    return {
        "pitcher": pitcher_name,
        "hitter": hitter_name,
        "n": n,
        "probs": probs,
        "p_scores": p_scores,
        "h_scores": h_scores,
        "margins": margins,
        "pitcher_win_pct": pitcher_wins / n,
        "hitter_win_pct": hitter_wins / n,
        "tie_pct": ties / n,
        "avg_margin": mean(abs_margins),
        "median_pitcher_score": sorted(p_scores)[n // 2],
        "median_hitter_score": sorted(h_scores)[n // 2],
        "blowout_pct": blowouts / n,
        "close_pct": close_games / n,
        "zero_hit_game_pct": zero_hit_games / n,
        "zero_hit_hitter_win_pct": (zero_hit_hitter_wins / zero_hit_games) if zero_hit_games else 0.0,
        "outcome_freq": {k: v / (n * 6) for k, v in outcome_totals.items()},
    }


# --------------------------------------------------------------------------
# Reporting
# --------------------------------------------------------------------------
def ascii_hist(values: list[int], width: int = 40, label: str = "") -> str:
    if not values:
        return ""
    counts = Counter(values)
    lo, hi = min(counts), max(counts)
    max_count = max(counts.values())
    lines = [f"  {label}"] if label else []
    for v in range(lo, hi + 1):
        c = counts.get(v, 0)
        bar = "#" * int((c / max_count) * width)
        pct = c / len(values) * 100
        lines.append(f"   {v:>3} | {bar:<{width}} {pct:5.1f}%  (n={c})")
    return "\n".join(lines)


def print_report(r: dict) -> None:
    print()
    print("=" * 72)
    print(f"  {r['pitcher'].upper()} PITCHER  vs  {r['hitter'].upper()} HITTER     n={r['n']:,}")
    print("=" * 72)

    print("\n  Per-AB outcome probabilities (matchup, log5-combined):")
    for o in LEAGUE_AVG:
        p = r["probs"][o]
        print(f"     {o:<16} {p*100:5.2f}%")

    print("\n  Observed outcome frequency (sim):")
    for o in LEAGUE_AVG:
        f = r["outcome_freq"].get(o, 0.0)
        print(f"     {o:<16} {f*100:5.2f}%")

    print("\n  Win rates:")
    print(f"     Pitcher: {r['pitcher_win_pct']*100:5.1f}%")
    print(f"     Hitter:  {r['hitter_win_pct']*100:5.1f}%")
    print(f"     Tie:     {r['tie_pct']*100:5.1f}%")

    print("\n  Scoring:")
    print(f"     Median pitcher score: {r['median_pitcher_score']}")
    print(f"     Median hitter score:  {r['median_hitter_score']}")
    print(f"     Avg |margin|:         {r['avg_margin']:.2f}")
    print(f"     Close games (|m|<=2): {r['close_pct']*100:5.1f}%")
    print(f"     Blowouts   (|m|>=8):  {r['blowout_pct']*100:5.1f}%")

    print("\n  Zero-hit hitter performance:")
    print(f"     Games w/ 0 hits:      {r['zero_hit_game_pct']*100:5.1f}%")
    print(f"     Of those, hitter won: {r['zero_hit_hitter_win_pct']*100:5.1f}%")

    print("\n  Margin distribution (pitcher_score - hitter_score):")
    print(ascii_hist(r["margins"], width=40))
    print()


def print_summary_table(results: list[dict]) -> None:
    print()
    print("=" * 88)
    print("  SUMMARY — all matchups")
    print("=" * 88)
    header = f"  {'Pitcher':<10} {'Hitter':<10} {'P win%':>7} {'H win%':>7} {'Tie%':>6} {'|M|':>5} {'Close%':>7} {'Blow%':>7} {'0hit-W%':>8}"
    print(header)
    print("  " + "-" * 86)
    for r in results:
        print(f"  {r['pitcher']:<10} {r['hitter']:<10} "
              f"{r['pitcher_win_pct']*100:6.1f}% {r['hitter_win_pct']*100:6.1f}% "
              f"{r['tie_pct']*100:5.1f}% {r['avg_margin']:5.2f} "
              f"{r['close_pct']*100:6.1f}% {r['blowout_pct']*100:6.1f}% "
              f"{r['zero_hit_hitter_win_pct']*100:7.1f}%")
    print()

    print("  Flags:")
    for r in results:
        flags = []
        if r["pitcher_win_pct"] > 0.65:
            flags.append("PITCHER DOMINATES")
        if r["hitter_win_pct"] > 0.65:
            flags.append("HITTER DOMINATES")
        if r["blowout_pct"] > 0.20:
            flags.append("BLOWOUT-PRONE")
        if r["close_pct"] < 0.25:
            flags.append("FEW CLOSE GAMES")
        if r["tie_pct"] > 0.20:
            flags.append("TIES TOO COMMON")
        if flags:
            print(f"     {r['pitcher']:>8} vs {r['hitter']:<8}: {', '.join(flags)}")
    print()


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------
def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--pitcher", choices=list(PITCHERS), default=None)
    p.add_argument("--hitter", choices=list(HITTERS), default=None)
    p.add_argument("--n", type=int, default=10_000)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--summary-only", action="store_true")
    args = p.parse_args()

    # Sanity check distributions sum ~1
    for name, dist in {**PITCHERS, **HITTERS, "LEAGUE": LEAGUE_AVG}.items():
        s = sum(dist.values())
        if abs(s - 1.0) > 0.005:
            print(f"WARN: {name} probs sum to {s:.4f}")

    pairs = [(args.pitcher, args.hitter)] if (args.pitcher and args.hitter) else [
        (p_name, h_name) for p_name in PITCHERS for h_name in HITTERS
    ]

    results = []
    for p_name, h_name in pairs:
        r = run_monte_carlo(p_name, h_name, args.n, args.seed)
        results.append(r)
        if not args.summary_only:
            print_report(r)

    if len(results) > 1 or args.summary_only:
        print_summary_table(results)

    print("\n  Current SCORING table:")
    for o, (dp, dh) in SCORING.items():
        sign = f"P+{dp}" if dp else (f"H+{dh}" if dh else "neutral")
        print(f"     {o:<16} {sign}")
    print()


if __name__ == "__main__":
    main()
