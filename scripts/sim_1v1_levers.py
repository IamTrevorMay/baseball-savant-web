"""
Run 4 lever experiments sequentially vs v1 baseline.
Each lever changes ONE entry in SCORING; everything else identical to v1.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sim_1v1 as sim

N = 10_000
SEED = 42

LEVERS = {
    "v1 baseline":            {},
    "L1: soft_contact -> 0":  {"soft_contact":   (0, 0)},
    "L2: strikeout -> 2":     {"strikeout":      (2, 0)},
    "L3: walk -> 3":          {"walk":           (0, 3)},
    "L4: barrel -> 5":        {"barrel":         (0, 5)},
}

BASE_SCORING = dict(sim.SCORING)
PAIRS = [(p, h) for p in sim.PITCHERS for h in sim.HITTERS]

all_results: dict = {}

for lever_name, override in LEVERS.items():
    sim.SCORING = dict(BASE_SCORING)
    sim.SCORING.update(override)
    rows = []
    for p, h in PAIRS:
        rows.append(sim.run_monte_carlo(p, h, N, SEED))
    all_results[lever_name] = rows

# --- summary table per lever ---
print()
for lever_name, rows in all_results.items():
    print("=" * 92)
    print(f"  {lever_name}")
    print("=" * 92)
    print(f"  {'Pitcher':<10} {'Hitter':<10} {'P win%':>7} {'H win%':>7} {'Tie%':>6} "
          f"{'|M|':>5} {'Close%':>7} {'Blow%':>7} {'0hit-W%':>8}")
    print("  " + "-" * 90)
    for r in rows:
        print(f"  {r['pitcher']:<10} {r['hitter']:<10} "
              f"{r['pitcher_win_pct']*100:6.1f}% {r['hitter_win_pct']*100:6.1f}% "
              f"{r['tie_pct']*100:5.1f}% {r['avg_margin']:5.2f} "
              f"{r['close_pct']*100:6.1f}% {r['blowout_pct']*100:6.1f}% "
              f"{r['zero_hit_hitter_win_pct']*100:7.1f}%")
    print()

# --- delta vs baseline ---
print("=" * 92)
print("  DELTAS vs v1 baseline (pitcher win% shift; negative = more hitter-friendly)")
print("=" * 92)
base = {(r["pitcher"], r["hitter"]): r for r in all_results["v1 baseline"]}
print(f"  {'Lever':<28} " + " ".join(f"{p[:3]}-{h[:3]:<7}" for p, h in PAIRS))
for lever_name, rows in all_results.items():
    if lever_name == "v1 baseline":
        continue
    deltas = []
    for r in rows:
        b = base[(r["pitcher"], r["hitter"])]
        d = (r["pitcher_win_pct"] - b["pitcher_win_pct"]) * 100
        deltas.append(f"{d:+6.1f}%   ")
    print(f"  {lever_name:<28} " + " ".join(deltas))
print()

# --- composite balance score per lever ---
print("=" * 92)
print("  BALANCE SCORECARD (lower distance-from-50 = better)")
print("=" * 92)
print(f"  {'Lever':<28} {'avg |P-50|%':>12} {'max |P-50|%':>12} {'avg Blow%':>11} {'avg 0hit-W%':>12}")
for lever_name, rows in all_results.items():
    dev = [abs(r["pitcher_win_pct"] * 100 - 50) for r in rows]
    blow = [r["blowout_pct"] * 100 for r in rows]
    zhw = [r["zero_hit_hitter_win_pct"] * 100 for r in rows]
    print(f"  {lever_name:<28} {sum(dev)/len(dev):11.2f}  {max(dev):11.2f}  "
          f"{sum(blow)/len(blow):10.2f}  {sum(zhw)/len(zhw):11.2f}")
print()
