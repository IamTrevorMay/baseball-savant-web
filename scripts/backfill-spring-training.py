#!/usr/bin/env python3 -u
"""
Backfill Spring Training Statcast data (2015–2025) into the pitches table.
Usage: python3 -u scripts/backfill-spring-training.py [start_year]
"""
import os, sys, time, csv, io, json
import requests as req_lib
from datetime import date, timedelta
from dotenv import load_dotenv

# Force unbuffered output
sys.stdout.reconfigure(line_buffering=True)

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))

SUPABASE_URL = os.environ['NEXT_PUBLIC_SUPABASE_URL']
SERVICE_KEY  = os.environ['SUPABASE_SERVICE_ROLE_KEY']

ST_WINDOWS = {y: (f'{y}-02-20', f'{y}-03-30') for y in range(2015, 2026)}

SKIP_COLS = {'unnamed', 'pitcher.1', 'fielder_2.1', 'index'}
TEXT_COLS = {
    'pitch_type', 'game_date', 'player_name', 'events', 'description',
    'des', 'game_type', 'stand', 'p_throws', 'home_team', 'away_team',
    'type', 'bb_type', 'inning_topbot', 'umpire', 'sv_id', 'pitch_name',
    'if_fielding_alignment', 'of_fielding_alignment', 'spin_dir',
}

session = req_lib.Session()
session.headers.update({'User-Agent': 'Mozilla/5.0'})

SAVANT_URL = 'https://baseballsavant.mlb.com/statcast_search/csv'
SB_URL = f"{SUPABASE_URL}/rest/v1/pitches"
SB_HEADERS = {
    'apikey': SERVICE_KEY,
    'Authorization': f'Bearer {SERVICE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'resolution=ignore-duplicates',
}


def fetch_savant(start, end):
    resp = session.get(SAVANT_URL, params={
        'all': 'true', 'type': 'details',
        'game_date_gt': start, 'game_date_lt': end, 'hfGT': 'S|',
        'player_type': 'pitcher', 'group_by': 'name',
        'min_pitches': '0', 'min_results': '0', 'min_pas': '0',
        'sort_col': 'pitches', 'sort_order': 'desc',
    }, timeout=90)
    resp.raise_for_status()
    return resp.content.decode('utf-8-sig')


def parse(raw):
    seen = set()
    rows = []
    for r in csv.DictReader(io.StringIO(raw)):
        if not r.get('game_pk'):
            continue
        c = {}
        for k, v in r.items():
            kl = k.strip().lower()
            if kl in SKIP_COLS or kl.startswith('unnamed') or kl == '':
                continue
            if v is None or v.strip() in ('', 'null'):
                c[kl] = None
            elif kl in TEXT_COLS or kl == 'game_pk':
                c[kl] = v.strip()
            else:
                try:
                    c[kl] = float(v.strip()) if '.' in v else int(v.strip())
                except ValueError:
                    c[kl] = v.strip()
        try:
            c['game_pk'] = int(c['game_pk'])
        except (ValueError, KeyError):
            continue
        c.pop('id', None)
        key = (c.get('game_pk'), c.get('at_bat_number'), c.get('pitch_number'))
        if key in seen:
            continue
        seen.add(key)
        rows.append(c)
    return rows


def upsert(rows):
    for attempt in range(3):
        try:
            r = session.post(SB_URL, json=rows, headers=SB_HEADERS, timeout=120)
            if r.status_code in (200, 201, 409):
                return len(rows), 0
            print(f"  [HTTP {r.status_code}] {r.text[:150]}")
            if attempt < 2:
                time.sleep(3 * (attempt + 1))
        except Exception as e:
            print(f"  [ERR attempt {attempt+1}] {e}")
            if attempt < 2:
                time.sleep(5 * (attempt + 1))
    return 0, len(rows)


def main():
    start_year = int(sys.argv[1]) if len(sys.argv) > 1 else 2015
    grand_ok = 0
    grand_err = 0

    for year in range(start_year, 2026):
        s, e = ST_WINDOWS[year]
        print(f"\n=== {year} ST ({s} → {e}) ===")
        cur = date.fromisoformat(s)
        end = date.fromisoformat(e)
        yr_ok = 0
        yr_err = 0

        while cur <= end:
            ce = min(cur + timedelta(days=4), end)
            cs, ces = cur.isoformat(), ce.isoformat()
            sys.stdout.write(f"  {cs}→{ces}: ")
            sys.stdout.flush()

            try:
                raw = fetch_savant(cs, ces)
            except Exception as ex:
                print(f"FETCH ERR: {ex}")
                cur = ce + timedelta(days=1)
                time.sleep(5)
                continue

            if len(raw) < 100:
                print("0")
                cur = ce + timedelta(days=1)
                time.sleep(1)
                continue

            rows = parse(raw)
            sys.stdout.write(f"{len(rows)}p ")
            sys.stdout.flush()

            ok = 0
            err = 0
            for i in range(0, len(rows), 100):
                b_ok, b_err = upsert(rows[i:i+100])
                ok += b_ok
                err += b_err

            print(f"→ {ok}ok {err}err")
            yr_ok += ok
            yr_err += err
            cur = ce + timedelta(days=1)
            time.sleep(3)

        print(f"  {year} done: {yr_ok} ok, {yr_err} err")
        grand_ok += yr_ok
        grand_err += yr_err

    print(f"\n=== DONE: {grand_ok} ok, {grand_err} err ===")


if __name__ == '__main__':
    main()
