#!/usr/bin/env python3
"""Multi-threshold no-hitter analysis. Reports answer at 7th, 8th, 9th inning cutoffs."""
import csv, glob, os
from collections import defaultdict

PARSED_DIR = "data/retrosheet/parsed"

# starter_id -> [n_lost_7th_plus, n_lost_8th_plus, n_lost_9th_plus]
lost = defaultdict(lambda: [0,0,0])
threw = set()

files = sorted(glob.glob(f"{PARSED_DIR}/cwevent_*.csv"))
for path in files:
    cur_game = None
    sides = {0: None, 1: None}
    def flush(sides):
        for side in (0,1):
            s = sides[side]
            if not s: continue
            starter = s['starter']; fhi = s['fhi']; li = s['li']
            if starter is None or li is None: continue
            if li >= 9 and fhi is None:
                threw.add(starter)
            if fhi is not None:
                if li >= 7 and fhi >= 7: lost[starter][0] += 1
                if li >= 8 and fhi >= 8: lost[starter][1] += 1
                if li >= 9 and fhi >= 9: lost[starter][2] += 1
    with open(path) as f:
        r = csv.DictReader(f)
        for row in r:
            g = row['GAME_ID']; p = row['PIT_ID']
            try:
                inn = int(row['INN_CT']); hcd = int(row['H_CD']); bh = int(row['BAT_HOME_ID'])
            except: continue
            if g != cur_game:
                flush(sides); cur_game = g; sides = {0: None, 1: None}
            if sides[bh] is None: sides[bh] = {'starter': p, 'fhi': None, 'li': None}
            s = sides[bh]
            if p != s['starter']: continue
            if s['li'] is None or inn > s['li']: s['li'] = inn
            if hcd > 0 and s['fhi'] is None: s['fhi'] = inn
        flush(sides)

for label, idx in [("LOST IN 7TH+", 0), ("LOST IN 8TH+", 1), ("LOST IN 9TH+", 2)]:
    multi = {p: v[idx] for p, v in lost.items() if v[idx] >= 2}
    overlap = {p for p in multi if p in threw}
    print(f"\n=== {label} ===")
    print(f"  Pitchers w/ 2+ such losses: {len(multi)}")
    print(f"  Of those, also threw CG no-hitter: {len(overlap)}")
    if idx >= 1:  # 8th+ and 9th+: print full list
        for p, n in sorted(multi.items(), key=lambda x: (-x[1], x[0])):
            flag = "YES" if p in threw else "no"
            print(f"    {p:<12} {n:<4} no-no={flag}")

# Specifically: where does Yamamoto land?
print(f"\nyamay001 lost counts [7th+, 8th+, 9th+]: {lost.get('yamay001', [0,0,0])}")
print(f"yamay001 threw no-no: {'yamay001' in threw}")
