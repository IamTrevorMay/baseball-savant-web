"""
Stuff+ Backfill Script
Scores all pitches with the trained XGBoost model and writes stuff_plus to the DB.

Usage: python scripts/stuff_model/backfill.py
Requires: trained model.json and stuff_league_baselines.json from train.py
"""

import json
import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost as xgb
from supabase import create_client

# ── Config ──────────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).parent

FEATURES = [
    "release_speed", "pfx_x", "pfx_z", "release_spin_rate", "spin_axis",
    "release_extension", "release_pos_x", "release_pos_z", "arm_angle",
    "vx0", "vy0", "vz0", "ax", "ay", "az",
]
EXCLUDE_PITCH_TYPES = ("PO", "IN")
ALL_YEARS = list(range(2015, 2026))
BATCH_SIZE = 1000

# ── Supabase connection ─────────────────────────────────────────────────────
def get_supabase():
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        env_path = SCRIPT_DIR.parent.parent / ".env.local"
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ[k.strip()] = v.strip()
            url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
            key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("ERROR: Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")
        sys.exit(1)
    return create_client(url, key)


def load_model():
    model_path = SCRIPT_DIR / "model.json"
    if not model_path.exists():
        print(f"ERROR: Model not found at {model_path}. Run train.py first.")
        sys.exit(1)
    model = xgb.XGBRegressor()
    model.load_model(str(model_path))
    return model


def load_baselines():
    baselines_path = SCRIPT_DIR / "stuff_league_baselines.json"
    if not baselines_path.exists():
        print(f"ERROR: Baselines not found at {baselines_path}. Run train.py first.")
        sys.exit(1)
    with open(baselines_path) as f:
        raw = json.load(f)
    # Convert string year keys to int
    return {int(k): v for k, v in raw.items()}


def get_feature_cols_from_model(model):
    """Extract feature column names from trained model."""
    booster = model.get_booster()
    return booster.feature_names


def compute_stuff_plus(stuff_rv, pitch_name, year, baselines):
    """Convert raw stuff_rv to plus scale using league baselines."""
    year_bl = baselines.get(year, {})
    bl = year_bl.get(pitch_name)
    if bl is None:
        # Try nearest year
        for delta in range(1, 6):
            for y in [year - delta, year + delta]:
                if y in baselines and pitch_name in baselines[y]:
                    bl = baselines[y][pitch_name]
                    break
            if bl:
                break
    if bl is None:
        return None

    # Invert: lower run value = better stuff = higher plus
    plus = 100 + (bl["mean"] - stuff_rv) / bl["stddev"] * 10
    return round(float(plus), 1)


def main():
    print("=" * 60)
    print("Stuff+ Backfill")
    print("=" * 60)

    sb = get_supabase()
    model = load_model()
    baselines = load_baselines()
    feature_cols = get_feature_cols_from_model(model)

    print(f"  Model features: {len(feature_cols)}")
    print(f"  Baseline years: {sorted(baselines.keys())}")

    for year in ALL_YEARS:
        print(f"\n--- Year {year} ---")

        # Fetch pitches for this year
        cols = ", ".join(FEATURES + [
            "pitch_type", "p_throws", "game_year", "pitcher", "pitch_name",
            "game_pk", "at_bat_number", "pitch_number",
        ])
        pt_exclude = ", ".join(f"'{p}'" for p in EXCLUDE_PITCH_TYPES)
        sql = f"""
            SELECT {cols}
            FROM pitches
            WHERE game_year = {year}
              AND pitch_type NOT IN ({pt_exclude})
              AND release_speed IS NOT NULL
              AND pfx_x IS NOT NULL
        """
        result = sb.rpc("run_query", {"query_text": sql}).execute()
        df = pd.DataFrame(result.data)
        if len(df) == 0:
            print(f"  No data for {year}")
            continue
        print(f"  Fetched {len(df)} pitches")

        # Prepare features
        df["p_throws_R"] = (df["p_throws"] == "R").astype(int)
        pt_dummies = pd.get_dummies(df["pitch_type"], prefix="pt")
        df = pd.concat([df, pt_dummies], axis=1)

        # Ensure all feature columns exist
        for col in feature_cols:
            if col not in df.columns:
                df[col] = 0

        # Filter to rows with all required features
        required = FEATURES + ["p_throws_R"]
        mask = df[required].notna().all(axis=1)
        valid_df = df[mask].copy()
        skipped = len(df) - len(valid_df)
        if skipped > 0:
            print(f"  Skipped {skipped} rows with null features")

        if len(valid_df) == 0:
            continue

        # Predict
        X = valid_df[feature_cols].values.astype(np.float32)
        valid_df["stuff_rv"] = model.predict(X)

        # Compute stuff_plus
        valid_df["stuff_plus"] = valid_df.apply(
            lambda r: compute_stuff_plus(r["stuff_rv"], r["pitch_name"], year, baselines),
            axis=1,
        )

        # Update pitches table in batches
        updates = valid_df[["game_pk", "at_bat_number", "pitch_number", "stuff_plus"]].dropna(subset=["stuff_plus"])
        print(f"  Updating {len(updates)} pitches...")

        for i in range(0, len(updates), BATCH_SIZE):
            batch = updates.iloc[i:i + BATCH_SIZE]
            # Build CASE statement for batch update
            cases = []
            game_pks = set()
            for _, row in batch.iterrows():
                gp = int(row["game_pk"])
                ab = int(row["at_bat_number"])
                pn = int(row["pitch_number"])
                sp = row["stuff_plus"]
                game_pks.add(gp)
                cases.append(
                    f"WHEN game_pk = {gp} AND at_bat_number = {ab} AND pitch_number = {pn} THEN {sp}"
                )

            gp_list = ", ".join(str(g) for g in game_pks)
            case_sql = " ".join(cases)
            update_sql = f"""
                UPDATE pitches
                SET stuff_plus = CASE {case_sql} ELSE stuff_plus END
                WHERE game_pk IN ({gp_list}) AND game_year = {year}
            """
            try:
                sb.rpc("run_query", {"query_text": update_sql}).execute()
            except Exception as e:
                print(f"    Batch error at {i}: {e}")
                continue

            if (i // BATCH_SIZE) % 50 == 0:
                print(f"    {i + len(batch)}/{len(updates)} updated")

        print(f"  Done: {len(updates)} pitches updated for {year}")

        # Aggregate to pitcher_season_command
        print(f"  Aggregating pitcher-season-pitch_type stats...")
        agg = valid_df.groupby(["pitcher", "pitch_name"]).agg(
            avg_stuff_rv=("stuff_rv", "mean"),
            count=("stuff_rv", "count"),
        ).reset_index()
        agg = agg[agg["count"] >= 10]

        # Compute stuff_plus at aggregated level
        agg["stuff_plus"] = agg.apply(
            lambda r: compute_stuff_plus(r["avg_stuff_rv"], r["pitch_name"], year, baselines),
            axis=1,
        )

        for _, row in agg.iterrows():
            upsert_sql = f"""
                UPDATE pitcher_season_command
                SET avg_stuff_rv = {row['avg_stuff_rv']:.4f},
                    stuff_plus = {row['stuff_plus'] if pd.notna(row['stuff_plus']) else 'NULL'}
                WHERE pitcher = {int(row['pitcher'])}
                  AND game_year = {year}
                  AND pitch_name = '{row['pitch_name'].replace("'", "''")}'
            """
            try:
                sb.rpc("run_query", {"query_text": upsert_sql}).execute()
            except Exception:
                pass

        print(f"  Aggregated {len(agg)} pitcher-pitch_type combos")

    print("\n" + "=" * 60)
    print("Backfill complete!")
    print("=" * 60)


if __name__ == "__main__":
    main()
