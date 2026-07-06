#!/usr/bin/env python3
"""
Answer: how many pitchers in MLB history (Retrosheet PBP 1914+) took a no-hitter
into the 9th inning as the starter and lost it (gave up first hit in 9th or later) — 2+ times?
Of those, how many also threw a complete no-hitter?

Streams cwevent_YYYY.csv files in data/retrosheet/parsed/.
"""

import csv
import glob
import os
import sys
from collections import defaultdict

PARSED_DIR = "data/retrosheet/parsed"

# Per (game_id, pitcher_id) → first hit inning, last inning, hits allowed.
# We only track the starter per game (= PIT_ID on first row of the game).

# Aggregate at pitcher level after processing each season.
lost_2plus = defaultdict(int)   # pitcher_id → count of "lost no-no" games
threw_no_no = set()             # pitcher_id who threw at least one CG no-hitter

files = sorted(glob.glob(f"{PARSED_DIR}/cwevent_*.csv"))
print(f"Processing {len(files)} season CSVs...")

for path in files:
    season = os.path.basename(path).replace("cwevent_", "").replace(".csv", "")
    games_processed = 0

    # Per-game in-flight tracking, BOTH starters (home + away).
    # BAT_HOME_ID = 0 → top of inning, away batting, HOME pitcher in PIT_ID
    # BAT_HOME_ID = 1 → bottom of inning, home batting, AWAY pitcher in PIT_ID
    cur_game_id = None
    # Each side: {starter_pit_id, first_hit_inning, last_inning}
    sides = {0: None, 1: None}  # 0 = home pitcher, 1 = away pitcher (keyed by bat_home_id)

    def flush(sides):
        for side in (0, 1):
            s = sides[side]
            if not s: continue
            starter = s['starter']
            fhi = s['fhi']
            li = s['li']
            if starter is None or li is None: continue
            if li >= 9 and fhi is not None and fhi >= 9:
                lost_2plus[starter] += 1
            if li >= 9 and fhi is None:
                threw_no_no.add(starter)

    with open(path, newline='') as f:
        reader = csv.DictReader(f)
        for row in reader:
            game_id = row['GAME_ID']
            pit_id  = row['PIT_ID']
            try:
                inn = int(row['INN_CT'])
                h_cd = int(row['H_CD'])
                bat_home = int(row['BAT_HOME_ID'])
            except (ValueError, KeyError):
                continue

            if game_id != cur_game_id:
                flush(sides)
                cur_game_id = game_id
                sides = {0: None, 1: None}
                games_processed += 1

            # First time we see this side, lock in starter
            if sides[bat_home] is None:
                sides[bat_home] = {'starter': pit_id, 'fhi': None, 'li': None}

            s = sides[bat_home]
            if pit_id != s['starter']:
                continue  # starter pulled, ignore subsequent pitchers
            if s['li'] is None or inn > s['li']:
                s['li'] = inn
            if h_cd > 0 and s['fhi'] is None:
                s['fhi'] = inn

    flush(sides)
    print(f"  {season}: {games_processed} games processed", flush=True)

# Final analysis
multi_losers = {p: n for p, n in lost_2plus.items() if n >= 2}
multi_losers_who_threw_no_no = {p for p in multi_losers if p in threw_no_no}

print()
print("="*70)
print(f"Pitchers (as starter) who LOST a no-hitter (took it into 9th, gave up first hit in 9th+): {len(lost_2plus)}")
print(f"Pitchers who LOST a no-hitter 2+ times: {len(multi_losers)}")
print(f"Of those, who also THREW a complete no-hitter: {len(multi_losers_who_threw_no_no)}")
print(f"Total pitchers who threw a complete no-hitter (starter, 9+ IP, 0 H): {len(threw_no_no)}")
print()

# Detail table for the multi-losers
print("Multi-losers (n_lost = times took no-no into 9th and lost):")
print(f"{'retro_id':<12} {'n_lost':<8} {'threw_no_no'}")
for p, n in sorted(multi_losers.items(), key=lambda x: (-x[1], x[0])):
    flag = "YES" if p in threw_no_no else "no"
    print(f"{p:<12} {n:<8} {flag}")
