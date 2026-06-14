"""
Round 2: build on L2 (strikeout=2) as new baseline. Test barrel/2B/3B boosts.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sim_1v1 as sim

N = 10_000
SEED = 42

L2_BASE = dict(sim.SCORING)
L2_BASE["strikeout"] = (2, 0)   # carry L2 forward

VARIANTS = {
    "v2 base (L2 only)":          {},
    "v2 + barrel=6":              {"barrel": (0, 6)},
    "v2 + 2B=4, 3B=5":            {"double": (0, 4), "triple": (0, 5)},
    "v2 + barrel=6 + 2B=4, 3B=5": {"barrel": (0, 6), "double": (0, 4), "triple": (0, 5)},
}

PAIRS = [(p, h) for p in sim.PITCHERS for h in sim.HITTERS]
all_results: dict = {}

for name, override in VARIANTS.items():
    sim.SCORING = dict(L2_BASE)
    sim.SCORING.update(override)
    rows = []
    for p, h in PAIRS:
        rows.append(sim.run_monte_carlo(p, h, N, SEED))
    all_results[name] = rows

print()
for name, rows in all_results.items():
    print("=" * 92)
    print(f"  {name}")
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

print("=" * 92)
print("  DELTAS vs v2 base (pitcher win% shift)")
print("=" * 92)
base = {(r["pitcher"], r["hitter"]): r for r in all_results["v2 base (L2 only)"]}
print(f"  {'Variant':<32} " + " ".join(f"{p[:3]}-{h[:3]:<7}" for p, h in PAIRS))
for name, rows in all_results.items():
    if name == "v2 base (L2 only)":
        continue
    deltas = []
    for r in rows:
        b = base[(r["pitcher"], r["hitter"])]
        d = (r["pitcher_win_pct"] - b["pitcher_win_pct"]) * 100
        deltas.append(f"{d:+6.1f}%   ")
    print(f"  {name:<32} " + " ".join(deltas))
print()

print("=" * 92)
print("  BALANCE SCORECARD (lower |P-50| = better)")
print("=" * 92)
print(f"  {'Variant':<32} {'avg |P-50|%':>12} {'max |P-50|%':>12} {'avg Blow%':>11} {'avg 0hit-W%':>12}")
for name, rows in all_results.items():
    dev = [abs(r["pitcher_win_pct"] * 100 - 50) for r in rows]
    blow = [r["blowout_pct"] * 100 for r in rows]
    zhw = [r["zero_hit_hitter_win_pct"] * 100 for r in rows]
    print(f"  {name:<32} {sum(dev)/len(dev):11.2f}  {max(dev):11.2f}  "
          f"{sum(blow)/len(blow):10.2f}  {sum(zhw)/len(zhw):11.2f}")
print()
