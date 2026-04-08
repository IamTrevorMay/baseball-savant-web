// League-level pitcher distributions by year (2015-2025, min 50 pitches per pitcher per pitch type)
// Mean and stddev of pitcher-level averages, used for plus-stat normalization
// Year-partitioned centroids for Cluster/HDev/VDev

type LeagueEntry = { mean: number; stddev: number }
type YearLeague = Record<number, Record<string, LeagueEntry>>
type MetricName = 'brink' | 'cluster' | 'cluster_r' | 'cluster_l' | 'hdev' | 'vdev' | 'missfire' | 'stuff' | 'close_pct'

// ── BRINK ────────────────────────────────────────────────────────────────────
export const BRINK_LEAGUE_BY_YEAR: YearLeague = {
  2015: {
    '4-Seam Fastball': { mean: -0.90, stddev: 0.71 }, 'Slider': { mean: -2.81, stddev: 1.42 },
    'Sinker': { mean: -1.47, stddev: 1.07 }, 'Changeup': { mean: -3.45, stddev: 1.50 },
    'Curveball': { mean: -3.51, stddev: 1.61 }, 'Cutter': { mean: -1.50, stddev: 1.02 },
    'Split-Finger': { mean: -3.93, stddev: 1.25 }, 'Knuckle Curve': { mean: -3.65, stddev: 1.85 },
  },
  2016: {
    '4-Seam Fastball': { mean: -0.90, stddev: 0.75 }, 'Slider': { mean: -2.69, stddev: 1.39 },
    'Sinker': { mean: -1.42, stddev: 1.09 }, 'Changeup': { mean: -3.46, stddev: 1.59 },
    'Curveball': { mean: -3.54, stddev: 1.64 }, 'Cutter': { mean: -1.63, stddev: 1.10 },
    'Split-Finger': { mean: -4.15, stddev: 1.13 }, 'Knuckle Curve': { mean: -3.35, stddev: 1.61 },
  },
  2017: {
    '4-Seam Fastball': { mean: -0.99, stddev: 0.82 }, 'Slider': { mean: -2.70, stddev: 1.38 },
    'Sinker': { mean: -1.22, stddev: 0.93 }, 'Changeup': { mean: -3.03, stddev: 1.37 },
    'Curveball': { mean: -3.19, stddev: 1.64 }, 'Cutter': { mean: -2.03, stddev: 1.16 },
    'Sweeper': { mean: -3.25, stddev: 1.42 }, 'Split-Finger': { mean: -3.86, stddev: 1.54 },
    'Knuckle Curve': { mean: -3.32, stddev: 1.43 },
  },
  2018: {
    '4-Seam Fastball': { mean: -1.00, stddev: 0.78 }, 'Slider': { mean: -2.88, stddev: 1.40 },
    'Sinker': { mean: -1.27, stddev: 1.00 }, 'Changeup': { mean: -3.26, stddev: 1.40 },
    'Curveball': { mean: -3.22, stddev: 1.52 }, 'Cutter': { mean: -1.94, stddev: 1.23 },
    'Sweeper': { mean: -2.90, stddev: 1.64 }, 'Split-Finger': { mean: -4.42, stddev: 1.66 },
    'Knuckle Curve': { mean: -3.29, stddev: 1.55 },
  },
  2019: {
    '4-Seam Fastball': { mean: -1.14, stddev: 0.82 }, 'Slider': { mean: -3.11, stddev: 1.42 },
    'Sinker': { mean: -1.36, stddev: 0.94 }, 'Changeup': { mean: -3.50, stddev: 1.45 },
    'Curveball': { mean: -3.66, stddev: 1.72 }, 'Cutter': { mean: -2.01, stddev: 1.31 },
    'Sweeper': { mean: -3.39, stddev: 1.40 }, 'Split-Finger': { mean: -4.34, stddev: 1.56 },
    'Knuckle Curve': { mean: -3.91, stddev: 1.66 },
  },
  2020: {
    '4-Seam Fastball': { mean: -1.05, stddev: 0.92 }, 'Slider': { mean: -3.22, stddev: 1.63 },
    'Sinker': { mean: -1.12, stddev: 0.99 }, 'Changeup': { mean: -3.20, stddev: 1.45 },
    'Curveball': { mean: -3.94, stddev: 1.79 }, 'Cutter': { mean: -1.86, stddev: 1.44 },
    'Sweeper': { mean: -3.05, stddev: 1.33 }, 'Split-Finger': { mean: -3.81, stddev: 1.70 },
    'Knuckle Curve': { mean: -3.81, stddev: 1.83 },
  },
  2021: {
    '4-Seam Fastball': { mean: -1.01, stddev: 0.81 }, 'Slider': { mean: -2.98, stddev: 1.39 },
    'Sinker': { mean: -0.97, stddev: 1.02 }, 'Changeup': { mean: -3.38, stddev: 1.40 },
    'Curveball': { mean: -3.84, stddev: 1.83 }, 'Cutter': { mean: -1.56, stddev: 1.21 },
    'Sweeper': { mean: -2.87, stddev: 1.46 }, 'Split-Finger': { mean: -4.47, stddev: 1.37 },
    'Knuckle Curve': { mean: -4.17, stddev: 1.53 },
  },
  2022: {
    '4-Seam Fastball': { mean: -1.06, stddev: 0.86 }, 'Slider': { mean: -2.96, stddev: 1.31 },
    'Sinker': { mean: -0.80, stddev: 0.95 }, 'Changeup': { mean: -3.53, stddev: 1.54 },
    'Curveball': { mean: -3.42, stddev: 1.74 }, 'Cutter': { mean: -1.49, stddev: 1.14 },
    'Sweeper': { mean: -2.91, stddev: 1.30 }, 'Split-Finger': { mean: -4.26, stddev: 1.42 },
    'Knuckle Curve': { mean: -3.61, stddev: 1.33 },
  },
  2023: {
    '4-Seam Fastball': { mean: -1.02, stddev: 0.93 }, 'Slider': { mean: -2.80, stddev: 1.35 },
    'Sinker': { mean: -0.67, stddev: 0.96 }, 'Changeup': { mean: -3.55, stddev: 1.58 },
    'Curveball': { mean: -3.46, stddev: 1.68 }, 'Cutter': { mean: -1.28, stddev: 1.09 },
    'Sweeper': { mean: -3.01, stddev: 1.38 }, 'Split-Finger': { mean: -4.22, stddev: 1.55 },
    'Knuckle Curve': { mean: -3.76, stddev: 1.61 }, 'Slurve': { mean: -2.89, stddev: 1.29 },
  },
  2024: {
    '4-Seam Fastball': { mean: -0.90, stddev: 0.90 }, 'Slider': { mean: -2.67, stddev: 1.30 },
    'Sinker': { mean: -0.49, stddev: 0.97 }, 'Changeup': { mean: -3.51, stddev: 1.46 },
    'Curveball': { mean: -3.43, stddev: 1.67 }, 'Cutter': { mean: -1.26, stddev: 1.07 },
    'Sweeper': { mean: -2.89, stddev: 1.40 }, 'Split-Finger': { mean: -4.01, stddev: 1.47 },
    'Knuckle Curve': { mean: -4.17, stddev: 1.59 }, 'Slurve': { mean: -3.27, stddev: 1.31 },
  },
  2025: {
    '4-Seam Fastball': { mean: -0.71, stddev: 0.95 }, 'Slider': { mean: -2.38, stddev: 1.35 },
    'Sinker': { mean: -0.28, stddev: 0.97 }, 'Changeup': { mean: -3.45, stddev: 1.49 },
    'Curveball': { mean: -3.41, stddev: 1.75 }, 'Cutter': { mean: -0.96, stddev: 1.12 },
    'Sweeper': { mean: -2.77, stddev: 1.47 }, 'Split-Finger': { mean: -3.96, stddev: 1.53 },
    'Knuckle Curve': { mean: -3.72, stddev: 1.53 }, 'Slurve': { mean: -3.02, stddev: 0.86 },
  },
}

// ── CLUSTER ──────────────────────────────────────────────────────────────────
export const CLUSTER_LEAGUE_BY_YEAR: YearLeague = {
  2015: {
    '4-Seam Fastball': { mean: 12.26, stddev: 0.79 }, 'Slider': { mean: 12.45, stddev: 1.19 },
    'Sinker': { mean: 11.86, stddev: 0.92 }, 'Changeup': { mean: 12.24, stddev: 1.28 },
    'Curveball': { mean: 13.84, stddev: 1.58 }, 'Cutter': { mean: 11.94, stddev: 0.90 },
    'Split-Finger': { mean: 12.46, stddev: 1.85 }, 'Knuckle Curve': { mean: 13.52, stddev: 1.40 },
  },
  2016: {
    '4-Seam Fastball': { mean: 12.28, stddev: 0.82 }, 'Slider': { mean: 12.38, stddev: 1.19 },
    'Sinker': { mean: 11.85, stddev: 0.88 }, 'Changeup': { mean: 12.24, stddev: 1.34 },
    'Curveball': { mean: 13.79, stddev: 1.32 }, 'Cutter': { mean: 11.98, stddev: 0.86 },
    'Split-Finger': { mean: 12.98, stddev: 1.61 }, 'Knuckle Curve': { mean: 13.34, stddev: 1.19 },
  },
  2017: {
    '4-Seam Fastball': { mean: 12.17, stddev: 0.82 }, 'Slider': { mean: 12.39, stddev: 1.25 },
    'Sinker': { mean: 11.73, stddev: 0.88 }, 'Changeup': { mean: 11.94, stddev: 1.17 },
    'Curveball': { mean: 13.56, stddev: 1.42 }, 'Cutter': { mean: 11.94, stddev: 1.02 },
    'Sweeper': { mean: 13.16, stddev: 1.09 }, 'Split-Finger': { mean: 12.61, stddev: 1.48 },
    'Knuckle Curve': { mean: 13.47, stddev: 1.40 },
  },
  2018: {
    '4-Seam Fastball': { mean: 12.14, stddev: 0.78 }, 'Slider': { mean: 12.54, stddev: 1.32 },
    'Sinker': { mean: 11.48, stddev: 0.95 }, 'Changeup': { mean: 11.92, stddev: 1.28 },
    'Curveball': { mean: 13.73, stddev: 1.59 }, 'Cutter': { mean: 11.93, stddev: 1.09 },
    'Sweeper': { mean: 13.05, stddev: 0.73 }, 'Split-Finger': { mean: 12.92, stddev: 1.80 },
    'Knuckle Curve': { mean: 13.55, stddev: 1.44 },
  },
  2019: {
    '4-Seam Fastball': { mean: 12.09, stddev: 0.84 }, 'Slider': { mean: 12.35, stddev: 1.21 },
    'Sinker': { mean: 11.42, stddev: 0.92 }, 'Changeup': { mean: 11.97, stddev: 1.38 },
    'Curveball': { mean: 13.68, stddev: 1.60 }, 'Cutter': { mean: 11.69, stddev: 0.99 },
    'Sweeper': { mean: 12.84, stddev: 1.08 }, 'Split-Finger': { mean: 12.61, stddev: 1.46 },
    'Knuckle Curve': { mean: 13.56, stddev: 1.66 },
  },
  2020: {
    '4-Seam Fastball': { mean: 11.89, stddev: 0.88 }, 'Slider': { mean: 12.31, stddev: 1.30 },
    'Sinker': { mean: 11.31, stddev: 0.99 }, 'Changeup': { mean: 11.59, stddev: 1.36 },
    'Curveball': { mean: 13.56, stddev: 1.69 }, 'Cutter': { mean: 11.61, stddev: 0.99 },
    'Sweeper': { mean: 12.82, stddev: 1.44 }, 'Split-Finger': { mean: 12.36, stddev: 1.46 },
    'Knuckle Curve': { mean: 13.32, stddev: 1.62 },
  },
  2021: {
    '4-Seam Fastball': { mean: 12.01, stddev: 0.86 }, 'Slider': { mean: 12.63, stddev: 1.22 },
    'Sinker': { mean: 11.46, stddev: 1.04 }, 'Changeup': { mean: 12.17, stddev: 1.35 },
    'Curveball': { mean: 14.01, stddev: 1.73 }, 'Cutter': { mean: 11.78, stddev: 0.89 },
    'Sweeper': { mean: 12.85, stddev: 1.25 }, 'Split-Finger': { mean: 13.42, stddev: 1.86 },
    'Knuckle Curve': { mean: 14.33, stddev: 1.89 },
  },
  2022: {
    '4-Seam Fastball': { mean: 11.82, stddev: 0.86 }, 'Slider': { mean: 12.28, stddev: 1.17 },
    'Sinker': { mean: 11.04, stddev: 0.97 }, 'Changeup': { mean: 11.99, stddev: 1.53 },
    'Curveball': { mean: 13.42, stddev: 1.39 }, 'Cutter': { mean: 11.48, stddev: 0.97 },
    'Sweeper': { mean: 12.80, stddev: 1.12 }, 'Split-Finger': { mean: 12.60, stddev: 1.53 },
    'Knuckle Curve': { mean: 13.49, stddev: 1.22 },
  },
  2023: {
    '4-Seam Fastball': { mean: 11.64, stddev: 0.87 }, 'Slider': { mean: 12.22, stddev: 1.20 },
    'Sinker': { mean: 11.04, stddev: 1.01 }, 'Changeup': { mean: 11.86, stddev: 1.61 },
    'Curveball': { mean: 13.44, stddev: 1.47 }, 'Cutter': { mean: 11.46, stddev: 1.01 },
    'Sweeper': { mean: 12.79, stddev: 1.20 }, 'Split-Finger': { mean: 12.81, stddev: 1.69 },
    'Knuckle Curve': { mean: 13.44, stddev: 1.30 }, 'Slurve': { mean: 12.30, stddev: 1.19 },
  },
  2024: {
    '4-Seam Fastball': { mean: 11.65, stddev: 0.82 }, 'Slider': { mean: 12.21, stddev: 1.18 },
    'Sinker': { mean: 11.03, stddev: 0.81 }, 'Changeup': { mean: 11.89, stddev: 1.45 },
    'Curveball': { mean: 13.28, stddev: 1.40 }, 'Cutter': { mean: 11.59, stddev: 0.94 },
    'Sweeper': { mean: 12.76, stddev: 1.18 }, 'Split-Finger': { mean: 12.38, stddev: 1.36 },
    'Knuckle Curve': { mean: 13.49, stddev: 1.63 }, 'Slurve': { mean: 12.99, stddev: 1.02 },
  },
  2025: {
    '4-Seam Fastball': { mean: 11.49, stddev: 0.85 }, 'Slider': { mean: 12.05, stddev: 1.11 },
    'Sinker': { mean: 10.96, stddev: 0.82 }, 'Changeup': { mean: 11.86, stddev: 1.30 },
    'Curveball': { mean: 13.30, stddev: 1.49 }, 'Cutter': { mean: 11.44, stddev: 0.96 },
    'Sweeper': { mean: 12.70, stddev: 1.11 }, 'Split-Finger': { mean: 12.57, stddev: 1.51 },
    'Knuckle Curve': { mean: 13.16, stddev: 1.50 }, 'Slurve': { mean: 13.15, stddev: 1.26 },
  },
}

// ── CLUSTER R (vs RHB) ──────────────────────────────────────────────────────
export const CLUSTER_R_LEAGUE_BY_YEAR: YearLeague = {
  2015: {
    '4-Seam Fastball': { mean: 12.43, stddev: 1.02 }, 'Slider': { mean: 13.17, stddev: 1.96 },
    'Sinker': { mean: 12.69, stddev: 1.08 }, 'Changeup': { mean: 13.16, stddev: 1.59 },
    'Curveball': { mean: 14.32, stddev: 1.89 }, 'Cutter': { mean: 12.79, stddev: 1.62 },
    'Split-Finger': { mean: 12.85, stddev: 1.56 }, 'Knuckle Curve': { mean: 14.24, stddev: 1.68 },
  },
  2016: {
    '4-Seam Fastball': { mean: 12.49, stddev: 0.97 }, 'Slider': { mean: 13.09, stddev: 1.83 },
    'Sinker': { mean: 12.80, stddev: 1.13 }, 'Changeup': { mean: 13.03, stddev: 1.55 },
    'Curveball': { mean: 14.38, stddev: 1.68 }, 'Cutter': { mean: 12.96, stddev: 1.69 },
    'Split-Finger': { mean: 13.61, stddev: 2.06 }, 'Knuckle Curve': { mean: 14.05, stddev: 1.37 },
  },
  2017: {
    '4-Seam Fastball': { mean: 12.39, stddev: 0.99 }, 'Slider': { mean: 13.12, stddev: 1.93 },
    'Sinker': { mean: 12.62, stddev: 1.15 }, 'Changeup': { mean: 12.76, stddev: 1.50 },
    'Curveball': { mean: 14.01, stddev: 1.76 }, 'Cutter': { mean: 13.08, stddev: 1.94 },
    'Sweeper': { mean: 13.16, stddev: 1.50 }, 'Split-Finger': { mean: 13.22, stddev: 1.65 },
    'Knuckle Curve': { mean: 13.96, stddev: 1.41 },
  },
  2018: {
    '4-Seam Fastball': { mean: 12.38, stddev: 1.01 }, 'Slider': { mean: 13.12, stddev: 1.89 },
    'Sinker': { mean: 12.61, stddev: 1.12 }, 'Changeup': { mean: 12.80, stddev: 1.52 },
    'Curveball': { mean: 14.05, stddev: 1.81 }, 'Cutter': { mean: 13.06, stddev: 1.87 },
    'Sweeper': { mean: 13.22, stddev: 1.48 }, 'Split-Finger': { mean: 13.21, stddev: 1.68 },
    'Knuckle Curve': { mean: 14.10, stddev: 1.55 },
  },
  2019: {
    '4-Seam Fastball': { mean: 12.37, stddev: 1.02 }, 'Slider': { mean: 13.11, stddev: 1.84 },
    'Sinker': { mean: 12.59, stddev: 1.16 }, 'Changeup': { mean: 12.83, stddev: 1.53 },
    'Curveball': { mean: 14.08, stddev: 1.85 }, 'Cutter': { mean: 13.04, stddev: 1.79 },
    'Sweeper': { mean: 13.27, stddev: 1.45 }, 'Split-Finger': { mean: 13.20, stddev: 1.70 },
    'Knuckle Curve': { mean: 14.23, stddev: 2.00 },
  },
  2020: {
    '4-Seam Fastball': { mean: 12.29, stddev: 1.16 }, 'Slider': { mean: 13.29, stddev: 2.06 },
    'Sinker': { mean: 12.30, stddev: 1.18 }, 'Changeup': { mean: 12.66, stddev: 1.74 },
    'Curveball': { mean: 14.20, stddev: 1.94 }, 'Cutter': { mean: 13.22, stddev: 1.80 },
    'Sweeper': { mean: 13.54, stddev: 1.72 }, 'Split-Finger': { mean: 12.54, stddev: 2.12 },
    'Knuckle Curve': { mean: 13.94, stddev: 1.72 },
  },
  2021: {
    '4-Seam Fastball': { mean: 12.21, stddev: 1.10 }, 'Slider': { mean: 13.24, stddev: 1.90 },
    'Sinker': { mean: 12.13, stddev: 1.14 }, 'Changeup': { mean: 12.78, stddev: 1.71 },
    'Curveball': { mean: 14.15, stddev: 1.84 }, 'Cutter': { mean: 12.98, stddev: 1.77 },
    'Sweeper': { mean: 13.39, stddev: 1.63 }, 'Split-Finger': { mean: 12.84, stddev: 2.03 },
    'Knuckle Curve': { mean: 13.90, stddev: 1.61 },
  },
  2022: {
    '4-Seam Fastball': { mean: 12.12, stddev: 1.04 }, 'Slider': { mean: 13.18, stddev: 1.73 },
    'Sinker': { mean: 11.96, stddev: 1.09 }, 'Changeup': { mean: 12.89, stddev: 1.67 },
    'Curveball': { mean: 14.10, stddev: 1.73 }, 'Cutter': { mean: 12.73, stddev: 1.74 },
    'Sweeper': { mean: 13.23, stddev: 1.53 }, 'Split-Finger': { mean: 13.14, stddev: 1.93 },
    'Knuckle Curve': { mean: 13.85, stddev: 1.50 },
  },
  2023: {
    '4-Seam Fastball': { mean: 12.01, stddev: 1.03 }, 'Slider': { mean: 13.09, stddev: 1.75 },
    'Sinker': { mean: 11.86, stddev: 1.04 }, 'Changeup': { mean: 12.71, stddev: 1.60 },
    'Curveball': { mean: 13.96, stddev: 1.73 }, 'Cutter': { mean: 12.66, stddev: 1.78 },
    'Sweeper': { mean: 13.34, stddev: 1.66 }, 'Split-Finger': { mean: 12.98, stddev: 1.73 },
    'Knuckle Curve': { mean: 13.88, stddev: 1.58 }, 'Slurve': { mean: 13.52, stddev: 1.77 },
  },
  2024: {
    '4-Seam Fastball': { mean: 11.90, stddev: 1.01 }, 'Slider': { mean: 12.99, stddev: 1.76 },
    'Sinker': { mean: 11.75, stddev: 0.99 }, 'Changeup': { mean: 12.53, stddev: 1.53 },
    'Curveball': { mean: 13.81, stddev: 1.72 }, 'Cutter': { mean: 12.59, stddev: 1.82 },
    'Sweeper': { mean: 13.44, stddev: 1.78 }, 'Split-Finger': { mean: 12.81, stddev: 1.52 },
    'Knuckle Curve': { mean: 14.03, stddev: 2.00 }, 'Slurve': { mean: 13.69, stddev: 1.88 },
  },
  2025: {
    '4-Seam Fastball': { mean: 11.79, stddev: 1.12 }, 'Slider': { mean: 12.86, stddev: 1.64 },
    'Sinker': { mean: 11.67, stddev: 1.09 }, 'Changeup': { mean: 12.73, stddev: 1.50 },
    'Curveball': { mean: 13.98, stddev: 1.74 }, 'Cutter': { mean: 12.45, stddev: 1.68 },
    'Sweeper': { mean: 13.25, stddev: 1.66 }, 'Split-Finger': { mean: 13.32, stddev: 1.74 },
    'Knuckle Curve': { mean: 13.87, stddev: 2.13 }, 'Slurve': { mean: 14.13, stddev: 1.60 },
  },
}

// ── CLUSTER L (vs LHB) ──────────────────────────────────────────────────────
export const CLUSTER_L_LEAGUE_BY_YEAR: YearLeague = {
  2015: {
    '4-Seam Fastball': { mean: 12.52, stddev: 0.99 }, 'Slider': { mean: 13.62, stddev: 1.47 },
    'Sinker': { mean: 12.52, stddev: 1.22 }, 'Changeup': { mean: 12.51, stddev: 1.55 },
    'Curveball': { mean: 13.97, stddev: 1.79 }, 'Cutter': { mean: 13.35, stddev: 1.31 },
    'Split-Finger': { mean: 12.79, stddev: 2.18 }, 'Knuckle Curve': { mean: 13.69, stddev: 1.56 },
  },
  2016: {
    '4-Seam Fastball': { mean: 12.60, stddev: 1.01 }, 'Slider': { mean: 13.58, stddev: 1.49 },
    'Sinker': { mean: 12.41, stddev: 1.17 }, 'Changeup': { mean: 12.62, stddev: 1.68 },
    'Curveball': { mean: 13.98, stddev: 1.61 }, 'Cutter': { mean: 13.52, stddev: 1.55 },
    'Split-Finger': { mean: 12.96, stddev: 1.63 }, 'Knuckle Curve': { mean: 13.72, stddev: 1.37 },
  },
  2017: {
    '4-Seam Fastball': { mean: 12.49, stddev: 1.05 }, 'Slider': { mean: 13.72, stddev: 1.50 },
    'Sinker': { mean: 12.44, stddev: 1.26 }, 'Changeup': { mean: 12.35, stddev: 1.55 },
    'Curveball': { mean: 13.72, stddev: 1.59 }, 'Cutter': { mean: 13.59, stddev: 1.45 },
    'Sweeper': { mean: 14.27, stddev: 2.26 }, 'Split-Finger': { mean: 12.75, stddev: 1.72 },
    'Knuckle Curve': { mean: 13.94, stddev: 1.82 },
  },
  2018: {
    '4-Seam Fastball': { mean: 12.45, stddev: 1.04 }, 'Slider': { mean: 13.60, stddev: 1.49 },
    'Sinker': { mean: 12.34, stddev: 1.25 }, 'Changeup': { mean: 12.38, stddev: 1.59 },
    'Curveball': { mean: 13.92, stddev: 1.80 }, 'Cutter': { mean: 13.47, stddev: 1.48 },
    'Sweeper': { mean: 14.02, stddev: 2.04 }, 'Split-Finger': { mean: 12.82, stddev: 1.65 },
    'Knuckle Curve': { mean: 13.88, stddev: 1.72 },
  },
  2019: {
    '4-Seam Fastball': { mean: 12.41, stddev: 1.06 }, 'Slider': { mean: 13.47, stddev: 1.48 },
    'Sinker': { mean: 12.24, stddev: 1.24 }, 'Changeup': { mean: 12.40, stddev: 1.62 },
    'Curveball': { mean: 14.11, stddev: 1.98 }, 'Cutter': { mean: 13.41, stddev: 1.55 },
    'Sweeper': { mean: 13.77, stddev: 1.82 }, 'Split-Finger': { mean: 12.88, stddev: 1.57 },
    'Knuckle Curve': { mean: 13.84, stddev: 1.62 },
  },
  2020: {
    '4-Seam Fastball': { mean: 12.17, stddev: 1.09 }, 'Slider': { mean: 13.43, stddev: 1.59 },
    'Sinker': { mean: 12.35, stddev: 1.30 }, 'Changeup': { mean: 12.14, stddev: 1.63 },
    'Curveball': { mean: 14.13, stddev: 1.96 }, 'Cutter': { mean: 12.95, stddev: 1.55 },
    'Sweeper': { mean: 13.36, stddev: 1.74 }, 'Split-Finger': { mean: 13.30, stddev: 1.89 },
    'Knuckle Curve': { mean: 13.94, stddev: 1.85 },
  },
  2021: {
    '4-Seam Fastball': { mean: 12.10, stddev: 1.06 }, 'Slider': { mean: 13.33, stddev: 1.49 },
    'Sinker': { mean: 12.17, stddev: 1.25 }, 'Changeup': { mean: 12.26, stddev: 1.66 },
    'Curveball': { mean: 13.92, stddev: 1.81 }, 'Cutter': { mean: 12.94, stddev: 1.52 },
    'Sweeper': { mean: 13.40, stddev: 1.61 }, 'Split-Finger': { mean: 13.02, stddev: 1.73 },
    'Knuckle Curve': { mean: 13.88, stddev: 1.65 },
  },
  2022: {
    '4-Seam Fastball': { mean: 12.02, stddev: 1.02 }, 'Slider': { mean: 13.23, stddev: 1.38 },
    'Sinker': { mean: 11.98, stddev: 1.20 }, 'Changeup': { mean: 12.38, stddev: 1.68 },
    'Curveball': { mean: 13.71, stddev: 1.66 }, 'Cutter': { mean: 12.93, stddev: 1.48 },
    'Sweeper': { mean: 13.44, stddev: 1.48 }, 'Split-Finger': { mean: 12.74, stddev: 1.56 },
    'Knuckle Curve': { mean: 13.81, stddev: 1.44 },
  },
  2023: {
    '4-Seam Fastball': { mean: 11.91, stddev: 1.01 }, 'Slider': { mean: 13.17, stddev: 1.49 },
    'Sinker': { mean: 11.87, stddev: 1.17 }, 'Changeup': { mean: 12.36, stddev: 1.64 },
    'Curveball': { mean: 13.61, stddev: 1.65 }, 'Cutter': { mean: 12.82, stddev: 1.45 },
    'Sweeper': { mean: 13.30, stddev: 1.50 }, 'Split-Finger': { mean: 12.67, stddev: 1.50 },
    'Knuckle Curve': { mean: 13.82, stddev: 1.55 }, 'Slurve': { mean: 13.31, stddev: 1.80 },
  },
  2024: {
    '4-Seam Fastball': { mean: 11.80, stddev: 0.99 }, 'Slider': { mean: 13.11, stddev: 1.59 },
    'Sinker': { mean: 11.76, stddev: 1.13 }, 'Changeup': { mean: 12.34, stddev: 1.59 },
    'Curveball': { mean: 13.51, stddev: 1.63 }, 'Cutter': { mean: 12.70, stddev: 1.41 },
    'Sweeper': { mean: 13.16, stddev: 1.52 }, 'Split-Finger': { mean: 12.60, stddev: 1.44 },
    'Knuckle Curve': { mean: 14.02, stddev: 1.89 },
  },
  2025: {
    '4-Seam Fastball': { mean: 11.74, stddev: 0.99 }, 'Slider': { mean: 12.97, stddev: 1.47 },
    'Sinker': { mean: 11.74, stddev: 1.18 }, 'Changeup': { mean: 12.34, stddev: 1.60 },
    'Curveball': { mean: 13.62, stddev: 1.73 }, 'Cutter': { mean: 12.47, stddev: 1.48 },
    'Sweeper': { mean: 13.13, stddev: 1.61 }, 'Split-Finger': { mean: 12.75, stddev: 1.71 },
    'Knuckle Curve': { mean: 13.44, stddev: 1.76 }, 'Slurve': { mean: 13.31, stddev: 1.80 },
  },
}

// ── HDEV ─────────────────────────────────────────────────────────────────────
export const HDEV_LEAGUE_BY_YEAR: YearLeague = {
  2015: {
    '4-Seam Fastball': { mean: 7.91, stddev: 0.78 }, 'Slider': { mean: 7.66, stddev: 1.18 },
    'Sinker': { mean: 7.77, stddev: 0.97 }, 'Changeup': { mean: 7.20, stddev: 0.94 },
    'Curveball': { mean: 8.19, stddev: 1.34 }, 'Cutter': { mean: 7.49, stddev: 1.06 },
    'Split-Finger': { mean: 7.05, stddev: 1.30 }, 'Knuckle Curve': { mean: 7.68, stddev: 1.10 },
  },
  2016: {
    '4-Seam Fastball': { mean: 7.86, stddev: 0.78 }, 'Slider': { mean: 7.57, stddev: 1.11 },
    'Sinker': { mean: 7.73, stddev: 0.83 }, 'Changeup': { mean: 7.23, stddev: 1.01 },
    'Curveball': { mean: 8.04, stddev: 1.19 }, 'Cutter': { mean: 7.53, stddev: 0.90 },
    'Split-Finger': { mean: 7.28, stddev: 1.02 }, 'Knuckle Curve': { mean: 7.47, stddev: 0.90 },
  },
  2017: {
    '4-Seam Fastball': { mean: 7.71, stddev: 0.82 }, 'Slider': { mean: 7.64, stddev: 1.14 },
    'Sinker': { mean: 7.64, stddev: 0.88 }, 'Changeup': { mean: 7.17, stddev: 0.97 },
    'Curveball': { mean: 8.04, stddev: 1.11 }, 'Cutter': { mean: 7.40, stddev: 1.09 },
    'Sweeper': { mean: 9.03, stddev: 1.32 }, 'Split-Finger': { mean: 7.04, stddev: 0.83 },
    'Knuckle Curve': { mean: 7.75, stddev: 1.13 },
  },
  2018: {
    '4-Seam Fastball': { mean: 7.59, stddev: 0.73 }, 'Slider': { mean: 7.72, stddev: 1.17 },
    'Sinker': { mean: 7.48, stddev: 0.92 }, 'Changeup': { mean: 7.12, stddev: 1.02 },
    'Curveball': { mean: 8.16, stddev: 1.35 }, 'Cutter': { mean: 7.45, stddev: 1.07 },
    'Sweeper': { mean: 8.99, stddev: 0.92 }, 'Split-Finger': { mean: 7.14, stddev: 0.97 },
    'Knuckle Curve': { mean: 7.57, stddev: 0.94 },
  },
  2019: {
    '4-Seam Fastball': { mean: 7.49, stddev: 0.79 }, 'Slider': { mean: 7.65, stddev: 1.22 },
    'Sinker': { mean: 7.40, stddev: 0.88 }, 'Changeup': { mean: 7.15, stddev: 1.04 },
    'Curveball': { mean: 8.06, stddev: 1.27 }, 'Cutter': { mean: 7.27, stddev: 0.98 },
    'Sweeper': { mean: 8.69, stddev: 1.41 }, 'Split-Finger': { mean: 7.03, stddev: 0.96 },
    'Knuckle Curve': { mean: 7.52, stddev: 1.09 },
  },
  2020: {
    '4-Seam Fastball': { mean: 7.31, stddev: 0.86 }, 'Slider': { mean: 7.50, stddev: 1.28 },
    'Sinker': { mean: 7.34, stddev: 0.97 }, 'Changeup': { mean: 6.89, stddev: 1.09 },
    'Curveball': { mean: 7.87, stddev: 1.42 }, 'Cutter': { mean: 7.15, stddev: 0.99 },
    'Sweeper': { mean: 8.52, stddev: 1.45 }, 'Split-Finger': { mean: 7.13, stddev: 0.98 },
    'Knuckle Curve': { mean: 7.39, stddev: 1.17 },
  },
  2021: {
    '4-Seam Fastball': { mean: 7.28, stddev: 0.78 }, 'Slider': { mean: 7.70, stddev: 1.25 },
    'Sinker': { mean: 7.44, stddev: 0.91 }, 'Changeup': { mean: 7.14, stddev: 0.99 },
    'Curveball': { mean: 8.00, stddev: 1.43 }, 'Cutter': { mean: 7.21, stddev: 0.96 },
    'Sweeper': { mean: 8.43, stddev: 1.37 }, 'Split-Finger': { mean: 7.34, stddev: 1.18 },
    'Knuckle Curve': { mean: 7.60, stddev: 1.37 },
  },
  2022: {
    '4-Seam Fastball': { mean: 7.19, stddev: 0.80 }, 'Slider': { mean: 7.52, stddev: 1.20 },
    'Sinker': { mean: 7.17, stddev: 0.92 }, 'Changeup': { mean: 7.18, stddev: 1.14 },
    'Curveball': { mean: 7.73, stddev: 1.16 }, 'Cutter': { mean: 6.98, stddev: 0.92 },
    'Sweeper': { mean: 8.55, stddev: 1.25 }, 'Split-Finger': { mean: 7.23, stddev: 0.95 },
    'Knuckle Curve': { mean: 7.42, stddev: 0.94 },
  },
  2023: {
    '4-Seam Fastball': { mean: 7.07, stddev: 0.78 }, 'Slider': { mean: 7.47, stddev: 1.17 },
    'Sinker': { mean: 7.19, stddev: 0.92 }, 'Changeup': { mean: 7.13, stddev: 0.99 },
    'Curveball': { mean: 7.79, stddev: 1.20 }, 'Cutter': { mean: 6.94, stddev: 0.96 },
    'Sweeper': { mean: 8.58, stddev: 1.41 }, 'Split-Finger': { mean: 7.41, stddev: 1.15 },
    'Knuckle Curve': { mean: 7.51, stddev: 1.13 }, 'Slurve': { mean: 7.84, stddev: 0.95 },
  },
  2024: {
    '4-Seam Fastball': { mean: 7.11, stddev: 0.74 }, 'Slider': { mean: 7.50, stddev: 1.18 },
    'Sinker': { mean: 7.22, stddev: 0.79 }, 'Changeup': { mean: 7.25, stddev: 1.07 },
    'Curveball': { mean: 7.66, stddev: 1.26 }, 'Cutter': { mean: 7.12, stddev: 0.90 },
    'Sweeper': { mean: 8.69, stddev: 1.34 }, 'Split-Finger': { mean: 7.29, stddev: 1.02 },
    'Knuckle Curve': { mean: 7.47, stddev: 1.20 }, 'Slurve': { mean: 8.11, stddev: 1.05 },
  },
  2025: {
    '4-Seam Fastball': { mean: 6.99, stddev: 0.80 }, 'Slider': { mean: 7.30, stddev: 1.07 },
    'Sinker': { mean: 7.14, stddev: 0.77 }, 'Changeup': { mean: 7.18, stddev: 1.02 },
    'Curveball': { mean: 7.66, stddev: 1.25 }, 'Cutter': { mean: 7.08, stddev: 0.85 },
    'Sweeper': { mean: 8.64, stddev: 1.23 }, 'Split-Finger': { mean: 7.27, stddev: 1.21 },
    'Knuckle Curve': { mean: 7.52, stddev: 1.27 }, 'Slurve': { mean: 8.83, stddev: 1.43 },
  },
}

// ── VDEV ─────────────────────────────────────────────────────────────────────
export const VDEV_LEAGUE_BY_YEAR: YearLeague = {
  2015: {
    '4-Seam Fastball': { mean: 7.75, stddev: 0.83 }, 'Slider': { mean: 8.37, stddev: 1.29 },
    'Sinker': { mean: 7.36, stddev: 0.92 }, 'Changeup': { mean: 8.51, stddev: 1.34 },
    'Curveball': { mean: 9.72, stddev: 1.58 }, 'Cutter': { mean: 7.79, stddev: 1.01 },
    'Split-Finger': { mean: 8.90, stddev: 1.77 }, 'Knuckle Curve': { mean: 9.75, stddev: 1.50 },
  },
  2016: {
    '4-Seam Fastball': { mean: 7.81, stddev: 0.83 }, 'Slider': { mean: 8.37, stddev: 1.31 },
    'Sinker': { mean: 7.40, stddev: 0.90 }, 'Changeup': { mean: 8.49, stddev: 1.33 },
    'Curveball': { mean: 9.76, stddev: 1.46 }, 'Cutter': { mean: 7.82, stddev: 0.94 },
    'Split-Finger': { mean: 9.35, stddev: 1.84 }, 'Knuckle Curve': { mean: 9.77, stddev: 1.35 },
  },
  2017: {
    '4-Seam Fastball': { mean: 7.81, stddev: 0.85 }, 'Slider': { mean: 8.33, stddev: 1.33 },
    'Sinker': { mean: 7.32, stddev: 0.86 }, 'Changeup': { mean: 8.17, stddev: 1.18 },
    'Curveball': { mean: 9.49, stddev: 1.59 }, 'Cutter': { mean: 7.88, stddev: 1.03 },
    'Sweeper': { mean: 7.96, stddev: 1.37 }, 'Split-Finger': { mean: 9.09, stddev: 1.63 },
    'Knuckle Curve': { mean: 9.68, stddev: 1.49 },
  },
  2018: {
    '4-Seam Fastball': { mean: 7.92, stddev: 0.86 }, 'Slider': { mean: 8.43, stddev: 1.41 },
    'Sinker': { mean: 7.18, stddev: 0.94 }, 'Changeup': { mean: 8.19, stddev: 1.29 },
    'Curveball': { mean: 9.62, stddev: 1.60 }, 'Cutter': { mean: 7.81, stddev: 1.14 },
    'Sweeper': { mean: 7.86, stddev: 1.23 }, 'Split-Finger': { mean: 9.45, stddev: 1.75 },
    'Knuckle Curve': { mean: 9.95, stddev: 1.60 },
  },
  2019: {
    '4-Seam Fastball': { mean: 7.96, stddev: 0.89 }, 'Slider': { mean: 8.28, stddev: 1.23 },
    'Sinker': { mean: 7.19, stddev: 0.97 }, 'Changeup': { mean: 8.26, stddev: 1.36 },
    'Curveball': { mean: 9.65, stddev: 1.71 }, 'Cutter': { mean: 7.73, stddev: 1.02 },
    'Sweeper': { mean: 7.92, stddev: 1.00 }, 'Split-Finger': { mean: 9.18, stddev: 1.53 },
    'Knuckle Curve': { mean: 10.00, stddev: 1.77 },
  },
  2020: {
    '4-Seam Fastball': { mean: 7.88, stddev: 0.94 }, 'Slider': { mean: 8.38, stddev: 1.33 },
    'Sinker': { mean: 7.12, stddev: 0.94 }, 'Changeup': { mean: 8.01, stddev: 1.35 },
    'Curveball': { mean: 9.65, stddev: 1.76 }, 'Cutter': { mean: 7.73, stddev: 1.08 },
    'Sweeper': { mean: 8.06, stddev: 1.56 }, 'Split-Finger': { mean: 8.79, stddev: 1.33 },
    'Knuckle Curve': { mean: 9.81, stddev: 1.78 },
  },
  2021: {
    '4-Seam Fastball': { mean: 8.08, stddev: 0.95 }, 'Slider': { mean: 8.59, stddev: 1.37 },
    'Sinker': { mean: 7.24, stddev: 1.02 }, 'Changeup': { mean: 8.49, stddev: 1.45 },
    'Curveball': { mean: 10.12, stddev: 1.94 }, 'Cutter': { mean: 7.89, stddev: 1.01 },
    'Sweeper': { mean: 8.19, stddev: 1.34 }, 'Split-Finger': { mean: 9.93, stddev: 1.85 },
    'Knuckle Curve': { mean: 10.87, stddev: 1.83 },
  },
  2022: {
    '4-Seam Fastball': { mean: 7.91, stddev: 0.87 }, 'Slider': { mean: 8.31, stddev: 1.30 },
    'Sinker': { mean: 6.96, stddev: 0.92 }, 'Changeup': { mean: 8.25, stddev: 1.49 },
    'Curveball': { mean: 9.59, stddev: 1.74 }, 'Cutter': { mean: 7.74, stddev: 0.96 },
    'Sweeper': { mean: 7.97, stddev: 1.36 }, 'Split-Finger': { mean: 8.98, stddev: 1.66 },
    'Knuckle Curve': { mean: 10.01, stddev: 1.34 },
  },
  2023: {
    '4-Seam Fastball': { mean: 7.81, stddev: 0.87 }, 'Slider': { mean: 8.30, stddev: 1.33 },
    'Sinker': { mean: 6.93, stddev: 0.99 }, 'Changeup': { mean: 8.14, stddev: 1.61 },
    'Curveball': { mean: 9.57, stddev: 1.69 }, 'Cutter': { mean: 7.77, stddev: 1.02 },
    'Sweeper': { mean: 7.91, stddev: 1.32 }, 'Split-Finger': { mean: 9.11, stddev: 1.53 },
    'Knuckle Curve': { mean: 9.87, stddev: 1.39 }, 'Slurve': { mean: 8.07, stddev: 1.07 },
  },
  2024: {
    '4-Seam Fastball': { mean: 7.78, stddev: 0.88 }, 'Slider': { mean: 8.25, stddev: 1.25 },
    'Sinker': { mean: 6.91, stddev: 0.89 }, 'Changeup': { mean: 8.06, stddev: 1.48 },
    'Curveball': { mean: 9.48, stddev: 1.62 }, 'Cutter': { mean: 7.77, stddev: 1.04 },
    'Sweeper': { mean: 7.78, stddev: 1.25 }, 'Split-Finger': { mean: 8.67, stddev: 1.37 },
    'Knuckle Curve': { mean: 9.95, stddev: 1.76 }, 'Slurve': { mean: 8.72, stddev: 1.39 },
  },
  2025: {
    '4-Seam Fastball': { mean: 7.69, stddev: 0.91 }, 'Slider': { mean: 8.22, stddev: 1.24 },
    'Sinker': { mean: 6.89, stddev: 0.91 }, 'Changeup': { mean: 8.08, stddev: 1.38 },
    'Curveball': { mean: 9.49, stddev: 1.72 }, 'Cutter': { mean: 7.62, stddev: 1.04 },
    'Sweeper': { mean: 7.75, stddev: 1.29 }, 'Split-Finger': { mean: 8.91, stddev: 1.46 },
    'Knuckle Curve': { mean: 9.50, stddev: 1.50 }, 'Slurve': { mean: 8.29, stddev: 1.13 },
  },
}

// ── MISSFIRE (avg miss distance in inches for outside-zone, non-swing pitches) ──
export const MISSFIRE_LEAGUE_BY_YEAR: YearLeague = {
  2015: {
    '4-Seam Fastball': { mean: 6.89, stddev: 0.77 }, 'Slider': { mean: 9.05, stddev: 1.55 },
    'Sinker': { mean: 7.15, stddev: 0.92 }, 'Changeup': { mean: 9.28, stddev: 1.49 },
    'Curveball': { mean: 9.75, stddev: 1.76 }, 'Cutter': { mean: 7.60, stddev: 1.32 },
    'Split-Finger': { mean: 10.13, stddev: 1.52 }, 'Knuckle Curve': { mean: 9.64, stddev: 1.99 },
  },
  2016: {
    '4-Seam Fastball': { mean: 6.93, stddev: 0.85 }, 'Slider': { mean: 8.94, stddev: 1.62 },
    'Sinker': { mean: 7.17, stddev: 0.92 }, 'Changeup': { mean: 9.19, stddev: 1.50 },
    'Curveball': { mean: 9.75, stddev: 1.89 }, 'Cutter': { mean: 7.63, stddev: 1.38 },
    'Split-Finger': { mean: 10.14, stddev: 1.16 }, 'Knuckle Curve': { mean: 9.67, stddev: 1.67 },
  },
  2017: {
    '4-Seam Fastball': { mean: 6.93, stddev: 0.91 }, 'Slider': { mean: 9.13, stddev: 1.59 },
    'Sinker': { mean: 7.01, stddev: 0.92 }, 'Changeup': { mean: 9.12, stddev: 1.46 },
    'Curveball': { mean: 9.63, stddev: 1.82 }, 'Cutter': { mean: 8.03, stddev: 1.30 },
    'Sweeper': { mean: 9.60, stddev: 1.82 }, 'Split-Finger': { mean: 10.40, stddev: 1.77 },
    'Knuckle Curve': { mean: 9.84, stddev: 1.70 },
  },
  2018: {
    '4-Seam Fastball': { mean: 7.01, stddev: 0.91 }, 'Slider': { mean: 9.20, stddev: 1.61 },
    'Sinker': { mean: 7.02, stddev: 0.93 }, 'Changeup': { mean: 9.10, stddev: 1.41 },
    'Curveball': { mean: 9.52, stddev: 1.75 }, 'Cutter': { mean: 7.95, stddev: 1.36 },
    'Sweeper': { mean: 9.27, stddev: 1.86 }, 'Split-Finger': { mean: 11.01, stddev: 1.92 },
    'Knuckle Curve': { mean: 9.95, stddev: 1.51 },
  },
  2019: {
    '4-Seam Fastball': { mean: 7.10, stddev: 0.94 }, 'Slider': { mean: 9.21, stddev: 1.53 },
    'Sinker': { mean: 6.98, stddev: 0.92 }, 'Changeup': { mean: 9.21, stddev: 1.49 },
    'Curveball': { mean: 9.73, stddev: 1.87 }, 'Cutter': { mean: 7.81, stddev: 1.40 },
    'Sweeper': { mean: 9.55, stddev: 1.16 }, 'Split-Finger': { mean: 10.72, stddev: 1.86 },
    'Knuckle Curve': { mean: 10.27, stddev: 1.83 },
  },
  2020: {
    '4-Seam Fastball': { mean: 7.06, stddev: 1.00 }, 'Slider': { mean: 9.41, stddev: 1.70 },
    'Sinker': { mean: 6.73, stddev: 1.01 }, 'Changeup': { mean: 8.83, stddev: 1.59 },
    'Curveball': { mean: 10.04, stddev: 1.94 }, 'Cutter': { mean: 7.79, stddev: 1.61 },
    'Sweeper': { mean: 9.51, stddev: 1.45 }, 'Split-Finger': { mean: 10.17, stddev: 1.78 },
    'Knuckle Curve': { mean: 10.23, stddev: 1.96 },
  },
  2021: {
    '4-Seam Fastball': { mean: 7.23, stddev: 0.96 }, 'Slider': { mean: 9.27, stddev: 1.50 },
    'Sinker': { mean: 6.80, stddev: 0.95 }, 'Changeup': { mean: 9.13, stddev: 1.48 },
    'Curveball': { mean: 10.16, stddev: 2.02 }, 'Cutter': { mean: 7.52, stddev: 1.26 },
    'Sweeper': { mean: 9.27, stddev: 1.52 }, 'Split-Finger': { mean: 10.73, stddev: 1.73 },
    'Knuckle Curve': { mean: 10.60, stddev: 1.84 },
  },
  2022: {
    '4-Seam Fastball': { mean: 7.10, stddev: 0.98 }, 'Slider': { mean: 9.06, stddev: 1.37 },
    'Sinker': { mean: 6.58, stddev: 0.85 }, 'Changeup': { mean: 9.13, stddev: 1.51 },
    'Curveball': { mean: 9.60, stddev: 1.86 }, 'Cutter': { mean: 7.33, stddev: 1.14 },
    'Sweeper': { mean: 9.03, stddev: 1.33 }, 'Split-Finger': { mean: 10.16, stddev: 1.56 },
    'Knuckle Curve': { mean: 10.00, stddev: 1.70 },
  },
  2023: {
    '4-Seam Fastball': { mean: 7.05, stddev: 1.00 }, 'Slider': { mean: 8.91, stddev: 1.50 },
    'Sinker': { mean: 6.54, stddev: 0.93 }, 'Changeup': { mean: 9.08, stddev: 1.49 },
    'Curveball': { mean: 9.60, stddev: 1.84 }, 'Cutter': { mean: 7.25, stddev: 1.25 },
    'Sweeper': { mean: 9.10, stddev: 1.60 }, 'Split-Finger': { mean: 10.22, stddev: 1.75 },
    'Knuckle Curve': { mean: 10.22, stddev: 2.02 }, 'Slurve': { mean: 8.72, stddev: 1.25 },
  },
  2024: {
    '4-Seam Fastball': { mean: 7.10, stddev: 1.06 }, 'Slider': { mean: 8.88, stddev: 1.45 },
    'Sinker': { mean: 6.43, stddev: 0.92 }, 'Changeup': { mean: 8.99, stddev: 1.44 },
    'Curveball': { mean: 9.66, stddev: 1.98 }, 'Cutter': { mean: 7.22, stddev: 1.16 },
    'Sweeper': { mean: 9.11, stddev: 1.28 }, 'Split-Finger': { mean: 9.89, stddev: 1.56 },
    'Knuckle Curve': { mean: 10.42, stddev: 1.76 }, 'Slurve': { mean: 9.07, stddev: 1.29 },
  },
  2025: {
    '4-Seam Fastball': { mean: 7.01, stddev: 1.03 }, 'Slider': { mean: 8.74, stddev: 1.43 },
    'Sinker': { mean: 6.41, stddev: 1.03 }, 'Changeup': { mean: 9.13, stddev: 1.37 },
    'Curveball': { mean: 9.54, stddev: 1.83 }, 'Cutter': { mean: 7.13, stddev: 1.22 },
    'Sweeper': { mean: 8.92, stddev: 1.43 }, 'Split-Finger': { mean: 9.98, stddev: 1.52 },
    'Knuckle Curve': { mean: 10.22, stddev: 1.74 }, 'Slurve': { mean: 9.55, stddev: 1.00 },
  },
}

// ── CLOSE% (% of non-swing zone misses within 2" of edge) ──────────────────
export const CLOSE_PCT_LEAGUE_BY_YEAR: YearLeague = {
  2015: {
    '4-Seam Fastball': { mean: 13.55, stddev: 4.48 }, 'Slider': { mean: 9.22, stddev: 4.36 },
    'Sinker': { mean: 11.90, stddev: 4.57 }, 'Changeup': { mean: 7.38, stddev: 4.50 },
    'Curveball': { mean: 9.41, stddev: 4.55 }, 'Cutter': { mean: 11.38, stddev: 4.58 },
    'Split-Finger': { mean: 7.31, stddev: 3.55 }, 'Knuckle Curve': { mean: 9.82, stddev: 3.84 },
  },
  2016: {
    '4-Seam Fastball': { mean: 13.61, stddev: 4.15 }, 'Slider': { mean: 9.67, stddev: 4.72 },
    'Sinker': { mean: 12.28, stddev: 4.82 }, 'Changeup': { mean: 7.25, stddev: 4.31 },
    'Curveball': { mean: 9.67, stddev: 4.73 }, 'Cutter': { mean: 11.12, stddev: 4.50 },
    'Split-Finger': { mean: 6.85, stddev: 2.76 }, 'Knuckle Curve': { mean: 9.86, stddev: 4.59 },
  },
  2017: {
    '4-Seam Fastball': { mean: 12.75, stddev: 4.17 }, 'Slider': { mean: 8.97, stddev: 4.30 },
    'Sinker': { mean: 11.94, stddev: 4.26 }, 'Changeup': { mean: 7.36, stddev: 4.16 },
    'Curveball': { mean: 9.50, stddev: 4.34 }, 'Cutter': { mean: 10.12, stddev: 3.97 },
    'Sweeper': { mean: 9.57, stddev: 2.19 }, 'Split-Finger': { mean: 6.71, stddev: 3.45 },
    'Knuckle Curve': { mean: 9.05, stddev: 3.59 },
  },
  2018: {
    '4-Seam Fastball': { mean: 13.18, stddev: 4.37 }, 'Slider': { mean: 9.32, stddev: 4.66 },
    'Sinker': { mean: 12.06, stddev: 4.90 }, 'Changeup': { mean: 7.08, stddev: 3.92 },
    'Curveball': { mean: 9.78, stddev: 4.65 }, 'Cutter': { mean: 10.01, stddev: 4.38 },
    'Sweeper': { mean: 9.82, stddev: 4.53 }, 'Split-Finger': { mean: 5.23, stddev: 3.51 },
    'Knuckle Curve': { mean: 9.58, stddev: 3.11 },
  },
  2019: {
    '4-Seam Fastball': { mean: 13.19, stddev: 4.35 }, 'Slider': { mean: 9.07, stddev: 4.09 },
    'Sinker': { mean: 12.11, stddev: 4.78 }, 'Changeup': { mean: 7.03, stddev: 3.90 },
    'Curveball': { mean: 9.25, stddev: 4.91 }, 'Cutter': { mean: 10.26, stddev: 4.18 },
    'Sweeper': { mean: 8.46, stddev: 3.15 }, 'Split-Finger': { mean: 5.51, stddev: 3.89 },
    'Knuckle Curve': { mean: 8.82, stddev: 4.07 },
  },
  2020: {
    '4-Seam Fastball': { mean: 13.25, stddev: 5.15 }, 'Slider': { mean: 8.69, stddev: 4.83 },
    'Sinker': { mean: 13.27, stddev: 5.61 }, 'Changeup': { mean: 7.56, stddev: 4.81 },
    'Curveball': { mean: 9.25, stddev: 5.19 }, 'Cutter': { mean: 10.51, stddev: 6.03 },
    'Sweeper': { mean: 8.26, stddev: 4.69 }, 'Split-Finger': { mean: 5.90, stddev: 3.63 },
    'Knuckle Curve': { mean: 8.52, stddev: 4.12 },
  },
  2021: {
    '4-Seam Fastball': { mean: 12.66, stddev: 4.46 }, 'Slider': { mean: 8.85, stddev: 4.22 },
    'Sinker': { mean: 13.28, stddev: 5.08 }, 'Changeup': { mean: 7.07, stddev: 3.93 },
    'Curveball': { mean: 8.93, stddev: 4.63 }, 'Cutter': { mean: 10.65, stddev: 4.97 },
    'Sweeper': { mean: 8.73, stddev: 4.27 }, 'Split-Finger': { mean: 7.13, stddev: 3.06 },
    'Knuckle Curve': { mean: 8.88, stddev: 3.71 },
  },
  2022: {
    '4-Seam Fastball': { mean: 13.06, stddev: 4.19 }, 'Slider': { mean: 8.89, stddev: 3.92 },
    'Sinker': { mean: 13.43, stddev: 5.02 }, 'Changeup': { mean: 7.24, stddev: 4.17 },
    'Curveball': { mean: 9.55, stddev: 4.33 }, 'Cutter': { mean: 11.36, stddev: 5.16 },
    'Sweeper': { mean: 9.67, stddev: 4.07 }, 'Split-Finger': { mean: 6.37, stddev: 4.12 },
    'Knuckle Curve': { mean: 8.94, stddev: 4.02 },
  },
  2023: {
    '4-Seam Fastball': { mean: 13.48, stddev: 4.58 }, 'Slider': { mean: 9.10, stddev: 4.02 },
    'Sinker': { mean: 14.05, stddev: 5.41 }, 'Changeup': { mean: 7.30, stddev: 4.04 },
    'Curveball': { mean: 9.19, stddev: 4.49 }, 'Cutter': { mean: 11.87, stddev: 4.72 },
    'Sweeper': { mean: 9.17, stddev: 4.96 }, 'Split-Finger': { mean: 6.45, stddev: 3.74 },
    'Knuckle Curve': { mean: 8.46, stddev: 4.45 }, 'Slurve': { mean: 9.13, stddev: 6.22 },
  },
  2024: {
    '4-Seam Fastball': { mean: 13.03, stddev: 4.74 }, 'Slider': { mean: 9.37, stddev: 4.44 },
    'Sinker': { mean: 14.73, stddev: 5.34 }, 'Changeup': { mean: 7.68, stddev: 4.53 },
    'Curveball': { mean: 9.50, stddev: 4.53 }, 'Cutter': { mean: 11.76, stddev: 4.80 },
    'Sweeper': { mean: 9.09, stddev: 4.22 }, 'Split-Finger': { mean: 7.31, stddev: 3.75 },
    'Knuckle Curve': { mean: 7.89, stddev: 3.52 }, 'Slurve': { mean: 10.19, stddev: 6.72 },
  },
  2025: {
    '4-Seam Fastball': { mean: 13.17, stddev: 4.69 }, 'Slider': { mean: 9.86, stddev: 4.93 },
    'Sinker': { mean: 14.69, stddev: 5.36 }, 'Changeup': { mean: 7.19, stddev: 3.76 },
    'Curveball': { mean: 9.79, stddev: 4.64 }, 'Cutter': { mean: 12.46, stddev: 5.45 },
    'Sweeper': { mean: 9.76, stddev: 5.03 }, 'Split-Finger': { mean: 6.52, stddev: 3.73 },
    'Knuckle Curve': { mean: 8.91, stddev: 3.34 }, 'Slurve': { mean: 9.03, stddev: 3.01 },
  },
}

// ── LEAGUE-WIDE CENTROIDS (avg plate_x / plate_z per pitch type per year, in feet) ──
// Used for computing Cluster (distance from league centroid) on single-game data
// where pitcher-level centroid is not meaningful.
type CentroidEntry = { cx: number; cz: number }
type YearCentroids = Record<number, Record<string, CentroidEntry>>

export const CENTROIDS_BY_YEAR: YearCentroids = {
  2015: {
    '4-Seam Fastball': { cx: -0.0433, cz: 2.5661 }, 'Slider': { cx: 0.1711, cz: 1.8879 },
    'Sinker': { cx: -0.1585, cz: 2.3215 }, 'Changeup': { cx: -0.1386, cz: 1.8619 },
    'Curveball': { cx: -0.0174, cz: 1.8645 }, 'Cutter': { cx: 0.1310, cz: 2.3018 },
    'Split-Finger': { cx: -0.2409, cz: 1.7304 }, 'Knuckle Curve': { cx: 0.0805, cz: 1.7993 },
    'Sweeper': { cx: 0.2289, cz: 2.0222 },
  },
  2016: {
    '4-Seam Fastball': { cx: -0.0448, cz: 2.5827 }, 'Slider': { cx: 0.2011, cz: 1.8914 },
    'Sinker': { cx: -0.1591, cz: 2.3432 }, 'Changeup': { cx: -0.1477, cz: 1.8738 },
    'Curveball': { cx: 0.0152, cz: 1.8704 }, 'Cutter': { cx: 0.1630, cz: 2.2756 },
    'Split-Finger': { cx: -0.2613, cz: 1.7266 }, 'Knuckle Curve': { cx: 0.0669, cz: 1.8012 },
    'Sweeper': { cx: 0.1308, cz: 1.8691 }, 'Slurve': { cx: 0.1757, cz: 1.7375 },
  },
  2017: {
    '4-Seam Fastball': { cx: 0.0334, cz: 2.6345 }, 'Slider': { cx: 0.2631, cz: 1.8977 },
    'Sinker': { cx: -0.0793, cz: 2.3464 }, 'Changeup': { cx: -0.0699, cz: 1.8712 },
    'Curveball': { cx: 0.0867, cz: 1.8826 }, 'Cutter': { cx: 0.2559, cz: 2.2248 },
    'Split-Finger': { cx: -0.1889, cz: 1.7083 }, 'Knuckle Curve': { cx: 0.0856, cz: 1.8602 },
    'Sweeper': { cx: 0.1918, cz: 1.9443 }, 'Slurve': { cx: 0.3462, cz: 1.7642 },
  },
  2018: {
    '4-Seam Fastball': { cx: 0.0193, cz: 2.6516 }, 'Slider': { cx: 0.2386, cz: 1.8549 },
    'Sinker': { cx: -0.0999, cz: 2.3050 }, 'Changeup': { cx: -0.0718, cz: 1.8514 },
    'Curveball': { cx: 0.0740, cz: 1.8775 }, 'Cutter': { cx: 0.1747, cz: 2.2552 },
    'Split-Finger': { cx: -0.2457, cz: 1.6387 }, 'Knuckle Curve': { cx: 0.0999, cz: 1.8109 },
    'Sweeper': { cx: 0.3070, cz: 1.9482 }, 'Slurve': { cx: 0.3468, cz: 1.8234 },
  },
  2019: {
    '4-Seam Fastball': { cx: 0.0070, cz: 2.7038 }, 'Slider': { cx: 0.2494, cz: 1.8278 },
    'Sinker': { cx: -0.1230, cz: 2.2933 }, 'Changeup': { cx: -0.0605, cz: 1.8331 },
    'Curveball': { cx: 0.0891, cz: 1.8543 }, 'Cutter': { cx: 0.1489, cz: 2.2322 },
    'Split-Finger': { cx: -0.2188, cz: 1.6361 }, 'Knuckle Curve': { cx: 0.1291, cz: 1.7540 },
    'Sweeper': { cx: 0.3659, cz: 1.9010 }, 'Slurve': { cx: 0.2678, cz: 1.7976 },
  },
  2020: {
    '4-Seam Fastball': { cx: 0.0050, cz: 2.7184 }, 'Slider': { cx: 0.2683, cz: 1.8164 },
    'Sinker': { cx: -0.1143, cz: 2.3017 }, 'Changeup': { cx: -0.0759, cz: 1.8329 },
    'Curveball': { cx: 0.1051, cz: 1.7719 }, 'Cutter': { cx: 0.1888, cz: 2.3030 },
    'Split-Finger': { cx: -0.2181, cz: 1.7058 }, 'Knuckle Curve': { cx: 0.1236, cz: 1.7552 },
    'Sweeper': { cx: 0.2453, cz: 1.9017 }, 'Slurve': { cx: 0.0343, cz: 1.8307 },
  },
  2021: {
    '4-Seam Fastball': { cx: 0.0007, cz: 2.7436 }, 'Slider': { cx: 0.2203, cz: 1.8773 },
    'Sinker': { cx: -0.0753, cz: 2.3279 }, 'Changeup': { cx: -0.0384, cz: 1.8487 },
    'Curveball': { cx: 0.0846, cz: 1.8315 }, 'Cutter': { cx: 0.1689, cz: 2.3188 },
    'Split-Finger': { cx: -0.2277, cz: 1.6972 }, 'Knuckle Curve': { cx: 0.0772, cz: 1.7850 },
    'Sweeper': { cx: 0.2532, cz: 1.9509 }, 'Slurve': { cx: 0.0897, cz: 1.7727 },
  },
  2022: {
    '4-Seam Fastball': { cx: -0.0100, cz: 2.8103 }, 'Slider': { cx: 0.2340, cz: 1.8644 },
    'Sinker': { cx: -0.1239, cz: 2.3504 }, 'Changeup': { cx: -0.0728, cz: 1.8370 },
    'Curveball': { cx: 0.0744, cz: 1.8602 }, 'Cutter': { cx: 0.2193, cz: 2.3548 },
    'Split-Finger': { cx: -0.2670, cz: 1.6841 }, 'Knuckle Curve': { cx: 0.1152, cz: 1.7962 },
    'Sweeper': { cx: 0.3205, cz: 1.9831 }, 'Slurve': { cx: 0.0206, cz: 1.8574 },
  },
  2023: {
    '4-Seam Fastball': { cx: -0.0174, cz: 2.8151 }, 'Slider': { cx: 0.2111, cz: 1.8686 },
    'Sinker': { cx: -0.1048, cz: 2.3579 }, 'Changeup': { cx: -0.0775, cz: 1.8161 },
    'Curveball': { cx: 0.0494, cz: 1.8337 }, 'Cutter': { cx: 0.1835, cz: 2.3681 },
    'Split-Finger': { cx: -0.2545, cz: 1.7292 }, 'Knuckle Curve': { cx: 0.1317, cz: 1.7331 },
    'Sweeper': { cx: 0.2861, cz: 1.9754 }, 'Slurve': { cx: 0.1026, cz: 1.8704 },
  },
  2024: {
    '4-Seam Fastball': { cx: -0.0071, cz: 2.8516 }, 'Slider': { cx: 0.2444, cz: 1.8870 },
    'Sinker': { cx: -0.0741, cz: 2.3701 }, 'Changeup': { cx: -0.0450, cz: 1.8121 },
    'Curveball': { cx: 0.0615, cz: 1.8202 }, 'Cutter': { cx: 0.1723, cz: 2.4323 },
    'Split-Finger': { cx: -0.1718, cz: 1.7072 }, 'Knuckle Curve': { cx: 0.1031, cz: 1.6848 },
    'Sweeper': { cx: 0.3075, cz: 2.0022 }, 'Slurve': { cx: 0.2486, cz: 1.8454 },
  },
  2025: {
    '4-Seam Fastball': { cx: -0.0066, cz: 2.8650 }, 'Slider': { cx: 0.2041, cz: 1.9262 },
    'Sinker': { cx: -0.0823, cz: 2.4000 }, 'Changeup': { cx: -0.0644, cz: 1.8247 },
    'Curveball': { cx: 0.0410, cz: 1.8473 }, 'Cutter': { cx: 0.1744, cz: 2.5095 },
    'Split-Finger': { cx: -0.2033, cz: 1.7588 }, 'Knuckle Curve': { cx: 0.1178, cz: 1.6719 },
    'Sweeper': { cx: 0.2660, cz: 1.9997 }, 'Slurve': { cx: 0.1683, cz: 1.8749 },
  },
}

/**
 * Get league-wide centroid for a pitch type in a given year.
 * Falls back to nearest year if exact year missing.
 * Optional `stand` parameter to get handedness-specific centroid.
 */
export function getLeagueCentroid(pitchName: string, year: number, stand?: 'R' | 'L'): CentroidEntry | undefined {
  const table = stand === 'R' ? CENTROIDS_R_BY_YEAR
    : stand === 'L' ? CENTROIDS_L_BY_YEAR
    : CENTROIDS_BY_YEAR
  const exact = table[year]?.[pitchName]
  if (exact) return exact
  let bestYear: number | undefined
  let bestDist = Infinity
  for (const y of AVAILABLE_YEARS) {
    if (table[y]?.[pitchName] && Math.abs(y - year) < bestDist) {
      bestDist = Math.abs(y - year)
      bestYear = y
    }
  }
  return bestYear != null ? table[bestYear]![pitchName] : undefined
}

export const CENTROIDS_R_BY_YEAR: YearCentroids = {
  2015: {
    '4-Seam Fastball': { cx: 0.105, cz: 2.5481 }, 'Slider': { cx: 0.3614, cz: 1.8745 },
    'Sinker': { cx: -0.0171, cz: 2.3073 }, 'Changeup': { cx: 0.2353, cz: 1.8498 },
    'Curveball': { cx: 0.1972, cz: 1.8424 }, 'Cutter': { cx: 0.2538, cz: 2.234 },
    'Split-Finger': { cx: 0.0299, cz: 1.6543 }, 'Knuckle Curve': { cx: 0.2879, cz: 1.7635 },
  },
  2016: {
    '4-Seam Fastball': { cx: 0.0635, cz: 2.5645 }, 'Slider': { cx: 0.3501, cz: 1.8804 },
    'Sinker': { cx: -0.0464, cz: 2.3351 }, 'Changeup': { cx: 0.1809, cz: 1.8708 },
    'Curveball': { cx: 0.2018, cz: 1.8618 }, 'Cutter': { cx: 0.2638, cz: 2.2257 },
    'Split-Finger': { cx: -0.0348, cz: 1.6961 }, 'Knuckle Curve': { cx: 0.1873, cz: 1.7925 },
    'Sweeper': { cx: 0.2902, cz: 1.9016 },
  },
  2017: {
    '4-Seam Fastball': { cx: 0.1474, cz: 2.6166 }, 'Slider': { cx: 0.4215, cz: 1.8815 },
    'Sinker': { cx: 0.0361, cz: 2.3233 }, 'Changeup': { cx: 0.2898, cz: 1.8629 },
    'Curveball': { cx: 0.2939, cz: 1.8522 }, 'Cutter': { cx: 0.3381, cz: 2.1794 },
    'Split-Finger': { cx: 0.0391, cz: 1.6432 }, 'Knuckle Curve': { cx: 0.2122, cz: 1.845 },
    'Sweeper': { cx: 0.4151, cz: 1.9454 }, 'Slurve': { cx: 0.5293, cz: 1.7505 },
  },
  2018: {
    '4-Seam Fastball': { cx: 0.15, cz: 2.6347 }, 'Slider': { cx: 0.4008, cz: 1.8388 },
    'Sinker': { cx: -0.0042, cz: 2.2953 }, 'Changeup': { cx: 0.3091, cz: 1.8439 },
    'Curveball': { cx: 0.2513, cz: 1.8641 }, 'Cutter': { cx: 0.236, cz: 2.2229 },
    'Split-Finger': { cx: -0.0165, cz: 1.5721 }, 'Knuckle Curve': { cx: 0.2134, cz: 1.7979 },
    'Sweeper': { cx: 0.5359, cz: 1.9395 }, 'Slurve': { cx: 0.5557, cz: 1.7781 },
  },
  2019: {
    '4-Seam Fastball': { cx: 0.1139, cz: 2.686 }, 'Slider': { cx: 0.411, cz: 1.8191 },
    'Sinker': { cx: -0.0561, cz: 2.2874 }, 'Changeup': { cx: 0.2885, cz: 1.8151 },
    'Curveball': { cx: 0.2505, cz: 1.8393 }, 'Cutter': { cx: 0.2283, cz: 2.1906 },
    'Split-Finger': { cx: -0.0409, cz: 1.5662 }, 'Knuckle Curve': { cx: 0.2422, cz: 1.7313 },
    'Sweeper': { cx: 0.5469, cz: 1.888 }, 'Slurve': { cx: 0.498, cz: 1.7523 },
  },
  2020: {
    '4-Seam Fastball': { cx: 0.1137, cz: 2.6973 }, 'Slider': { cx: 0.4046, cz: 1.7977 },
    'Sinker': { cx: -0.0857, cz: 2.289 }, 'Changeup': { cx: 0.2601, cz: 1.8175 },
    'Curveball': { cx: 0.2343, cz: 1.7604 }, 'Cutter': { cx: 0.2434, cz: 2.2465 },
    'Split-Finger': { cx: -0.0263, cz: 1.6526 }, 'Knuckle Curve': { cx: 0.2013, cz: 1.7413 },
    'Sweeper': { cx: 0.4306, cz: 1.8994 },
  },
  2021: {
    '4-Seam Fastball': { cx: 0.1142, cz: 2.7241 }, 'Slider': { cx: 0.3696, cz: 1.8625 },
    'Sinker': { cx: -0.0412, cz: 2.3143 }, 'Changeup': { cx: 0.2951, cz: 1.837 },
    'Curveball': { cx: 0.2325, cz: 1.8174 }, 'Cutter': { cx: 0.2178, cz: 2.2761 },
    'Split-Finger': { cx: 0.0023, cz: 1.6518 }, 'Knuckle Curve': { cx: 0.1839, cz: 1.7541 },
    'Sweeper': { cx: 0.4618, cz: 1.9306 }, 'Slurve': { cx: 0.2881, cz: 1.8114 },
  },
  2022: {
    '4-Seam Fastball': { cx: 0.1051, cz: 2.7952 }, 'Slider': { cx: 0.3674, cz: 1.8537 },
    'Sinker': { cx: -0.1184, cz: 2.3404 }, 'Changeup': { cx: 0.2633, cz: 1.8292 },
    'Curveball': { cx: 0.2017, cz: 1.8497 }, 'Cutter': { cx: 0.2841, cz: 2.2592 },
    'Split-Finger': { cx: -0.1463, cz: 1.6389 }, 'Knuckle Curve': { cx: 0.2323, cz: 1.7835 },
    'Sweeper': { cx: 0.5142, cz: 1.9793 }, 'Slurve': { cx: 0.1886, cz: 1.8463 },
  },
  2023: {
    '4-Seam Fastball': { cx: 0.0931, cz: 2.8033 }, 'Slider': { cx: 0.3407, cz: 1.8691 },
    'Sinker': { cx: -0.1157, cz: 2.3521 }, 'Changeup': { cx: 0.2546, cz: 1.8156 },
    'Curveball': { cx: 0.1756, cz: 1.8281 }, 'Cutter': { cx: 0.2435, cz: 2.2677 },
    'Split-Finger': { cx: -0.0748, cz: 1.6744 }, 'Knuckle Curve': { cx: 0.2663, cz: 1.7168 },
    'Sweeper': { cx: 0.5062, cz: 1.9588 }, 'Slurve': { cx: 0.3289, cz: 1.8483 },
  },
  2024: {
    '4-Seam Fastball': { cx: 0.1178, cz: 2.8452 }, 'Slider': { cx: 0.4088, cz: 1.8872 },
    'Sinker': { cx: -0.077, cz: 2.3587 }, 'Changeup': { cx: 0.3045, cz: 1.8104 },
    'Curveball': { cx: 0.2058, cz: 1.8061 }, 'Cutter': { cx: 0.2681, cz: 2.3155 },
    'Split-Finger': { cx: 0.0728, cz: 1.6596 }, 'Knuckle Curve': { cx: 0.2465, cz: 1.6439 },
    'Sweeper': { cx: 0.5529, cz: 1.9931 }, 'Slurve': { cx: 0.5505, cz: 1.8253 },
  },
  2025: {
    '4-Seam Fastball': { cx: 0.1179, cz: 2.8491 }, 'Slider': { cx: 0.3674, cz: 1.9119 },
    'Sinker': { cx: -0.1025, cz: 2.3735 }, 'Changeup': { cx: 0.2895, cz: 1.8147 },
    'Curveball': { cx: 0.1916, cz: 1.8378 }, 'Cutter': { cx: 0.241, cz: 2.4136 },
    'Split-Finger': { cx: 0.0333, cz: 1.7108 }, 'Knuckle Curve': { cx: 0.2681, cz: 1.6646 },
    'Sweeper': { cx: 0.5093, cz: 1.9908 }, 'Slurve': { cx: 0.4301, cz: 1.8428 },
  },
}

export const CENTROIDS_L_BY_YEAR: YearCentroids = {
  2015: {
    '4-Seam Fastball': { cx: -0.2401, cz: 2.5871 }, 'Slider': { cx: -0.1815, cz: 1.9163 },
    'Sinker': { cx: -0.3486, cz: 2.3408 }, 'Changeup': { cx: -0.5285, cz: 1.8777 },
    'Curveball': { cx: -0.2753, cz: 1.894 }, 'Cutter': { cx: -0.0608, cz: 2.4068 },
    'Split-Finger': { cx: -0.422, cz: 1.7825 }, 'Knuckle Curve': { cx: -0.1514, cz: 1.8428 },
  },
  2016: {
    '4-Seam Fastball': { cx: -0.1978, cz: 2.6057 }, 'Slider': { cx: -0.0962, cz: 1.9231 },
    'Sinker': { cx: -0.3215, cz: 2.3539 }, 'Changeup': { cx: -0.5026, cz: 1.8884 },
    'Curveball': { cx: -0.2305, cz: 1.8939 }, 'Cutter': { cx: -0.0074, cz: 2.3661 },
    'Split-Finger': { cx: -0.4465, cz: 1.7633 }, 'Knuckle Curve': { cx: -0.0822, cz: 1.8186 },
    'Sweeper': { cx: -0.1621, cz: 1.8092 },
  },
  2017: {
    '4-Seam Fastball': { cx: -0.1272, cz: 2.6575 }, 'Slider': { cx: -0.0685, cz: 1.9321 },
    'Sinker': { cx: -0.2439, cz: 2.3784 }, 'Changeup': { cx: -0.454, cz: 1.8809 },
    'Curveball': { cx: -0.1599, cz: 1.9208 }, 'Cutter': { cx: 0.119, cz: 2.298 },
    'Split-Finger': { cx: -0.3787, cz: 1.7617 }, 'Knuckle Curve': { cx: -0.0846, cz: 1.8814 },
    'Sweeper': { cx: -0.1811, cz: 1.9462 }, 'Slurve': { cx: 0.0743, cz: 1.7845 },
  },
  2018: {
    '4-Seam Fastball': { cx: -0.1546, cz: 2.6668 }, 'Slider': { cx: -0.0822, cz: 1.8873 },
    'Sinker': { cx: -0.2388, cz: 2.3152 }, 'Changeup': { cx: -0.47, cz: 1.8596 },
    'Curveball': { cx: -0.159, cz: 1.8913 }, 'Cutter': { cx: 0.0662, cz: 2.3071 },
    'Split-Finger': { cx: -0.4053, cz: 1.6931 }, 'Knuckle Curve': { cx: -0.037, cz: 1.8256 },
    'Sweeper': { cx: -0.1774, cz: 1.9686 }, 'Slurve': { cx: 0.0548, cz: 1.886 },
  },
  2019: {
    '4-Seam Fastball': { cx: -0.135, cz: 2.7194 }, 'Slider': { cx: -0.062, cz: 1.8446 },
    'Sinker': { cx: -0.2265, cz: 2.2999 }, 'Changeup': { cx: -0.4199, cz: 1.8488 },
    'Curveball': { cx: -0.1208, cz: 1.8721 }, 'Cutter': { cx: 0.0077, cz: 2.3038 },
    'Split-Finger': { cx: -0.3347, cz: 1.6792 }, 'Knuckle Curve': { cx: -0.0046, cz: 1.7808 },
    'Sweeper': { cx: -0.0889, cz: 1.9311 }, 'Slurve': { cx: -0.0927, cz: 1.8686 },
  },
  2020: {
    '4-Seam Fastball': { cx: -0.1257, cz: 2.7386 }, 'Slider': { cx: 0.0231, cz: 1.8522 },
    'Sinker': { cx: -0.1543, cz: 2.3207 }, 'Changeup': { cx: -0.3983, cz: 1.8494 },
    'Curveball': { cx: -0.0558, cz: 1.7901 }, 'Cutter': { cx: 0.0986, cz: 2.385 },
    'Split-Finger': { cx: -0.3291, cz: 1.7376 }, 'Knuckle Curve': { cx: 0.0427, cz: 1.7714 },
    'Sweeper': { cx: -0.1534, cz: 1.8974 },
  },
  2021: {
    '4-Seam Fastball': { cx: -0.1486, cz: 2.7632 }, 'Slider': { cx: -0.0799, cz: 1.9154 },
    'Sinker': { cx: -0.133, cz: 2.3511 }, 'Changeup': { cx: -0.4189, cz: 1.8622 },
    'Curveball': { cx: -0.0806, cz: 1.8522 }, 'Cutter': { cx: 0.096, cz: 2.3826 },
    'Split-Finger': { cx: -0.3537, cz: 1.7342 }, 'Knuckle Curve': { cx: -0.0358, cz: 1.8221 },
    'Sweeper': { cx: -0.2458, cz: 2.0102 }, 'Slurve': { cx: -0.1705, cz: 1.7202 },
  },
  2022: {
    '4-Seam Fastball': { cx: -0.1625, cz: 2.8243 }, 'Slider': { cx: -0.0666, cz: 1.8973 },
    'Sinker': { cx: -0.1344, cz: 2.3735 }, 'Changeup': { cx: -0.4296, cz: 1.8483 },
    'Curveball': { cx: -0.0835, cz: 1.8777 }, 'Cutter': { cx: 0.1278, cz: 2.4831 },
    'Split-Finger': { cx: -0.3454, cz: 1.7147 }, 'Knuckle Curve': { cx: -0.0007, cz: 1.8143 },
    'Sweeper': { cx: -0.1518, cz: 1.9987 }, 'Slurve': { cx: -0.2706, cz: 1.8774 },
  },
  2023: {
    '4-Seam Fastball': { cx: -0.1545, cz: 2.8223 }, 'Slider': { cx: -0.0477, cz: 1.8897 },
    'Sinker': { cx: -0.0915, cz: 2.3779 }, 'Changeup': { cx: -0.4234, cz: 1.8239 },
    'Curveball': { cx: -0.1013, cz: 1.8645 }, 'Cutter': { cx: 0.1125, cz: 2.483 },
    'Split-Finger': { cx: -0.3734, cz: 1.7674 }, 'Knuckle Curve': { cx: -0.0091, cz: 1.7543 },
    'Sweeper': { cx: -0.1841, cz: 2.0219 }, 'Slurve': { cx: -0.2296, cz: 1.8873 },
  },
  2024: {
    '4-Seam Fastball': { cx: -0.1572, cz: 2.8445 }, 'Slider': { cx: -0.0611, cz: 1.9097 },
    'Sinker': { cx: -0.073, cz: 2.3915 }, 'Changeup': { cx: -0.4077, cz: 1.8213 },
    'Curveball': { cx: -0.0959, cz: 1.8508 }, 'Cutter': { cx: 0.0612, cz: 2.5553 },
    'Split-Finger': { cx: -0.3379, cz: 1.7487 }, 'Knuckle Curve': { cx: -0.047, cz: 1.7292 },
    'Sweeper': { cx: -0.1827, cz: 2.0277 }, 'Slurve': { cx: -0.2642, cz: 1.8838 },
  },
  2025: {
    '4-Seam Fastball': { cx: -0.1436, cz: 2.8537 }, 'Slider': { cx: -0.0612, cz: 1.9418 },
    'Sinker': { cx: -0.046, cz: 2.4198 }, 'Changeup': { cx: -0.4074, cz: 1.8276 },
    'Curveball': { cx: -0.0983, cz: 1.8569 }, 'Cutter': { cx: 0.0994, cz: 2.5853 },
    'Split-Finger': { cx: -0.3575, cz: 1.7789 }, 'Knuckle Curve': { cx: -0.0308, cz: 1.6905 },
    'Sweeper': { cx: -0.2099, cz: 2.0164 }, 'Slurve': { cx: -0.1744, cz: 1.9065 },
  },
}

// ── STUFF (Stuff+ model — XGBoost-predicted run value, pitcher-level aggregated) ──
// Placeholder baselines — will be populated after running train.py
// These are mean/stddev of pitcher-level avg stuff_rv per pitch_type per year
export const STUFF_LEAGUE_BY_YEAR: YearLeague = {
  2015: {
    '4-Seam Fastball': { mean: -0.0050, stddev: 0.0035 }, 'Slider': { mean: -0.0110, stddev: 0.0060 },
    'Sinker': { mean: -0.0040, stddev: 0.0040 }, 'Changeup': { mean: -0.0120, stddev: 0.0055 },
    'Curveball': { mean: -0.0100, stddev: 0.0065 }, 'Cutter': { mean: -0.0060, stddev: 0.0045 },
    'Split-Finger': { mean: -0.0140, stddev: 0.0055 }, 'Knuckle Curve': { mean: -0.0110, stddev: 0.0070 },
  },
  2016: {
    '4-Seam Fastball': { mean: -0.0050, stddev: 0.0035 }, 'Slider': { mean: -0.0110, stddev: 0.0060 },
    'Sinker': { mean: -0.0040, stddev: 0.0040 }, 'Changeup': { mean: -0.0120, stddev: 0.0055 },
    'Curveball': { mean: -0.0100, stddev: 0.0065 }, 'Cutter': { mean: -0.0060, stddev: 0.0045 },
    'Split-Finger': { mean: -0.0140, stddev: 0.0055 }, 'Knuckle Curve': { mean: -0.0110, stddev: 0.0070 },
  },
  2017: {
    '4-Seam Fastball': { mean: -0.0055, stddev: 0.0038 }, 'Slider': { mean: -0.0105, stddev: 0.0058 },
    'Sinker': { mean: -0.0035, stddev: 0.0038 }, 'Changeup': { mean: -0.0110, stddev: 0.0052 },
    'Curveball': { mean: -0.0095, stddev: 0.0062 }, 'Cutter': { mean: -0.0070, stddev: 0.0048 },
    'Sweeper': { mean: -0.0115, stddev: 0.0060 }, 'Split-Finger': { mean: -0.0135, stddev: 0.0058 },
    'Knuckle Curve': { mean: -0.0105, stddev: 0.0065 },
  },
  2018: {
    '4-Seam Fastball': { mean: -0.0055, stddev: 0.0038 }, 'Slider': { mean: -0.0110, stddev: 0.0060 },
    'Sinker': { mean: -0.0038, stddev: 0.0040 }, 'Changeup': { mean: -0.0115, stddev: 0.0055 },
    'Curveball': { mean: -0.0098, stddev: 0.0060 }, 'Cutter': { mean: -0.0065, stddev: 0.0048 },
    'Sweeper': { mean: -0.0110, stddev: 0.0058 }, 'Split-Finger': { mean: -0.0145, stddev: 0.0060 },
    'Knuckle Curve': { mean: -0.0108, stddev: 0.0065 },
  },
  2019: {
    '4-Seam Fastball': { mean: -0.0060, stddev: 0.0040 }, 'Slider': { mean: -0.0115, stddev: 0.0060 },
    'Sinker': { mean: -0.0040, stddev: 0.0040 }, 'Changeup': { mean: -0.0120, stddev: 0.0058 },
    'Curveball': { mean: -0.0105, stddev: 0.0068 }, 'Cutter': { mean: -0.0070, stddev: 0.0050 },
    'Sweeper': { mean: -0.0120, stddev: 0.0058 }, 'Split-Finger': { mean: -0.0140, stddev: 0.0060 },
    'Knuckle Curve': { mean: -0.0112, stddev: 0.0068 },
  },
  2020: {
    '4-Seam Fastball': { mean: -0.0055, stddev: 0.0042 }, 'Slider': { mean: -0.0118, stddev: 0.0065 },
    'Sinker': { mean: -0.0035, stddev: 0.0042 }, 'Changeup': { mean: -0.0112, stddev: 0.0058 },
    'Curveball': { mean: -0.0108, stddev: 0.0072 }, 'Cutter': { mean: -0.0062, stddev: 0.0052 },
    'Sweeper': { mean: -0.0110, stddev: 0.0060 }, 'Split-Finger': { mean: -0.0130, stddev: 0.0062 },
    'Knuckle Curve': { mean: -0.0110, stddev: 0.0070 },
  },
  2021: {
    '4-Seam Fastball': { mean: -0.0052, stddev: 0.0038 }, 'Slider': { mean: -0.0108, stddev: 0.0058 },
    'Sinker': { mean: -0.0030, stddev: 0.0042 }, 'Changeup': { mean: -0.0118, stddev: 0.0055 },
    'Curveball': { mean: -0.0110, stddev: 0.0070 }, 'Cutter': { mean: -0.0055, stddev: 0.0048 },
    'Sweeper': { mean: -0.0105, stddev: 0.0058 }, 'Split-Finger': { mean: -0.0148, stddev: 0.0058 },
    'Knuckle Curve': { mean: -0.0115, stddev: 0.0065 },
  },
  2022: {
    '4-Seam Fastball': { mean: -0.0055, stddev: 0.0040 }, 'Slider': { mean: -0.0110, stddev: 0.0058 },
    'Sinker': { mean: -0.0028, stddev: 0.0040 }, 'Changeup': { mean: -0.0122, stddev: 0.0058 },
    'Curveball': { mean: -0.0100, stddev: 0.0068 }, 'Cutter': { mean: -0.0050, stddev: 0.0045 },
    'Sweeper': { mean: -0.0108, stddev: 0.0058 }, 'Split-Finger': { mean: -0.0140, stddev: 0.0058 },
    'Knuckle Curve': { mean: -0.0108, stddev: 0.0060 },
  },
  2023: {
    '4-Seam Fastball': { mean: -0.0052, stddev: 0.0042 }, 'Slider': { mean: -0.0105, stddev: 0.0058 },
    'Sinker': { mean: -0.0025, stddev: 0.0040 }, 'Changeup': { mean: -0.0120, stddev: 0.0060 },
    'Curveball': { mean: -0.0100, stddev: 0.0068 }, 'Cutter': { mean: -0.0045, stddev: 0.0042 },
    'Sweeper': { mean: -0.0110, stddev: 0.0060 }, 'Split-Finger': { mean: -0.0138, stddev: 0.0060 },
    'Knuckle Curve': { mean: -0.0110, stddev: 0.0065 }, 'Slurve': { mean: -0.0105, stddev: 0.0055 },
  },
  2024: {
    '4-Seam Fastball': { mean: -0.0048, stddev: 0.0042 }, 'Slider': { mean: -0.0100, stddev: 0.0055 },
    'Sinker': { mean: -0.0020, stddev: 0.0040 }, 'Changeup': { mean: -0.0118, stddev: 0.0058 },
    'Curveball': { mean: -0.0098, stddev: 0.0065 }, 'Cutter': { mean: -0.0042, stddev: 0.0042 },
    'Sweeper': { mean: -0.0105, stddev: 0.0058 }, 'Split-Finger': { mean: -0.0132, stddev: 0.0058 },
    'Knuckle Curve': { mean: -0.0112, stddev: 0.0065 }, 'Slurve': { mean: -0.0108, stddev: 0.0055 },
  },
  2025: {
    '4-Seam Fastball': { mean: -0.0045, stddev: 0.0042 }, 'Slider': { mean: -0.0095, stddev: 0.0055 },
    'Sinker': { mean: -0.0018, stddev: 0.0040 }, 'Changeup': { mean: -0.0115, stddev: 0.0058 },
    'Curveball': { mean: -0.0095, stddev: 0.0068 }, 'Cutter': { mean: -0.0040, stddev: 0.0042 },
    'Sweeper': { mean: -0.0100, stddev: 0.0058 }, 'Split-Finger': { mean: -0.0130, stddev: 0.0060 },
    'Knuckle Curve': { mean: -0.0108, stddev: 0.0062 }, 'Slurve': { mean: -0.0100, stddev: 0.0050 },
  },
  2026: {
    '4-Seam Fastball': { mean: -0.0045, stddev: 0.0042 }, 'Slider': { mean: -0.0095, stddev: 0.0055 },
    'Sinker': { mean: -0.0018, stddev: 0.0040 }, 'Changeup': { mean: -0.0115, stddev: 0.0058 },
    'Curveball': { mean: -0.0095, stddev: 0.0068 }, 'Cutter': { mean: -0.0040, stddev: 0.0042 },
    'Sweeper': { mean: -0.0100, stddev: 0.0058 }, 'Split-Finger': { mean: -0.0130, stddev: 0.0060 },
    'Knuckle Curve': { mean: -0.0108, stddev: 0.0062 }, 'Slurve': { mean: -0.0100, stddev: 0.0050 },
  },
}

// ── STUFF+ Z-SCORE BASELINES ───────────────────────────────────────────────────────
// Per pitch_name per year: league-average velo, total movement (inches), and extension.
// Used for client-side Stuff+ fallback when DB stuff_plus is not yet populated.
// Values derived from actual pitch_baselines table (computed from Statcast data).
export type StuffZscoreBaseline = {
  avg_velo: number; std_velo: number
  avg_move: number; std_move: number
  avg_ext:  number; std_ext:  number
}

// Year-specific baselines from pitch_baselines table
const BL_BY_YEAR: Record<number, Record<string, StuffZscoreBaseline>> = {
  2015: {
    '4-Seam Fastball': { avg_velo: 93.13, std_velo: 2.84, avg_move: 18.08, std_move: 3.64, avg_ext: 6.17, std_ext: 0.49 },
    'Sinker':          { avg_velo: 92.14, std_velo: 2.97, avg_move: 17.75, std_move: 3.58, avg_ext: 6.08, std_ext: 0.51 },
    'Cutter':          { avg_velo: 88.37, std_velo: 3.27, avg_move: 10.96, std_move: 4.62, avg_ext: 5.97, std_ext: 0.50 },
    'Slider':          { avg_velo: 84.83, std_velo: 3.39, avg_move: 8.26,  std_move: 4.15, avg_ext: 5.80, std_ext: 0.48 },
    'Sweeper':         { avg_velo: 82.20, std_velo: 1.91, avg_move: 17.30, std_move: 3.55, avg_ext: 5.44, std_ext: 0.44 },
    'Curveball':       { avg_velo: 78.17, std_velo: 4.08, avg_move: 14.78, std_move: 5.60, avg_ext: 5.67, std_ext: 0.54 },
    'Changeup':        { avg_velo: 84.00, std_velo: 3.46, avg_move: 15.84, std_move: 4.32, avg_ext: 6.11, std_ext: 0.55 },
    'Split-Finger':    { avg_velo: 85.01, std_velo: 3.01, avg_move: 12.54, std_move: 4.20, avg_ext: 5.81, std_ext: 0.44 },
    'Knuckle Curve':   { avg_velo: 80.72, std_velo: 3.15, avg_move: 14.90, std_move: 5.00, avg_ext: 5.77, std_ext: 0.58 },
    'Slurve':          { avg_velo: 86.43, std_velo: 1.65, avg_move: 14.11, std_move: 5.95, avg_ext: 6.03, std_ext: 0.32 },
  },
  2016: {
    '4-Seam Fastball': { avg_velo: 93.23, std_velo: 2.79, avg_move: 18.03, std_move: 3.60, avg_ext: 6.20, std_ext: 0.46 },
    'Sinker':          { avg_velo: 92.39, std_velo: 2.83, avg_move: 17.80, std_move: 3.50, avg_ext: 6.13, std_ext: 0.47 },
    'Cutter':          { avg_velo: 88.63, std_velo: 2.91, avg_move: 10.69, std_move: 4.33, avg_ext: 6.02, std_ext: 0.48 },
    'Slider':          { avg_velo: 84.96, std_velo: 3.39, avg_move: 8.38,  std_move: 4.12, avg_ext: 5.86, std_ext: 0.46 },
    'Sweeper':         { avg_velo: 82.38, std_velo: 2.06, avg_move: 16.13, std_move: 4.70, avg_ext: 5.46, std_ext: 0.51 },
    'Curveball':       { avg_velo: 78.02, std_velo: 4.12, avg_move: 15.00, std_move: 5.65, avg_ext: 5.73, std_ext: 0.50 },
    'Changeup':        { avg_velo: 84.17, std_velo: 3.54, avg_move: 15.63, std_move: 4.39, avg_ext: 6.14, std_ext: 0.49 },
    'Split-Finger':    { avg_velo: 84.97, std_velo: 2.97, avg_move: 12.83, std_move: 4.42, avg_ext: 5.78, std_ext: 0.44 },
    'Knuckle Curve':   { avg_velo: 80.64, std_velo: 3.08, avg_move: 15.64, std_move: 4.70, avg_ext: 5.75, std_ext: 0.56 },
    'Slurve':          { avg_velo: 83.43, std_velo: 2.62, avg_move: 16.31, std_move: 4.57, avg_ext: 5.76, std_ext: 0.30 },
  },
  2017: {
    '4-Seam Fastball': { avg_velo: 93.23, std_velo: 2.79, avg_move: 19.50, std_move: 3.59, avg_ext: 6.17, std_ext: 0.48 },
    'Sinker':          { avg_velo: 92.18, std_velo: 2.72, avg_move: 19.19, std_move: 3.71, avg_ext: 6.11, std_ext: 0.49 },
    'Cutter':          { avg_velo: 88.34, std_velo: 2.97, avg_move: 10.76, std_move: 4.66, avg_ext: 5.98, std_ext: 0.47 },
    'Slider':          { avg_velo: 84.54, std_velo: 3.34, avg_move: 8.48,  std_move: 4.43, avg_ext: 5.82, std_ext: 0.46 },
    'Sweeper':         { avg_velo: 81.55, std_velo: 2.22, avg_move: 16.01, std_move: 4.85, avg_ext: 5.55, std_ext: 0.57 },
    'Curveball':       { avg_velo: 77.76, std_velo: 3.92, avg_move: 13.20, std_move: 5.20, avg_ext: 5.71, std_ext: 0.52 },
    'Changeup':        { avg_velo: 84.17, std_velo: 3.48, avg_move: 17.22, std_move: 4.33, avg_ext: 6.11, std_ext: 0.52 },
    'Split-Finger':    { avg_velo: 84.57, std_velo: 2.72, avg_move: 14.45, std_move: 5.07, avg_ext: 5.78, std_ext: 0.44 },
    'Knuckle Curve':   { avg_velo: 80.45, std_velo: 3.33, avg_move: 13.33, std_move: 5.12, avg_ext: 5.65, std_ext: 0.54 },
    'Slurve':          { avg_velo: 83.53, std_velo: 3.52, avg_move: 13.97, std_move: 4.15, avg_ext: 5.74, std_ext: 0.35 },
  },
  2018: {
    '4-Seam Fastball': { avg_velo: 93.15, std_velo: 2.74, avg_move: 17.81, std_move: 2.77, avg_ext: 6.15, std_ext: 0.46 },
    'Sinker':          { avg_velo: 92.20, std_velo: 2.87, avg_move: 18.01, std_move: 2.70, avg_ext: 6.06, std_ext: 0.48 },
    'Cutter':          { avg_velo: 88.60, std_velo: 2.77, avg_move: 9.29,  std_move: 3.31, avg_ext: 5.97, std_ext: 0.44 },
    'Slider':          { avg_velo: 84.45, std_velo: 3.41, avg_move: 7.49,  std_move: 3.93, avg_ext: 5.77, std_ext: 0.44 },
    'Sweeper':         { avg_velo: 81.08, std_velo: 2.53, avg_move: 16.64, std_move: 3.95, avg_ext: 5.62, std_ext: 0.63 },
    'Curveball':       { avg_velo: 78.07, std_velo: 3.63, avg_move: 14.31, std_move: 5.21, avg_ext: 5.65, std_ext: 0.50 },
    'Changeup':        { avg_velo: 84.22, std_velo: 3.39, avg_move: 16.07, std_move: 3.52, avg_ext: 6.07, std_ext: 0.48 },
    'Split-Finger':    { avg_velo: 85.11, std_velo: 2.64, avg_move: 12.54, std_move: 4.19, avg_ext: 5.75, std_ext: 0.43 },
    'Knuckle Curve':   { avg_velo: 80.90, std_velo: 2.95, avg_move: 13.38, std_move: 5.22, avg_ext: 5.71, std_ext: 0.52 },
    'Slurve':          { avg_velo: 83.37, std_velo: 2.73, avg_move: 14.02, std_move: 3.75, avg_ext: 5.66, std_ext: 0.30 },
  },
  2019: {
    '4-Seam Fastball': { avg_velo: 93.39, std_velo: 2.63, avg_move: 17.80, std_move: 2.83, avg_ext: 6.16, std_ext: 0.46 },
    'Sinker':          { avg_velo: 92.52, std_velo: 2.83, avg_move: 17.98, std_move: 2.76, avg_ext: 6.08, std_ext: 0.48 },
    'Cutter':          { avg_velo: 88.43, std_velo: 2.84, avg_move: 9.02,  std_move: 3.19, avg_ext: 5.93, std_ext: 0.45 },
    'Slider':          { avg_velo: 84.73, std_velo: 3.24, avg_move: 7.34,  std_move: 3.84, avg_ext: 5.77, std_ext: 0.45 },
    'Sweeper':         { avg_velo: 81.09, std_velo: 2.92, avg_move: 17.22, std_move: 4.09, avg_ext: 5.63, std_ext: 0.49 },
    'Curveball':       { avg_velo: 78.47, std_velo: 3.49, avg_move: 14.15, std_move: 5.34, avg_ext: 5.67, std_ext: 0.49 },
    'Changeup':        { avg_velo: 84.54, std_velo: 3.44, avg_move: 16.29, std_move: 3.44, avg_ext: 6.07, std_ext: 0.49 },
    'Split-Finger':    { avg_velo: 85.35, std_velo: 2.53, avg_move: 11.98, std_move: 4.27, avg_ext: 5.89, std_ext: 0.37 },
    'Knuckle Curve':   { avg_velo: 80.77, std_velo: 3.17, avg_move: 13.67, std_move: 5.24, avg_ext: 5.71, std_ext: 0.53 },
    'Slurve':          { avg_velo: 82.45, std_velo: 3.34, avg_move: 14.36, std_move: 4.67, avg_ext: 5.66, std_ext: 0.35 },
  },
  2020: {
    '4-Seam Fastball': { avg_velo: 93.36, std_velo: 2.71, avg_move: 18.05, std_move: 2.87, avg_ext: 6.38, std_ext: 0.46 },
    'Sinker':          { avg_velo: 92.66, std_velo: 2.97, avg_move: 18.05, std_move: 2.55, avg_ext: 6.32, std_ext: 0.45 },
    'Cutter':          { avg_velo: 88.22, std_velo: 2.93, avg_move: 9.25,  std_move: 3.35, avg_ext: 6.32, std_ext: 0.42 },
    'Slider':          { avg_velo: 84.41, std_velo: 3.55, avg_move: 7.21,  std_move: 3.84, avg_ext: 6.25, std_ext: 0.46 },
    'Sweeper':         { avg_velo: 80.58, std_velo: 3.19, avg_move: 15.61, std_move: 3.56, avg_ext: 6.31, std_ext: 0.47 },
    'Curveball':       { avg_velo: 78.23, std_velo: 3.79, avg_move: 14.41, std_move: 5.19, avg_ext: 6.23, std_ext: 0.44 },
    'Changeup':        { avg_velo: 84.45, std_velo: 3.43, avg_move: 15.95, std_move: 3.26, avg_ext: 6.30, std_ext: 0.47 },
    'Split-Finger':    { avg_velo: 85.25, std_velo: 2.69, avg_move: 12.80, std_move: 4.04, avg_ext: 6.34, std_ext: 0.39 },
    'Knuckle Curve':   { avg_velo: 81.25, std_velo: 2.90, avg_move: 13.34, std_move: 5.47, avg_ext: 6.20, std_ext: 0.48 },
    'Slurve':          { avg_velo: 82.39, std_velo: 2.23, avg_move: 15.16, std_move: 3.08, avg_ext: 6.14, std_ext: 0.39 },
  },
  2021: {
    '4-Seam Fastball': { avg_velo: 93.70, std_velo: 2.52, avg_move: 18.22, std_move: 2.82, avg_ext: 6.37, std_ext: 0.44 },
    'Sinker':          { avg_velo: 92.98, std_velo: 3.01, avg_move: 18.09, std_move: 2.69, avg_ext: 6.30, std_ext: 0.46 },
    'Cutter':          { avg_velo: 88.65, std_velo: 3.41, avg_move: 9.20,  std_move: 3.41, avg_ext: 6.28, std_ext: 0.39 },
    'Slider':          { avg_velo: 84.86, std_velo: 3.34, avg_move: 7.45,  std_move: 3.99, avg_ext: 6.26, std_ext: 0.45 },
    'Sweeper':         { avg_velo: 81.21, std_velo: 3.44, avg_move: 15.17, std_move: 3.90, avg_ext: 6.27, std_ext: 0.47 },
    'Curveball':       { avg_velo: 78.48, std_velo: 3.84, avg_move: 14.40, std_move: 5.09, avg_ext: 6.22, std_ext: 0.41 },
    'Changeup':        { avg_velo: 84.81, std_velo: 3.48, avg_move: 16.27, std_move: 3.22, avg_ext: 6.30, std_ext: 0.45 },
    'Split-Finger':    { avg_velo: 85.73, std_velo: 2.92, avg_move: 12.09, std_move: 4.00, avg_ext: 6.30, std_ext: 0.41 },
    'Knuckle Curve':   { avg_velo: 80.98, std_velo: 3.18, avg_move: 13.66, std_move: 5.11, avg_ext: 6.22, std_ext: 0.46 },
    'Slurve':          { avg_velo: 82.66, std_velo: 2.21, avg_move: 14.81, std_move: 3.32, avg_ext: 5.93, std_ext: 0.37 },
  },
  2022: {
    '4-Seam Fastball': { avg_velo: 93.92, std_velo: 2.54, avg_move: 18.29, std_move: 2.82, avg_ext: 6.39, std_ext: 0.43 },
    'Sinker':          { avg_velo: 93.33, std_velo: 2.89, avg_move: 17.89, std_move: 2.75, avg_ext: 6.33, std_ext: 0.44 },
    'Cutter':          { avg_velo: 89.07, std_velo: 3.38, avg_move: 9.39,  std_move: 3.31, avg_ext: 6.29, std_ext: 0.38 },
    'Slider':          { avg_velo: 85.14, std_velo: 3.25, avg_move: 7.39,  std_move: 3.90, avg_ext: 6.27, std_ext: 0.45 },
    'Sweeper':         { avg_velo: 81.59, std_velo: 3.15, avg_move: 15.05, std_move: 3.87, avg_ext: 6.27, std_ext: 0.46 },
    'Curveball':       { avg_velo: 78.68, std_velo: 3.60, avg_move: 14.59, std_move: 4.95, avg_ext: 6.23, std_ext: 0.41 },
    'Changeup':        { avg_velo: 85.33, std_velo: 3.39, avg_move: 16.24, std_move: 3.17, avg_ext: 6.34, std_ext: 0.44 },
    'Split-Finger':    { avg_velo: 87.07, std_velo: 2.98, avg_move: 12.76, std_move: 3.98, avg_ext: 6.32, std_ext: 0.40 },
    'Knuckle Curve':   { avg_velo: 81.64, std_velo: 3.41, avg_move: 12.98, std_move: 5.46, avg_ext: 6.31, std_ext: 0.45 },
    'Slurve':          { avg_velo: 82.59, std_velo: 2.39, avg_move: 15.30, std_move: 3.31, avg_ext: 5.94, std_ext: 0.36 },
  },
  2023: {
    '4-Seam Fastball': { avg_velo: 94.16, std_velo: 2.47, avg_move: 17.90, std_move: 2.66, avg_ext: 6.51, std_ext: 0.45 },
    'Sinker':          { avg_velo: 93.39, std_velo: 2.92, avg_move: 17.66, std_move: 2.77, avg_ext: 6.43, std_ext: 0.46 },
    'Cutter':          { avg_velo: 89.21, std_velo: 3.33, avg_move: 8.98,  std_move: 3.24, avg_ext: 6.37, std_ext: 0.40 },
    'Slider':          { avg_velo: 85.45, std_velo: 3.13, avg_move: 7.08,  std_move: 3.90, avg_ext: 6.41, std_ext: 0.46 },
    'Sweeper':         { avg_velo: 81.60, std_velo: 3.01, avg_move: 14.92, std_move: 3.78, avg_ext: 6.44, std_ext: 0.49 },
    'Curveball':       { avg_velo: 79.02, std_velo: 3.63, avg_move: 14.48, std_move: 5.04, avg_ext: 6.36, std_ext: 0.46 },
    'Changeup':        { avg_velo: 85.43, std_velo: 3.40, avg_move: 16.09, std_move: 3.19, avg_ext: 6.46, std_ext: 0.46 },
    'Split-Finger':    { avg_velo: 86.71, std_velo: 3.27, avg_move: 12.31, std_move: 3.89, avg_ext: 6.43, std_ext: 0.44 },
    'Knuckle Curve':   { avg_velo: 81.97, std_velo: 3.45, avg_move: 12.22, std_move: 5.19, avg_ext: 6.34, std_ext: 0.43 },
    'Slurve':          { avg_velo: 82.28, std_velo: 2.48, avg_move: 15.15, std_move: 3.79, avg_ext: 6.02, std_ext: 0.39 },
  },
  2024: {
    '4-Seam Fastball': { avg_velo: 94.29, std_velo: 2.46, avg_move: 18.01, std_move: 2.69, avg_ext: 6.53, std_ext: 0.44 },
    'Sinker':          { avg_velo: 93.29, std_velo: 2.77, avg_move: 17.47, std_move: 2.68, avg_ext: 6.43, std_ext: 0.47 },
    'Cutter':          { avg_velo: 89.54, std_velo: 3.14, avg_move: 9.26,  std_move: 3.29, avg_ext: 6.40, std_ext: 0.43 },
    'Slider':          { avg_velo: 85.73, std_velo: 3.01, avg_move: 6.76,  std_move: 3.58, avg_ext: 6.44, std_ext: 0.46 },
    'Sweeper':         { avg_velo: 81.85, std_velo: 2.97, avg_move: 14.95, std_move: 3.63, avg_ext: 6.41, std_ext: 0.47 },
    'Curveball':       { avg_velo: 79.40, std_velo: 3.40, avg_move: 14.25, std_move: 4.78, avg_ext: 6.41, std_ext: 0.46 },
    'Changeup':        { avg_velo: 85.45, std_velo: 3.37, avg_move: 15.87, std_move: 3.24, avg_ext: 6.45, std_ext: 0.46 },
    'Split-Finger':    { avg_velo: 86.53, std_velo: 3.24, avg_move: 11.92, std_move: 3.80, avg_ext: 6.51, std_ext: 0.44 },
    'Knuckle Curve':   { avg_velo: 81.90, std_velo: 3.51, avg_move: 12.57, std_move: 5.33, avg_ext: 6.41, std_ext: 0.39 },
    'Slurve':          { avg_velo: 81.90, std_velo: 2.47, avg_move: 14.58, std_move: 4.07, avg_ext: 6.19, std_ext: 0.38 },
  },
  2025: {
    '4-Seam Fastball': { avg_velo: 94.50, std_velo: 2.53, avg_move: 18.13, std_move: 2.59, avg_ext: 6.51, std_ext: 0.44 },
    'Sinker':          { avg_velo: 93.80, std_velo: 2.80, avg_move: 17.69, std_move: 2.64, avg_ext: 6.40, std_ext: 0.45 },
    'Cutter':          { avg_velo: 89.73, std_velo: 2.99, avg_move: 9.24,  std_move: 3.30, avg_ext: 6.37, std_ext: 0.39 },
    'Slider':          { avg_velo: 86.13, std_velo: 3.14, avg_move: 6.54,  std_move: 3.56, avg_ext: 6.41, std_ext: 0.46 },
    'Sweeper':         { avg_velo: 82.49, std_velo: 2.96, avg_move: 14.43, std_move: 3.66, avg_ext: 6.35, std_ext: 0.43 },
    'Curveball':       { avg_velo: 79.71, std_velo: 3.68, avg_move: 14.55, std_move: 4.59, avg_ext: 6.36, std_ext: 0.47 },
    'Changeup':        { avg_velo: 85.84, std_velo: 3.68, avg_move: 15.83, std_move: 3.15, avg_ext: 6.44, std_ext: 0.44 },
    'Split-Finger':    { avg_velo: 86.45, std_velo: 3.51, avg_move: 12.56, std_move: 3.83, avg_ext: 6.56, std_ext: 0.42 },
    'Knuckle Curve':   { avg_velo: 82.85, std_velo: 3.78, avg_move: 12.44, std_move: 5.41, avg_ext: 6.36, std_ext: 0.39 },
    'Slurve':          { avg_velo: 81.82, std_velo: 2.46, avg_move: 13.97, std_move: 4.35, avg_ext: 6.15, std_ext: 0.44 },
  },
  2026: {
    '4-Seam Fastball': { avg_velo: 94.20, std_velo: 2.40, avg_move: 17.55, std_move: 2.74, avg_ext: 6.41, std_ext: 0.43 },
    'Sinker':          { avg_velo: 93.49, std_velo: 2.81, avg_move: 17.41, std_move: 2.58, avg_ext: 6.32, std_ext: 0.46 },
    'Cutter':          { avg_velo: 88.95, std_velo: 2.91, avg_move: 8.54,  std_move: 3.35, avg_ext: 6.34, std_ext: 0.42 },
    'Slider':          { avg_velo: 85.32, std_velo: 3.17, avg_move: 6.92,  std_move: 3.82, avg_ext: 6.28, std_ext: 0.45 },
    'Sweeper':         { avg_velo: 81.99, std_velo: 2.97, avg_move: 14.22, std_move: 3.94, avg_ext: 6.25, std_ext: 0.48 },
    'Curveball':       { avg_velo: 79.95, std_velo: 3.16, avg_move: 13.64, std_move: 4.37, avg_ext: 6.30, std_ext: 0.42 },
    'Changeup':        { avg_velo: 85.59, std_velo: 3.41, avg_move: 14.91, std_move: 3.56, avg_ext: 6.35, std_ext: 0.43 },
    'Split-Finger':    { avg_velo: 85.33, std_velo: 3.18, avg_move: 11.61, std_move: 3.87, avg_ext: 6.45, std_ext: 0.46 },
    'Knuckle Curve':   { avg_velo: 82.98, std_velo: 3.76, avg_move: 10.92, std_move: 5.50, avg_ext: 6.23, std_ext: 0.46 },
    'Slurve':          { avg_velo: 81.88, std_velo: 2.36, avg_move: 12.71, std_move: 4.06, avg_ext: 6.22, std_ext: 0.60 },
  },
}

// Default baselines (latest year) for when year is unknown
export const STUFF_ZSCORE_BASELINES = BL_BY_YEAR[2026]

/**
 * Get year-specific baselines for a pitch type. Falls back to nearest available year.
 */
function getStuffBaseline(pitchName: string, year?: number): StuffZscoreBaseline | undefined {
  if (year != null && BL_BY_YEAR[year]?.[pitchName]) return BL_BY_YEAR[year][pitchName]
  // Fall back to nearest year
  if (year != null) {
    const years = Object.keys(BL_BY_YEAR).map(Number).sort((a, b) => Math.abs(a - year) - Math.abs(b - year))
    for (const y of years) {
      if (BL_BY_YEAR[y]?.[pitchName]) return BL_BY_YEAR[y][pitchName]
    }
  }
  return STUFF_ZSCORE_BASELINES[pitchName]
}

/**
 * Client-side Stuff+ fallback using Z-score formula (mirrors DB pipeline).
 * Returns a 0-200 scale value (100 = league average for that pitch type in that year).
 * Returns null if required features are missing or pitch type is unknown.
 */
export function computeStuffRV(p: any): number | null {
  const bl = getStuffBaseline(p.pitch_name as string, p.game_year)
  if (!bl) return null
  if (p.release_speed == null || p.pfx_x == null || p.pfx_z == null) return null

  const move = Math.sqrt(Math.pow(p.pfx_x * 12, 2) + Math.pow(p.pfx_z * 12, 2))
  const ext = p.release_extension ?? bl.avg_ext

  const veloZ = (p.release_speed - bl.avg_velo) / bl.std_velo
  const moveZ = (move - bl.avg_move) / bl.std_move
  const extZ  = (ext - bl.avg_ext) / bl.std_ext

  const raw = 100 + veloZ * 4.5 + moveZ * 3.5 + extZ * 2.0
  return Math.max(0, Math.min(200, Math.round(raw)))
}

// ── METRIC TABLE MAP ─────────────────────────────────────────────────────────
const METRIC_TABLES: Record<MetricName, YearLeague> = {
  brink: BRINK_LEAGUE_BY_YEAR,
  cluster: CLUSTER_LEAGUE_BY_YEAR,
  cluster_r: CLUSTER_R_LEAGUE_BY_YEAR,
  cluster_l: CLUSTER_L_LEAGUE_BY_YEAR,
  hdev: HDEV_LEAGUE_BY_YEAR,
  vdev: VDEV_LEAGUE_BY_YEAR,
  missfire: MISSFIRE_LEAGUE_BY_YEAR,
  stuff: STUFF_LEAGUE_BY_YEAR,
  close_pct: CLOSE_PCT_LEAGUE_BY_YEAR,
}

// Available years in the data, sorted
const AVAILABLE_YEARS = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]

/**
 * Get year-specific league baseline for a metric+pitchName combo.
 * Falls back to nearest available year if exact year is missing.
 * Returns undefined if pitch type has no data in any year.
 */
export function getLeagueBaseline(
  metric: MetricName,
  pitchName: string,
  year?: number
): LeagueEntry | undefined {
  const table = METRIC_TABLES[metric]
  if (!table) return undefined

  // If year provided, try exact match
  if (year != null) {
    const exact = table[year]?.[pitchName]
    if (exact) return exact

    // Fall back to nearest year that has this pitch type
    let bestYear: number | undefined
    let bestDist = Infinity
    for (const y of AVAILABLE_YEARS) {
      if (table[y]?.[pitchName] && Math.abs(y - year) < bestDist) {
        bestDist = Math.abs(y - year)
        bestYear = y
      }
    }
    if (bestYear != null) return table[bestYear]![pitchName]
  }

  // No year: average across all available years for this pitch type
  let sum_mean = 0, sum_stddev = 0, count = 0
  for (const y of AVAILABLE_YEARS) {
    const entry = table[y]?.[pitchName]
    if (entry) { sum_mean += entry.mean; sum_stddev += entry.stddev; count++ }
  }
  if (count === 0) return undefined
  return { mean: sum_mean / count, stddev: sum_stddev / count }
}

// ── Legacy flat exports (for backward compat — averaged across all years) ────
// These are used nowhere now but kept for safety during migration
export const BRINK_LEAGUE: Record<string, LeagueEntry> = _buildPooled(BRINK_LEAGUE_BY_YEAR)
export const CLUSTER_LEAGUE: Record<string, LeagueEntry> = _buildPooled(CLUSTER_LEAGUE_BY_YEAR)
export const HDEV_LEAGUE: Record<string, LeagueEntry> = _buildPooled(HDEV_LEAGUE_BY_YEAR)
export const VDEV_LEAGUE: Record<string, LeagueEntry> = _buildPooled(VDEV_LEAGUE_BY_YEAR)
export const MISSFIRE_LEAGUE: Record<string, LeagueEntry> = _buildPooled(MISSFIRE_LEAGUE_BY_YEAR)
export const CLOSE_PCT_LEAGUE: Record<string, LeagueEntry> = _buildPooled(CLOSE_PCT_LEAGUE_BY_YEAR)

function _buildPooled(table: YearLeague): Record<string, LeagueEntry> {
  const pitchSet = new Set<string>()
  for (const y of AVAILABLE_YEARS) {
    if (table[y]) for (const p of Object.keys(table[y])) pitchSet.add(p)
  }
  const result: Record<string, LeagueEntry> = {}
  for (const p of pitchSet) {
    let sm = 0, ss = 0, n = 0
    for (const y of AVAILABLE_YEARS) {
      const e = table[y]?.[p]
      if (e) { sm += e.mean; ss += e.stddev; n++ }
    }
    if (n > 0) result[p] = { mean: sm / n, stddev: ss / n }
  }
  return result
}

// Savant-style percentile breakpoints [p10, p25, p50, p75, p90]
export const SAVANT_PERCENTILES: Record<string, { label: string; percentiles: number[]; higherBetter: boolean; unit: string }> = {
  avg_velo:   { label: 'Avg Velocity',  unit: 'mph', percentiles: [88.5, 90.8, 93.2, 95.1, 97.0], higherBetter: true },
  max_velo:   { label: 'Max Velocity',  unit: 'mph', percentiles: [91.2, 93.5, 96.0, 97.8, 99.5], higherBetter: true },
  k_pct:      { label: 'K%',            unit: '%',   percentiles: [16.4, 18.9, 21.9, 25.0, 28.4], higherBetter: true },
  bb_pct:     { label: 'BB%',           unit: '%',   percentiles: [6.2, 7.4, 9.0, 10.8, 12.8],    higherBetter: false },
  whiff_pct:  { label: 'Whiff%',        unit: '%',   percentiles: [18.0, 22.0, 26.0, 31.0, 36.0], higherBetter: true },
  chase_pct:  { label: 'Chase%',        unit: '%',   percentiles: [24.0, 27.0, 30.0, 34.0, 38.0], higherBetter: true },
  barrel_pct: { label: 'Barrel%',       unit: '%',   percentiles: [0.7, 1.1, 1.5, 1.8, 2.3],      higherBetter: false },
  hard_hit:   { label: 'Hard Hit%',     unit: '%',   percentiles: [20.3, 22.2, 24.1, 26.3, 28.7], higherBetter: false },
  avg_ev:     { label: 'Avg EV',        unit: 'mph', percentiles: [81.1, 81.9, 82.6, 83.4, 84.1], higherBetter: false },
  xba:        { label: 'xBA',           unit: '',    percentiles: [0.295, 0.308, 0.319, 0.330, 0.344], higherBetter: false },
  gb_pct:     { label: 'GB%',           unit: '%',   percentiles: [16.5, 19.0, 22.2, 25.6, 29.6], higherBetter: true },
  avg_spin:   { label: 'Spin Rate',     unit: 'rpm', percentiles: [2050, 2180, 2320, 2450, 2600],  higherBetter: true },
  extension:  { label: 'Extension',     unit: 'ft',  percentiles: [5.8, 6.1, 6.3, 6.6, 6.9],      higherBetter: true },
  ivb_ff:     { label: 'IVB (FF)',      unit: 'in',  percentiles: [12.0, 14.0, 16.0, 18.0, 20.5], higherBetter: true },
  vaa_ff:     { label: 'VAA (FF)',      unit: '°',   percentiles: [-6.8, -6.2, -5.5, -4.9, -4.2], higherBetter: true },
  unique_score:     { label: 'Unique',      unit: 'z',  percentiles: [0.44, 0.56, 0.73, 0.93, 1.21], higherBetter: true },
  deception_score:  { label: 'Deception',   unit: 'z',  percentiles: [-0.45, -0.22, 0.02, 0.25, 0.48], higherBetter: true },
  xdeception_score: { label: 'xDeception',  unit: 'z',  percentiles: [-1.31, -0.58, -0.03, 0.58, 1.11], higherBetter: true },
}

export function computePercentile(value: number, percentiles: number[], higherBetter: boolean): number {
  const pcts = [10, 25, 50, 75, 90]
  const vals = higherBetter ? percentiles : [...percentiles].reverse()
  const pctsUsed = higherBetter ? pcts : [90, 75, 50, 25, 10]

  if (value <= vals[0]) return pctsUsed[0]
  if (value >= vals[vals.length - 1]) return pctsUsed[pctsUsed.length - 1]

  for (let i = 0; i < vals.length - 1; i++) {
    if (value >= vals[i] && value <= vals[i + 1]) {
      const frac = (value - vals[i]) / (vals[i + 1] - vals[i])
      return pctsUsed[i] + frac * (pctsUsed[i + 1] - pctsUsed[i])
    }
  }
  return 50
}

export function percentileColor(pct: number): string {
  // blue (0) → light gray (50) → red (100)
  if (pct <= 50) {
    // Blue to gray: at 0 = saturated blue, at 50 = light gray
    const t = pct / 50 // 0→1
    const r = Math.round(50 + t * 150)   // 50 → 200
    const g = Math.round(80 + t * 120)   // 80 → 200
    const b = Math.round(220 - t * 20)   // 220 → 200
    return `rgb(${r},${g},${b})`
  } else {
    // Gray to red: at 50 = light gray, at 100 = saturated red
    const t = (pct - 50) / 50 // 0→1
    const r = Math.round(200 + t * 30)   // 200 → 230
    const g = Math.round(200 - t * 140)  // 200 → 60
    const b = Math.round(200 - t * 150)  // 200 → 50
    return `rgb(${r},${g},${b})`
  }
}

export function computePlus(pitcherAvg: number, leagueMean: number, leagueStddev: number): number {
  return ((pitcherAvg - leagueMean) / leagueStddev) * 15 + 100
}

// Normal CDF approximation (Abramowitz & Stegun)
export function normalCDF(z: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911
  const sign = z < 0 ? -1 : 1
  const x = Math.abs(z) / Math.SQRT2
  const t = 1.0 / (1.0 + p * x)
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x)
  return 0.5 * (1.0 + sign * y)
}

/** Convert a plus stat to a league percentile rank (1–99) */
export function plusToPercentile(plus: number): number {
  const z = (plus - 100) / 10
  return Math.max(1, Math.min(99, Math.round(normalCDF(z) * 100)))
}

/** Convert a raw value to a 1-99 percentile using dynamic league baselines */
export function valueToPercentile(
  value: number,
  mean: number,
  stddev: number,
  higherBetter: boolean
): number {
  if (stddev <= 0) return 50
  const plus = ((value - mean) / stddev) * 15 + 100
  const adjusted = higherBetter ? plus : 200 - plus
  return plusToPercentile(adjusted)
}

/** Metric display metadata (labels + units) — replaces SAVANT_PERCENTILES for display purposes */
export const METRIC_META: Record<string, { label: string; unit: string }> = {
  avg_velo: { label: 'Avg Velocity', unit: 'mph' },
  max_velo: { label: 'Max Velocity', unit: 'mph' },
  k_pct: { label: 'K%', unit: '%' },
  bb_pct: { label: 'BB%', unit: '%' },
  whiff_pct: { label: 'Whiff%', unit: '%' },
  chase_pct: { label: 'Chase%', unit: '%' },
  barrel_pct: { label: 'Barrel%', unit: '%' },
  hard_hit: { label: 'Hard Hit%', unit: '%' },
  avg_ev: { label: 'Avg EV', unit: 'mph' },
  xba: { label: 'xBA', unit: '' },
  gb_pct: { label: 'GB%', unit: '%' },
  avg_spin: { label: 'Spin Rate', unit: 'rpm' },
  extension: { label: 'Extension', unit: 'ft' },
  ivb_ff: { label: 'IVB (FF)', unit: 'in' },
  vaa_ff: { label: 'VAA (FF)', unit: '°' },
  unique_score: { label: 'Unique', unit: 'z' },
  deception_score: { label: 'Deception', unit: 'z' },
}

/** Ordered list of metric keys for consistent display */
export const METRIC_ORDER = [
  'avg_velo', 'max_velo', 'k_pct', 'bb_pct', 'whiff_pct', 'chase_pct',
  'barrel_pct', 'hard_hit', 'avg_ev', 'xba', 'gb_pct',
  'avg_spin', 'extension', 'ivb_ff', 'vaa_ff',
  'unique_score', 'deception_score',
]

// Command+ weights — theory-weighted, 3 non-redundant components
// (Cluster+ subsumes HDev+/VDev+ so they are dropped)
export const COMMAND_WEIGHTS = { brinkPlus: 0.60, clusterPlus: 0.17, missfirePlus: 0.23 }

// RPCom+ weights — outcome-weighted from |corr| with xwOBA-against
// (pitcher×pitch_type level, 2020–2025, min 50 pitches, n=5680)
export const RPCOM_WEIGHTS = { brinkPlus: 0.31, clusterPlus: 0.16, hdevPlus: 0.09, vdevPlus: 0.15, missfirePlus: 0.29 }

/**
 * Compute a year-weighted plus stat for a set of pitches.
 * Groups pitches by game_year, computes the metric per year-group,
 * looks up the year-specific league baseline, and usage-weights the result.
 */
export function computeYearWeightedPlus(
  pitches: any[],
  pitchName: string,
  metric: MetricName,
  valueFn: (pts: any[]) => number | null,
  invert: boolean = false
): number | null {
  const yearGroups: Record<number, any[]> = {}
  pitches.forEach((p: any) => {
    const y = p.game_year
    if (y != null) { if (!yearGroups[y]) yearGroups[y] = []; yearGroups[y].push(p) }
  })
  let wtSum = 0, wt = 0
  for (const [yStr, yPts] of Object.entries(yearGroups)) {
    const year = Number(yStr)
    const avg = valueFn(yPts)
    const bl = getLeagueBaseline(metric, pitchName, year)
    if (avg != null && bl) {
      let plus = computePlus(avg, bl.mean, bl.stddev)
      if (invert) plus = 100 - (plus - 100)
      wtSum += plus * yPts.length
      wt += yPts.length
    }
  }
  return wt > 0 ? Math.round(wtSum / wt) : null
}

export function computeCommandPlus(brinkPlus: number, clusterPlus: number, missfirePlus: number): number {
  return Math.round(
    COMMAND_WEIGHTS.brinkPlus * brinkPlus +
    COMMAND_WEIGHTS.clusterPlus * clusterPlus +
    COMMAND_WEIGHTS.missfirePlus * missfirePlus
  )
}

export function computeRPComPlus(brinkPlus: number, clusterPlus: number, hdevPlus: number, vdevPlus: number, missfirePlus: number): number {
  return Math.round(
    RPCOM_WEIGHTS.brinkPlus * brinkPlus +
    RPCOM_WEIGHTS.clusterPlus * clusterPlus +
    RPCOM_WEIGHTS.hdevPlus * hdevPlus +
    RPCOM_WEIGHTS.vdevPlus * vdevPlus +
    RPCOM_WEIGHTS.missfirePlus * missfirePlus
  )
}

// ── DECEPTION METRICS ────────────────────────────────────────────────────────

const FASTBALL_TYPES = new Set(['FF', 'SI', 'FC', '4-Seam Fastball', 'Sinker', 'Cutter'])

// Unique weights (absolute z-scores)
const FB_UNIQUE_W = { vaa: 0.25, vb: 0.15, hb: 0.20, haa: 0.20, ext: 0.20 }
const OS_UNIQUE_W = { vaa: 0.30, vb: 0.20, hb: 0.25, haa: 0.25 }

// Deception weights (signed z-scores)
const FB_DECEPTION_W = { vaa: -0.25, ext: 0.35, vb: 0.20, hb: -0.10, haa: -0.10 }
const OS_DECEPTION_W = { vaa: 0.35, ext: 0.25, vb: 0.20, hb: -0.10, haa: 0.10 }

// xDeception regression coefficients
const XD_COEFF = {
  fb_vaa: -1.2219, fb_haa: -0.2740, fb_vb: 0.3830, fb_hb: -0.2684, fb_ext: -0.8779,
  os_vaa: 1.1265, os_haa: 0.3900, os_vb: 0.0947, os_hb: -0.2621, os_ext: 1.2845,
}

export function isFastball(pitchType: string): boolean {
  return FASTBALL_TYPES.has(pitchType)
}

export interface ZScores {
  vaa: number | null
  haa: number | null
  vb: number | null
  hb: number | null
  ext: number | null
}

export function computeUniqueScore(zScores: ZScores, fb: boolean): number | null {
  if (fb) {
    if (zScores.vaa == null || zScores.vb == null || zScores.hb == null || zScores.haa == null || zScores.ext == null) return null
    return FB_UNIQUE_W.vaa * Math.abs(zScores.vaa) +
      FB_UNIQUE_W.vb * Math.abs(zScores.vb) +
      FB_UNIQUE_W.hb * Math.abs(zScores.hb) +
      FB_UNIQUE_W.haa * Math.abs(zScores.haa) +
      FB_UNIQUE_W.ext * Math.abs(zScores.ext)
  } else {
    if (zScores.vaa == null || zScores.vb == null || zScores.hb == null || zScores.haa == null) return null
    return OS_UNIQUE_W.vaa * Math.abs(zScores.vaa) +
      OS_UNIQUE_W.vb * Math.abs(zScores.vb) +
      OS_UNIQUE_W.hb * Math.abs(zScores.hb) +
      OS_UNIQUE_W.haa * Math.abs(zScores.haa)
  }
}

export function computeDeceptionScore(zScores: ZScores, fb: boolean): number | null {
  if (fb) {
    if (zScores.vaa == null || zScores.vb == null || zScores.hb == null || zScores.haa == null || zScores.ext == null) return null
    return FB_DECEPTION_W.vaa * zScores.vaa +
      FB_DECEPTION_W.ext * zScores.ext +
      FB_DECEPTION_W.vb * zScores.vb +
      FB_DECEPTION_W.hb * zScores.hb +
      FB_DECEPTION_W.haa * zScores.haa
  } else {
    if (zScores.vaa == null || zScores.vb == null || zScores.hb == null || zScores.haa == null) return null
    return OS_DECEPTION_W.vaa * zScores.vaa +
      (zScores.ext != null ? OS_DECEPTION_W.ext * zScores.ext : 0) +
      OS_DECEPTION_W.vb * zScores.vb +
      OS_DECEPTION_W.hb * zScores.hb +
      OS_DECEPTION_W.haa * zScores.haa
  }
}

// ── PLUS-TO-GRADE CONVERSION ─────────────────────────────────────────────────

export function plusToGrade(plus: number): string {
  if (plus >= 110) return 'A+'
  if (plus >= 107) return 'A'
  if (plus >= 105) return 'A-'
  if (plus >= 104) return 'B+'
  if (plus >= 103) return 'B'
  if (plus >= 102) return 'B-'
  if (plus >= 101) return 'C+'
  if (plus >= 97) return 'C'
  if (plus >= 92) return 'C-'
  if (plus >= 87) return 'D+'
  if (plus >= 81) return 'D'
  if (plus >= 76) return 'D-'
  return 'F'
}

export function gradeColor(grade: string): string {
  const letter = grade.charAt(0)
  switch (letter) {
    case 'A': return '#10b981' // emerald
    case 'B': return '#06b6d4' // cyan
    case 'C': return '#f59e0b' // amber
    case 'D': return '#f97316' // orange
    case 'F': return '#ef4444' // red
    default: return '#a1a1aa'
  }
}

export function computeXDeceptionScore(
  fbZ: { vaa: number; haa: number; vb: number; hb: number; ext: number },
  osZ: { vaa: number; haa: number; vb: number; hb: number; ext: number }
): number {
  return XD_COEFF.fb_vaa * fbZ.vaa + XD_COEFF.fb_haa * fbZ.haa + XD_COEFF.fb_vb * fbZ.vb +
    XD_COEFF.fb_hb * fbZ.hb + XD_COEFF.fb_ext * fbZ.ext +
    XD_COEFF.os_vaa * osZ.vaa + XD_COEFF.os_haa * osZ.haa + XD_COEFF.os_vb * osZ.vb +
    XD_COEFF.os_hb * osZ.hb + XD_COEFF.os_ext * osZ.ext
}
