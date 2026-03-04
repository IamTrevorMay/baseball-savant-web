"""
Stuff+ Model Training Script
Trains XGBoost on delta_run_exp using physical pitch characteristics,
then fits per-pitch-type linear approximations for client-side use.

Usage: python scripts/stuff_model/train.py
Requires: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars
"""

import json
import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.linear_model import LinearRegression
from sklearn.model_selection import cross_val_score
from supabase import create_client

# ── Config ──────────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).parent

FEATURES = [
    "release_speed", "pfx_x", "pfx_z", "release_spin_rate", "spin_axis",
    "release_extension", "release_pos_x", "release_pos_z", "arm_angle",
    "vx0", "vy0", "vz0", "ax", "ay", "az",
]
CATEGORICAL = "pitch_type"
HAND_COL = "p_throws"
TARGET = "delta_run_exp"

TRAIN_YEARS = [2022, 2023, 2024]
ALL_YEARS = list(range(2015, 2026))
EXCLUDE_PITCH_TYPES = ("PO", "IN")
MIN_PITCHES_FOR_BASELINE = 50

# Pitch type name mapping (statcast code → display name)
PITCH_NAME_MAP = {
    "FF": "4-Seam Fastball", "SI": "Sinker", "FC": "Cutter",
    "SL": "Slider", "SW": "Sweeper", "CU": "Curveball",
    "CH": "Changeup", "FS": "Split-Finger", "KC": "Knuckle Curve",
    "SV": "Slurve", "ST": "Sweeper", "CS": "Curveball",
    "KN": "Knuckleball",
}

# ── Supabase connection ─────────────────────────────────────────────────────
def get_supabase():
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        # Try loading from .env.local
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


def fetch_data(sb, years, limit=None):
    """Fetch pitch data from Supabase via run_query RPC."""
    cols = ", ".join(FEATURES + [CATEGORICAL, HAND_COL, TARGET, "game_year", "pitcher", "pitch_name"])
    year_list = ", ".join(str(y) for y in years)
    pt_exclude = ", ".join(f"'{p}'" for p in EXCLUDE_PITCH_TYPES)
    limit_clause = f" LIMIT {limit}" if limit else ""

    sql = f"""
        SELECT {cols}
        FROM pitches
        WHERE game_year IN ({year_list})
          AND pitch_type NOT IN ({pt_exclude})
          AND {TARGET} IS NOT NULL
          AND release_speed IS NOT NULL
          AND pfx_x IS NOT NULL
          AND pfx_z IS NOT NULL
          AND release_spin_rate IS NOT NULL
          AND vx0 IS NOT NULL
        {limit_clause}
    """
    print(f"  Fetching data for years {years}...")
    result = sb.rpc("run_query", {"query_text": sql}).execute()
    df = pd.DataFrame(result.data)
    print(f"  Got {len(df)} rows")
    return df


def prepare_features(df):
    """Prepare feature matrix: encode p_throws and pitch_type."""
    df = df.copy()

    # Encode p_throws as 0/1
    df["p_throws_R"] = (df[HAND_COL] == "R").astype(int)

    # One-hot encode pitch_type
    pt_dummies = pd.get_dummies(df[CATEGORICAL], prefix="pt")
    df = pd.concat([df, pt_dummies], axis=1)

    feature_cols = FEATURES + ["p_throws_R"] + list(pt_dummies.columns)

    # Drop rows with any null features
    mask = df[feature_cols].notna().all(axis=1)
    df = df[mask]

    return df, feature_cols


def train_xgboost(df, feature_cols):
    """Train XGBoost regressor on delta_run_exp."""
    X = df[feature_cols].values.astype(np.float32)
    y = df[TARGET].values.astype(np.float32)

    print(f"\n  Training XGBoost on {len(X)} samples, {len(feature_cols)} features...")

    model = xgb.XGBRegressor(
        n_estimators=500,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        min_child_weight=50,
        reg_alpha=0.1,
        reg_lambda=1.0,
        random_state=42,
        n_jobs=-1,
    )

    # Cross-validation
    cv_scores = cross_val_score(model, X, y, cv=3, scoring="r2")
    print(f"  CV R²: {cv_scores.mean():.4f} (+/- {cv_scores.std():.4f})")

    # Full fit
    model.fit(X, y)
    train_r2 = model.score(X, y)
    print(f"  Train R²: {train_r2:.4f}")

    return model


def compute_baselines(df, stuff_rv_col="stuff_rv"):
    """Compute per pitch_name per year mean/stddev for plus normalization.
    Aggregates at pitcher level first (min 50 pitches), then computes league distribution."""
    baselines = {}

    for year in ALL_YEARS:
        year_df = df[df["game_year"] == year]
        if len(year_df) == 0:
            continue

        year_baselines = {}
        for pname, grp in year_df.groupby("pitch_name"):
            # Aggregate to pitcher level first
            pitcher_avgs = grp.groupby("pitcher")[stuff_rv_col].agg(["mean", "count"])
            pitcher_avgs = pitcher_avgs[pitcher_avgs["count"] >= MIN_PITCHES_FOR_BASELINE]
            if len(pitcher_avgs) < 10:
                continue

            league_mean = pitcher_avgs["mean"].mean()
            league_std = pitcher_avgs["mean"].std()
            if league_std < 1e-6:
                continue

            year_baselines[pname] = {
                "mean": round(float(league_mean), 4),
                "stddev": round(float(league_std), 4),
            }

        if year_baselines:
            baselines[year] = year_baselines

    return baselines


def fit_linear_models(df, feature_cols):
    """Fit linear regression per pitch_name that approximates XGBoost stuff_rv."""
    coefficients = {}
    # Use raw features only (no pitch_type dummies) for the linear model
    linear_features = FEATURES + ["p_throws_R"]

    print("\n  Fitting linear approximations per pitch type:")
    for pname, grp in df.groupby("pitch_name"):
        if len(grp) < 500:
            continue

        X = grp[linear_features].values.astype(np.float64)
        y = grp["stuff_rv"].values.astype(np.float64)

        lr = LinearRegression()
        lr.fit(X, y)
        r2 = lr.score(X, y)
        print(f"    {pname:20s}: R²={r2:.4f} (n={len(grp)})")

        coefficients[pname] = {
            "intercept": round(float(lr.intercept_), 6),
            "features": linear_features,
            "weights": [round(float(w), 6) for w in lr.coef_],
        }

    return coefficients


def main():
    print("=" * 60)
    print("Stuff+ Model Training")
    print("=" * 60)

    sb = get_supabase()

    # Step 1: Fetch training data
    print("\n[1/6] Fetching training data...")
    train_df = fetch_data(sb, TRAIN_YEARS)
    train_df, feature_cols = prepare_features(train_df)
    print(f"  {len(train_df)} rows after cleaning")

    # Step 2: Train XGBoost
    print("\n[2/6] Training XGBoost model...")
    model = train_xgboost(train_df, feature_cols)

    # Step 3: Score ALL pitches (fetch year by year to manage memory)
    print("\n[3/6] Scoring all pitches...")
    all_scored = []
    for year in ALL_YEARS:
        year_df = fetch_data(sb, [year])
        if len(year_df) == 0:
            continue
        year_df, _ = prepare_features(year_df)

        # Ensure all feature columns exist (pad missing pitch_type dummies with 0)
        for col in feature_cols:
            if col not in year_df.columns:
                year_df[col] = 0

        X = year_df[feature_cols].values.astype(np.float32)
        year_df["stuff_rv"] = model.predict(X)
        all_scored.append(year_df)

    scored_df = pd.concat(all_scored, ignore_index=True)
    print(f"  Scored {len(scored_df)} total pitches")

    # Step 4: Compute league baselines
    print("\n[4/6] Computing league baselines...")
    baselines = compute_baselines(scored_df)
    baselines_path = SCRIPT_DIR / "stuff_league_baselines.json"
    with open(baselines_path, "w") as f:
        json.dump(baselines, f, indent=2)
    print(f"  Saved to {baselines_path}")

    # Print summary
    for year in sorted(baselines.keys()):
        types = list(baselines[year].keys())
        print(f"    {year}: {len(types)} pitch types")

    # Step 5: Fit linear approximations
    print("\n[5/6] Fitting linear models...")
    coefficients = fit_linear_models(scored_df, feature_cols)
    coeffs_path = SCRIPT_DIR / "stuff_linear_coefficients.json"
    with open(coeffs_path, "w") as f:
        json.dump(coefficients, f, indent=2)
    print(f"  Saved to {coeffs_path}")

    # Step 6: Save XGBoost model
    print("\n[6/6] Saving XGBoost model...")
    model_path = SCRIPT_DIR / "model.json"
    model.save_model(str(model_path))
    print(f"  Saved to {model_path}")

    # Final summary
    print("\n" + "=" * 60)
    print("Training complete!")
    print(f"  Baselines: {baselines_path}")
    print(f"  Linear coefficients: {coeffs_path}")
    print(f"  XGBoost model: {model_path}")
    print("=" * 60)


if __name__ == "__main__":
    main()
